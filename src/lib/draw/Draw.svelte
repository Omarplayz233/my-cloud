<script lang="ts">
  import { onMount } from "svelte";
  import {
    IconPencil, IconEraser, IconSquare, IconCircle,
    IconMinus, IconArrowBack, IconArrowForward,
    IconArrowBadgeRight, IconTrash, IconDownload, IconUpload, IconBrush,
    IconTriangle, IconColorPicker, IconBucketDroplet,
    IconLetterT, IconPointer, IconSelector,
    IconGridDots, IconRuler,
  } from "@tabler/icons-svelte";
  import type { Tool, Point, Stroke, Layer, BrushPreset, HistoryEntry, CanvasSettings } from "./types";
  import { BRUSH_PRESETS } from "./presets";
  import { Stabilizer, applyPressureCurve, smoothPath, variableWidthPath, generatePencilPaths, shapeAttrs, escapeXml, minDistFilter } from "./engine";

  let { apiKey }: { apiKey: string } = $props();

  // ── Canvas ──────────────────────────────────────────────────────────
  let svgEl: SVGSVGElement;
  let canvasWrap: HTMLDivElement;
  let w = $state(1200);
  let h = $state(800);

  // ── Zoom / Pan / Rotation ──────────────────────────────────────────
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let panning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let spaceHeld = $state(false);
  let canvasRotation = $state(0);
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 32;
  let wrapW = $state(0);
  let wrapH = $state(0);
  let svgOffsetX = $derived((wrapW - w * zoom) / 2 + panX);
  let svgOffsetY = $derived((wrapH - h * zoom) / 2 + panY);

  // ── Cursor ──────────────────────────────────────────────────────────
  let cursorX = $state(0);
  let cursorY = $state(0);
  let cursorScreenX = $state(0);
  let cursorScreenY = $state(0);
  let pressure = $state(0.5);
  let hovering = $state(false);

  // ── Tools ───────────────────────────────────────────────────────────
  type ToolGroup = "pointer" | "draw" | "shape" | "misc";
  const TOOL_GROUPS: { group: ToolGroup; tools: { id: Tool; label: string; key: string }[] }[] = [
    { group: "pointer", tools: [
      { id: "move", label: "Move (V)", key: "v" },
      { id: "select", label: "Select (M)", key: "m" },
    ]},
    { group: "draw", tools: [
      { id: "brush", label: "Brush (B)", key: "b" },
      { id: "pencil", label: "Pencil (N)", key: "n" },
      { id: "pen", label: "Pen (P)", key: "p" },
      { id: "eraser", label: "Eraser (E)", key: "e" },
    ]},
    { group: "shape", tools: [
      { id: "line", label: "Line (L)", key: "l" },
      { id: "rect", label: "Rectangle (U)", key: "u" },
      { id: "ellipse", label: "Ellipse (O)", key: "o" },
      { id: "arrow", label: "Arrow (A)", key: "a" },
      { id: "triangle", label: "Triangle", key: "" },
    ]},
    { group: "misc", tools: [
      { id: "eyedropper", label: "Eyedropper (I)", key: "i" },
      { id: "fill", label: "Fill Bucket (G)", key: "g" },
      { id: "text", label: "Text (T)", key: "t" },
    ]},
  ];

  let tool = $state<Tool>("brush");

  // ── Brush settings ──────────────────────────────────────────────────
  let activePresetIdx = $state(0);
  let activePreset = $derived(BRUSH_PRESETS[activePresetIdx]);
  let lineWidth = $state(4);
  let opacity = $state(100);
  let hardness = $state(100);
  let smoothing = $state(0.5);
  let taper = $state(0);
  let pressureSize = $state(true);
  let pressureOpacity = $state(true);
  let brushAngle = $state(0);
  let scatter = $state(0);
  let fillShapes = $state(false);
  let fontSize = $state(32);

  function applyPreset(p: BrushPreset) {
    const idx = BRUSH_PRESETS.indexOf(p);
    if (idx >= 0) activePresetIdx = idx;
    lineWidth = p.size;
    hardness = p.hardness;
    opacity = p.opacity;
    smoothing = p.smoothing;
    taper = p.taper;
    pressureSize = p.pressureSize;
    pressureOpacity = p.pressureOpacity;
    brushAngle = p.brushAngle;
    scatter = p.scatter;
    if (p.category === "special" && p.name.includes("Eraser")) tool = "eraser";
    else tool = "brush";
  }

  // ── Colors ──────────────────────────────────────────────────────────
  let fgColor = $state("#ffffff");
  let bgColor2 = $state("#000000");
  let recentColors = $state<string[]>([
    "#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff","#00ffff","#ff8800","#8800ff",
    "#ffffff","#888888","#444444","#000000","#ff4444","#44ff44","#4444ff","#ffaa00",
  ]);
  let colorPanelMode = $state<"fg" | "bg">("fg");

  function swapColors() {
    const tmp = fgColor;
    fgColor = bgColor2;
    bgColor2 = tmp;
  }

  // ── Layers ──────────────────────────────────────────────────────────
  let layers = $state<Layer[]>([
    { id: "bg", name: "Background", visible: true, opacity: 100, strokes: [] },
  ]);
  let activeLayerIdx = $state(0);

  function addLayer() {
    const id = "L" + Date.now().toString(36);
    layers.push({ id, name: `Layer ${layers.length + 1}`, visible: true, opacity: 100, strokes: [] });
    activeLayerIdx = layers.length - 1;
  }

  function removeLayer() {
    if (layers.length <= 1) return;
    layers.splice(activeLayerIdx, 1);
    if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
    layers = [...layers];
  }

  function moveLayerUp() {
    if (activeLayerIdx >= layers.length - 1) return;
    const tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx + 1];
    layers[activeLayerIdx + 1] = tmp;
    activeLayerIdx++;
    layers = [...layers];
  }

  function moveLayerDown() {
    if (activeLayerIdx <= 0) return;
    const tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx - 1];
    layers[activeLayerIdx - 1] = tmp;
    activeLayerIdx--;
    layers = [...layers];
  }

  // ── Canvas settings ─────────────────────────────────────────────────
  let settings = $state<CanvasSettings>({
    showGrid: false,
    gridSize: 50,
    snapToGrid: false,
    showRulers: true,
    checkerBg: true,
    canvasRotation: 0,
  });

  // ── History ─────────────────────────────────────────────────────────
  let undoStack = $state<HistoryEntry[]>([]);
  let redoStack = $state<HistoryEntry[]>([]);
  const MAX_HISTORY = 100;

  function pushHistory(entry: HistoryEntry) {
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack.pop()!;
    const layer = layers.find(l => l.id === entry.layerId);
    if (!layer) return;

    if (entry.action === "stroke") {
      for (const s of entry.strokes) {
        layer.strokes = layer.strokes.filter(st => st.id !== s.id);
      }
      redoStack.push(entry);
    } else if (entry.action === "clear") {
      layer.strokes = entry.strokes;
      redoStack.push(entry);
    }
    layers = [...layers];
  }

  function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop()!;
    const layer = layers.find(l => l.id === entry.layerId);
    if (!layer) return;

    if (entry.action === "stroke") {
      layer.strokes = [...layer.strokes, ...entry.strokes];
      undoStack.push(entry);
    } else if (entry.action === "clear") {
      layer.strokes = [];
      undoStack.push(entry);
    }
    layers = [...layers];
  }

  function clearAll() {
    const entry: HistoryEntry = {
      action: "clear",
      layerId: getActiveLayer().id,
      strokes: [...getActiveLayer().strokes],
    };
    getActiveLayer().strokes = [];
    pushHistory(entry);
    layers = [...layers];
  }

  // ── Strokes ─────────────────────────────────────────────────────────
  let drawing = $state(false);
  let currentStroke = $state<Stroke | null>(null);
  let currentPoints = $state<Point[]>([]);
  let currentPencilPaths = $state<string[]>([]);
  let currentVWPath = $state("");
  let shiftHeld = $state(false);
  let stabilizer = new Stabilizer(20, 0.6);

  function getActiveLayer(): Layer {
    return layers[activeLayerIdx] ?? layers[0];
  }

  // ── SVG coords ──────────────────────────────────────────────────────
  function svgPoint(e: PointerEvent): Point {
    const rect = canvasWrap.getBoundingClientRect();
    const ox = (rect.width - w * zoom) / 2 + panX;
    const oy = (rect.height - h * zoom) / 2 + panY;
    return {
      x: (e.clientX - rect.left - ox) / zoom,
      y: (e.clientY - rect.top - oy) / zoom,
      pressure: e.pressure || 0.5,
      time: performance.now(),
    };
  }

  function snapToGrid(pt: Point): Point {
    if (!settings.snapToGrid) return pt;
    const g = settings.gridSize;
    return { ...pt, x: Math.round(pt.x / g) * g, y: Math.round(pt.y / g) * g };
  }

  // ── Pointer handlers ────────────────────────────────────────────────
  function pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (spaceHeld || tool === "move") {
      panning = true;
      panStart = { x: e.clientX - panX, y: e.clientY - panY };
      return;
    }

    if (tool === "eyedropper") { pickColor(e); return; }

    if (tool === "text") {
      const pt = svgPoint(e);
      const text = prompt("Enter text:");
      if (!text) return;
      const s: Stroke = {
        id: uid(), tool, color: fgColor, baseWidth: lineWidth,
        opacity: opacity / 100, fill: false,
        points: [pt], text, fontSize, layerId: getActiveLayer().id,
      };
      getActiveLayer().strokes = [...getActiveLayer().strokes, s];
      pushHistory({ action: "stroke", layerId: getActiveLayer().id, strokes: [s] });
      layers = [...layers];
      return;
    }

    drawing = true;
    stabilizer = new Stabilizer(20, smoothing);
    stabilizer.reset();
    const pt = snapToGrid(svgPoint(e));
    currentPoints = [pt];
    pressure = e.pressure || 0.5;

    const isShape = ["line", "rect", "ellipse", "arrow", "triangle"].includes(tool);
    const baseColor = tool === "eraser" ? bgColor2 : fgColor;

    if (isShape) {
      currentStroke = {
        id: uid(), tool, color: baseColor, baseWidth: lineWidth,
        opacity: opacity / 100, fill: fillShapes,
        shapeType: tool, points: [pt],
        sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y,
        layerId: getActiveLayer().id,
      };
    } else {
      currentStroke = {
        id: uid(), tool, color: baseColor, baseWidth: lineWidth,
        opacity: opacity / 100, fill: false,
        points: [pt], d: `M${pt.x},${pt.y}`,
        layerId: getActiveLayer().id, brushAngle,
      };
    }
    svgEl.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent) {
    const pt = svgPoint(e);
    cursorX = Math.round(pt.x);
    cursorY = Math.round(pt.y);
    cursorScreenX = e.clientX;
    cursorScreenY = e.clientY;
    pressure = e.pressure || 0.5;

    if (panning) {
      panX = e.clientX - panStart.x;
      panY = e.clientY - panStart.y;
      return;
    }

    if (!drawing || !currentStroke) return;

    const raw = snapToGrid(pt);
    const stabilized = smoothing > 0 ? stabilizer.add(raw) : raw;
    currentPoints.push(stabilized);

    const isShape = ["line", "rect", "ellipse", "arrow", "triangle"].includes(tool);
    if (isShape) {
      if (shiftHeld) {
        const dx = stabilized.x - currentStroke.sx!;
        const dy = stabilized.y - currentStroke.sy!;
        const maxD = Math.max(Math.abs(dx), Math.abs(dy));
        currentStroke.ex = currentStroke.sx! + Math.sign(dx) * maxD;
        currentStroke.ey = currentStroke.sy! + Math.sign(dy) * maxD;
      } else {
        currentStroke.ex = stabilized.x;
        currentStroke.ey = stabilized.y;
      }
      currentStroke.points = [...currentPoints];
    } else if (tool === "pencil") {
      currentStroke.points = [...currentPoints];
      currentPencilPaths = generatePencilPaths(currentPoints, hardness, scatter);
      currentStroke.d = currentPencilPaths[0];
    } else {
      currentStroke.points = [...currentPoints];
      currentStroke.d = smoothPath(minDistFilter(currentPoints, 1.5), 0.5);
      currentVWPath = variableWidthPath(currentPoints, lineWidth, activePreset);
    }
  }

  function pointerUp(_e: PointerEvent) {
    if (panning) { panning = false; return; }
    if (!drawing || !currentStroke) return;
    drawing = false;

    if (currentPoints.length < 2 && !currentStroke.shapeType) return;

    if (currentStroke.tool === "pencil") {
      currentStroke.pencilPaths = generatePencilPaths(currentPoints, hardness, scatter);
    }
    if (!currentStroke.shapeType) {
      currentStroke.variableWidthPath = variableWidthPath(currentPoints, lineWidth, activePreset);
    }

    const layer = layers.find(l => l.id === currentStroke!.layerId) ?? getActiveLayer();
    layer.strokes = [...layer.strokes, currentStroke];
    pushHistory({ action: "stroke", layerId: layer.id, strokes: [currentStroke] });
    layers = [...layers];

    currentStroke = null;
    currentPoints = [];
    currentPencilPaths = [];
    currentVWPath = "";
  }

  // ── Eyedropper ──────────────────────────────────────────────────────
  function pickColor(e: PointerEvent) {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const px = Math.round((e.clientX - rect.left) / rect.width * w);
      const py = Math.round((e.clientY - rect.top) / rect.height * h);
      const data = ctx.getImageData(px, py, 1, 1).data;
      fgColor = `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, "0")).join("")}`;
      tool = "brush";
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(renderSvgString(true))));
  }

  // ── Render stroke to SVG ────────────────────────────────────────────
  function renderStroke(s: Stroke, isPreview: boolean): string {
    const op = isPreview ? 0.5 : s.opacity;

    if (s.shapeType) {
      const a = shapeAttrs(s);
      const sw = s.baseWidth;
      switch (s.shapeType) {
        case "line":
          return `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
        case "rect":
          return `<rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}" rx="1"/>`;
        case "ellipse":
          return `<ellipse cx="${a.cx}" cy="${a.cy}" rx="${a.rx}" ry="${a.ry}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" opacity="${op}"/>`;
        case "arrow":
          return `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/><polygon points="${a.x2},${a.y2} ${a.headX1},${a.headY1} ${a.headX2},${a.headY2}" fill="${s.color}" opacity="${op}"/>`;
        case "triangle":
          return `<polygon points="${a.points}" fill="${s.fill ? s.color : 'none'}" stroke="${s.fill ? 'none' : s.color}" stroke-width="${sw}" stroke-linejoin="round" opacity="${op}"/>`;
      }
    }

    if (s.text) {
      return `<text x="${s.points[0]?.x}" y="${s.points[0]?.y}" fill="${s.color}" font-size="${s.fontSize ?? 32}" font-family="sans-serif" opacity="${op}">${escapeXml(s.text)}</text>`;
    }

    // Variable-width path (pro rendering)
    if (s.variableWidthPath) {
      return `<path d="${s.variableWidthPath}" fill="${s.color}" opacity="${op}" fill-rule="evenodd"/>`;
    }

    // Pencil multi-stroke
    if (s.tool === "pencil") {
      let r = "";
      for (const pd of s.pencilPaths ?? []) {
        r += `<path d="${pd}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth * 0.35}" stroke-linecap="round" stroke-linejoin="round" opacity="${op * 0.5}"/>`;
      }
      r += `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth * 0.3}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
      return r;
    }

    return `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.baseWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
  }

  function renderSvgString(withBg = false): string {
    let inner = "";
    for (const layer of layers) {
      if (!layer.visible) continue;
      inner += `<g opacity="${layer.opacity / 100}">`;
      for (const s of layer.strokes) inner += renderStroke(s, false);
      inner += "</g>";
    }
    if (currentStroke) inner += renderStroke(currentStroke, true);
    const bg = withBg ? `<rect width="100%" height="100%" fill="${bgColor2}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg}${inner}</svg>`;
  }

  // ── Save / Download ─────────────────────────────────────────────────
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saveName = $state("drawing.png");
  let saveOk = $state(false);

  async function saveToCloud() {
    if (!svgEl || saving) return;
    saving = true; saveError = null; saveOk = false;
    try {
      const svgData = renderSvgString(true);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      const blob = await new Promise<Blob>((res, rej) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png");
        };
        img.onerror = rej;
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      });
      const fd = new FormData();
      fd.append("file", blob, saveName);
      const up = await fetch("/api/telegram/uploadFile", {
        method: "POST", body: fd,
        headers: { "X-Api-Key": apiKey },
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      saveOk = true;
      setTimeout(() => saveOk = false, 3000);
    } catch (err: any) {
      saveError = err?.message ?? "Failed to save";
    } finally { saving = false; }
  }

  function downloadPng() {
    const svgData = renderSvgString(true);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = saveName;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  function downloadSvg() {
    const svgData = renderSvgString(true);
    const a = document.createElement("a");
    a.download = saveName.replace(/\.png$/i, ".svg");
    a.href = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    a.click();
  }

  // ── Zoom ────────────────────────────────────────────────────────────
  function zoomAt(delta: number, cx?: number, cy?: number) {
    const old = zoom;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
    if (cx !== undefined && cy !== undefined) {
      panX = cx - (cx - panX) * (zoom / old);
      panY = cy - (cy - panY) * (zoom / old);
    }
  }

  function zoomTo(z: number) { zoomAt(z / zoom - 1, wrapW / 2, wrapH / 2); }

  function fitToScreen() {
    if (!wrapW || !wrapH) return;
    zoom = Math.min((wrapW - 60) / w, (wrapH - 60) / h);
    panX = 0; panY = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasWrap?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(e.deltaY > 0 ? -0.08 : 0.08, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  // ── Keyboard ────────────────────────────────────────────────────────
  function onkeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === " ") { e.preventDefault(); spaceHeld = true; return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "0") { e.preventDefault(); fitToScreen(); return; }
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomTo(Math.min(MAX_ZOOM, zoom * 1.5)); return; }
      if (e.key === "-") { e.preventDefault(); zoomTo(Math.max(MIN_ZOOM, zoom / 1.5)); return; }
    }
    if (e.key === "Shift") { shiftHeld = true; return; }
    const key = e.key.toLowerCase();
    for (const g of TOOL_GROUPS) for (const t of g.tools) { if (t.key === key) { tool = t.id as Tool; return; } }
    if (key === "[") { lineWidth = Math.max(0.5, lineWidth - 1); return; }
    if (key === "]") { lineWidth = Math.min(200, lineWidth + 1); return; }
    if (key === "x") { swapColors(); return; }
    if (key === "g") { settings.showGrid = !settings.showGrid; return; }
    if (key === "r") { settings.showRulers = !settings.showRulers; return; }
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === " ") spaceHeld = false;
    if (e.key === "Shift") shiftHeld = false;
  }

  // ── Init ────────────────────────────────────────────────────────────
  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!canvasWrap) return;
      const rect = canvasWrap.getBoundingClientRect();
      wrapW = rect.width;
      wrapH = rect.height;
    });
    ro.observe(canvasWrap);
    const rect = canvasWrap?.getBoundingClientRect();
    if (rect) { wrapW = rect.width; wrapH = rect.height; }
    fitToScreen();
    return () => ro.disconnect();
  });

  // ── UI panels ───────────────────────────────────────────────────────
  let rightPanel = $state<"brush" | "color" | "layers">("brush");
  let brushCategory = $state<"all" | BrushPreset["category"]>("all");

  let filteredPresets = $derived(
    brushCategory === "all" ? BRUSH_PRESETS : BRUSH_PRESETS.filter(p => p.category === brushCategory)
  );

  // Grid ruler ticks
  let rulerTickStep = $derived(zoom > 2 ? 25 : zoom > 0.8 ? 50 : 100);

  // ── Ruler actions ───────────────────────────────────────────────────
  function rulerHAction(canvas: HTMLCanvasElement, params: () => any) {
    let ro: ResizeObserver;
    function draw() {
      const p = params();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = globalThis.devicePixelRatio || 1;
      const cw = canvas.parentElement?.offsetWidth ?? 800;
      const ch = 20;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#26262a";
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 0.5;
      const step = p.step;
      for (let px = p.svgOffsetX % (step * p.zoom); px < cw; px += step * p.zoom) {
        const val = Math.round((px - p.svgOffsetX) / p.zoom);
        if (val >= 0 && val <= p.w) {
          ctx.beginPath();
          ctx.moveTo(px, ch - 6);
          ctx.lineTo(px, ch);
          ctx.stroke();
          ctx.fillText(val.toString(), px + 2, ch - 7);
        }
      }
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cw, 0);
      ctx.stroke();
    }
    draw();
    return { update() { draw(); }, destroy() { ro?.disconnect(); } };
  }

  function rulerVAction(canvas: HTMLCanvasElement, params: () => any) {
    function draw() {
      const p = params();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = globalThis.devicePixelRatio || 1;
      const cw = 20;
      const ch = canvas.parentElement?.offsetHeight ?? 600;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#26262a";
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 0.5;
      const step = p.step;
      for (let py = p.svgOffsetY % (step * p.zoom); py < ch; py += step * p.zoom) {
        const val = Math.round((py - p.svgOffsetY) / p.zoom);
        if (val >= 0 && val <= p.h) {
          ctx.beginPath();
          ctx.moveTo(cw - 6, py);
          ctx.lineTo(cw, py);
          ctx.stroke();
          ctx.save();
          ctx.translate(cw - 7, py + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(val.toString(), 0, 0);
          ctx.restore();
        }
      }
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(cw, 0);
      ctx.lineTo(cw, ch);
      ctx.stroke();
    }
    draw();
    return { update() { draw(); }, destroy() {} };
  }
</script>

<svelte:window onkeydown={onkeydown} onkeyup={onkeyup}/>

<div class="draw-root" role="application" tabindex="-1">
  <!-- ═══ LEFT TOOLBAR ═══ -->
  <div class="tool-sidebar">
    {#each TOOL_GROUPS as group, gi}
      {#if gi > 0}<div class="ts-sep"></div>{/if}
      {#each group.tools as t}
        <button class="ts-btn" class:active={tool === t.id} onclick={() => tool = t.id as Tool} title={t.label}>
          {#if t.id === "move"}<IconPointer size={16}/>{:else if t.id === "select"}<IconSelector size={16}/>
          {:else if t.id === "brush"}<IconBrush size={16}/>{:else if t.id === "pencil"}<IconPencil size={16}/>
          {:else if t.id === "pen"}<IconPencil size={16}/>{:else if t.id === "eraser"}<IconEraser size={16}/>
          {:else if t.id === "line"}<IconMinus size={16}/>{:else if t.id === "rect"}<IconSquare size={16}/>
          {:else if t.id === "ellipse"}<IconCircle size={16}/>{:else if t.id === "arrow"}<IconArrowBadgeRight size={16}/>
          {:else if t.id === "triangle"}<IconTriangle size={16}/>{:else if t.id === "eyedropper"}<IconColorPicker size={16}/>
          {:else if t.id === "fill"}<IconBucketDroplet size={16}/>{:else if t.id === "text"}<IconLetterT size={16}/>
          {/if}
        </button>
      {/each}
    {/each}
    <div class="ts-sep"></div>
    <button class="ts-btn" onclick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)"><IconArrowBack size={16}/></button>
    <button class="ts-btn" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)"><IconArrowForward size={16}/></button>
    <button class="ts-btn" onclick={clearAll} title="Clear layer"><IconTrash size={16}/></button>
    <div class="ts-spacer"></div>
    <!-- Color swatches -->
    <button class="ts-swatch ts-fg" style="background:{fgColor}" title="Foreground">
      <input type="color" bind:value={fgColor} class="ts-color-hid"/>
    </button>
    <button class="ts-swatch ts-bg" style="background:{bgColor2}" title="Background">
      <input type="color" bind:value={bgColor2} class="ts-color-hid"/>
    </button>
    <button class="ts-swap" onclick={swapColors} title="Swap (X)">
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 3L4 0V2H9V4H4V6L1 3Z" fill="currentColor" transform="rotate(180 5 3)"/></svg>
    </button>
  </div>

  <!-- ═══ CENTER ═══ -->
  <div class="center-area">
    <!-- Options bar -->
    <div class="options-bar">
      <span class="ob-tool">{tool}</span>
      <div class="ob-sep"></div>
      <label class="ob-label">Size
        <input type="range" min="0.5" max="150" step="0.5" bind:value={lineWidth} class="ob-slider"/>
        <span class="ob-val">{lineWidth.toFixed(1)}</span>
      </label>
      <label class="ob-label">Opacity
        <input type="range" min="1" max="100" bind:value={opacity} class="ob-slider"/>
        <span class="ob-val">{opacity}%</span>
      </label>
      {#if ["brush","pencil","pen","eraser"].includes(tool)}
        <label class="ob-label">Hardness
          <input type="range" min="1" max="100" bind:value={hardness} class="ob-slider"/>
          <span class="ob-val">{hardness}</span>
        </label>
        <label class="ob-label">Smooth
          <input type="range" min="0" max="1" step="0.05" bind:value={smoothing} class="ob-slider"/>
          <span class="ob-val">{Math.round(smoothing*100)}%</span>
        </label>
        <label class="ob-label">Taper
          <input type="range" min="0" max="1" step="0.05" bind:value={taper} class="ob-slider"/>
          <span class="ob-val">{Math.round(taper*100)}%</span>
        </label>
        <label class="ob-check"><input type="checkbox" bind:checked={pressureSize}/> Pressure→Size</label>
        <label class="ob-check"><input type="checkbox" bind:checked={pressureOpacity}/> Pressure→Opacity</label>
      {/if}
      {#if tool === "text"}
        <label class="ob-label">Font
          <input type="range" min="8" max="200" bind:value={fontSize} class="ob-slider"/>
          <span class="ob-val">{fontSize}px</span>
        </label>
      {/if}
      {#if ["line","rect","ellipse","arrow","triangle"].includes(tool)}
        <label class="ob-check"><input type="checkbox" bind:checked={fillShapes}/> Fill</label>
      {/if}
      <div class="ob-spacer"></div>
      <!-- Quick brush presets -->
      {#if ["brush","pencil","pen","eraser"].includes(tool)}
        <div class="ob-presets">
          {#each filteredPresets as p, i}
            <button class="ob-preset" class:active={activePresetIdx === BRUSH_PRESETS.indexOf(p)} onclick={() => applyPreset(p)} title={p.name}>
              <span style="font-size:{Math.min(14, Math.max(9, p.size / 2))}px">{p.icon}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Rulers + Canvas -->
    <div class="canvas-container">
      {#if settings.showRulers}
        <!-- Top ruler -->
        <div class="ruler ruler-h">
          <canvas class="ruler-canvas" use:rulerHAction={{ zoom, panX, wrapW, w, svgOffsetX, step: rulerTickStep }}></canvas>
        </div>
        <!-- Left ruler -->
        <div class="ruler ruler-v">
          <canvas class="ruler-canvas" use:rulerVAction={{ zoom, panY, wrapH, h, svgOffsetY, step: rulerTickStep }}></canvas>
        </div>
        <div class="ruler-corner"></div>
      {/if}

      <!-- Canvas wrap -->
      <div
        class="canvas-wrap"
        bind:this={canvasWrap}
        onwheel={onWheel}
        class:panning={panning || spaceHeld}
      >
        <!-- Grid overlay -->
        {#if settings.showGrid}
          <svg class="grid-overlay" viewBox="0 0 {w} {h}" style="width:{w*zoom}px;height:{h*zoom}px;transform:translate({svgOffsetX}px,{svgOffsetY}px)">
            <defs>
              <pattern id="gridSmall" width={rulerTickStep} height={rulerTickStep} patternUnits="userSpaceOnUse">
                <path d="M {rulerTickStep} 0 L 0 0 0 {rulerTickStep}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
              </pattern>
              <pattern id="gridLarge" width={rulerTickStep * 2} height={rulerTickStep * 2} patternUnits="userSpaceOnUse">
                <rect width={rulerTickStep * 2} height={rulerTickStep * 2} fill="url(#gridSmall)"/>
                <path d="M {rulerTickStep * 2} 0 L 0 0 0 {rulerTickStep * 2}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridLarge)"/>
          </svg>
        {/if}

        <!-- Main SVG -->
        <svg
          bind:this={svgEl}
          viewBox="0 0 {w} {h}"
          width={w * zoom}
          height={h * zoom}
          class="draw-svg"
          style="touch-action:none; transform: translate({svgOffsetX}px, {svgOffsetY}px) rotate({canvasRotation}deg)"
          onpointerdown={pointerDown}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointerenter={() => hovering = true}
          onpointerleave={(e) => { pointerUp(e); hovering = false; }}
        >
          <defs>
            <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
              <rect width="16" height="16" fill="#2a2a2a"/>
              <rect width="8" height="8" fill="#222"/>
              <rect x="8" y="8" width="8" height="8" fill="#222"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={bgColor2}/>
          {#if settings.checkerBg}
            <rect width="100%" height="100%" fill="url(#checker)" opacity="0"/>
          {/if}

          {#each layers as layer (layer.id)}
            {#if layer.visible}
              <g opacity={layer.opacity / 100}>
                {#each layer.strokes as s (s.id)}
                  {@html renderStroke(s, false)}
                {/each}
              </g>
            {/if}
          {/each}

          {#if currentStroke}
            {@html renderStroke(currentStroke, true)}
          {/if}
        </svg>

        <!-- Brush cursor preview -->
        {#if hovering && !panning}
          <div
            class="brush-cursor"
            style="
              left:{cursorScreenX - canvasWrap.getBoundingClientRect().left}px;
              top:{cursorScreenY - canvasWrap.getBoundingClientRect().top}px;
              width:{lineWidth * zoom}px;
              height:{lineWidth * zoom}px;
              border-color:{tool === 'eraser' ? '#ff4444' : 'rgba(255,255,255,0.6)'};
              opacity:{drawing ? 0.3 : 0.7};
            "
          ></div>
        {/if}
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span>{w}×{h}</span>
      <span class="sb-sep"></span>
      <span>{cursorX}, {cursorY}</span>
      <span class="sb-sep"></span>
      <span>🔍 {Math.round(zoom * 100)}%</span>
      <span class="sb-sep"></span>
      <span>📊 P:{(pressure * 100).toFixed(0)}%</span>
      {#if canvasRotation !== 0}
        <span class="sb-sep"></span>
        <span>↻ {canvasRotation.toFixed(0)}°</span>
      {/if}
      <div class="sb-spacer"></div>
      <button class="sb-btn" onclick={() => zoomTo(1)}>1:1</button>
      <button class="sb-btn" onclick={fitToScreen}>Fit</button>
      <button class="sb-btn" onclick={() => zoomTo(Math.min(MAX_ZOOM, zoom * 2))}>+</button>
      <button class="sb-btn" onclick={() => zoomTo(Math.max(MIN_ZOOM, zoom / 2))}>-</button>
      <button class="sb-btn" class:active={settings.showGrid} onclick={() => settings.showGrid = !settings.showGrid} title="Toggle grid (G)"><IconGridDots size={12}/></button>
      <button class="sb-btn" class:active={settings.showRulers} onclick={() => settings.showRulers = !settings.showRulers} title="Toggle rulers (R)"><IconRuler size={12}/></button>
      <div class="sb-spacer"></div>
      <span class="sb-dim">{layers.reduce((a, l) => a + l.strokes.length, 0)} strokes · {layers.length} layers</span>
      <input class="sb-fname" bind:value={saveName} placeholder="drawing.png"/>
      <button class="sb-btn" onclick={downloadPng}><IconDownload size={11}/> PNG</button>
      <button class="sb-btn" onclick={downloadSvg}><IconDownload size={11}/> SVG</button>
      <button class="sb-btn primary" onclick={saveToCloud} disabled={saving}>
        {#if saving}…{:else}<IconUpload size={11}/> Save{/if}
      </button>
      {#if saveOk}<span class="sb-ok">✓</span>{/if}
      {#if saveError}<span class="sb-err">{saveError}</span>{/if}
    </div>
  </div>

  <!-- ═══ RIGHT PANEL ═══ -->
  <div class="right-panel">
    <div class="rp-tabs">
      <button class="rp-tab" class:active={rightPanel === "brush"} onclick={() => rightPanel = "brush"}>Brush</button>
      <button class="rp-tab" class:active={rightPanel === "color"} onclick={() => rightPanel = "color"}>Color</button>
      <button class="rp-tab" class:active={rightPanel === "layers"} onclick={() => rightPanel = "layers"}>Layers</button>
    </div>

    <div class="rp-content">
      {#if rightPanel === "brush"}
        <!-- Brush categories -->
        <div class="rp-cats">
          {#each ["all","basic","paint","ink","sketch","special"] as cat}
            <button class="rp-cat" class:active={brushCategory === cat} onclick={() => brushCategory = cat as any}>{cat}</button>
          {/each}
        </div>
        <div class="rp-presets">
          {#each filteredPresets as p}
            {@const idx = BRUSH_PRESETS.indexOf(p)}
            <button class="rp-preset" class:active={activePresetIdx === idx} onclick={() => applyPreset(p)}>
              <span class="rp-pi">{p.icon}</span>
              <div class="rp-pinfo">
                <span class="rp-pn">{p.name}</span>
                <span class="rp-ps">{p.size}px · {p.hardness}%</span>
              </div>
            </button>
          {/each}
        </div>
        <p class="rp-heading">Advanced</p>
        <label class="rp-slider">Taper<input type="range" min="0" max="1" step="0.05" bind:value={taper}/><span>{Math.round(taper*100)}%</span></label>
        <label class="rp-slider">Angle<input type="range" min="-90" max="90" bind:value={brushAngle}/><span>{brushAngle}°</span></label>
        <label class="rp-slider">Scatter<input type="range" min="0" max="3" step="0.1" bind:value={scatter}/><span>{scatter.toFixed(1)}</span></label>

      {:else if rightPanel === "color"}
        <div class="rp-color-preview">
          <div class="rp-fg-big" style="background:{fgColor}"></div>
          <div class="rp-bg-big" style="background:{bgColor2}"></div>
        </div>
        <input type="color" bind:value={fgColor} class="rp-color-input"/>
        <label class="rp-label">Hex <input type="text" bind:value={fgColor} class="rp-hex" maxlength="7"/></label>
        <p class="rp-heading">Recent</p>
        <div class="rp-recent">
          {#each recentColors as c}
            <button class="rp-rswatch" style="background:{c}" onclick={() => { fgColor = c; }} title={c}></button>
          {/each}
        </div>

      {:else if rightPanel === "layers"}
        <div class="rp-layer-actions">
          <button class="rp-layer-btn" onclick={addLayer}>+ New</button>
          <button class="rp-layer-btn" onclick={removeLayer} disabled={layers.length <= 1}>Delete</button>
          <button class="rp-layer-btn" onclick={moveLayerUp} disabled={activeLayerIdx >= layers.length - 1}>↑</button>
          <button class="rp-layer-btn" onclick={moveLayerDown} disabled={activeLayerIdx <= 0}>↓</button>
        </div>
        {#each [...layers].reverse() as layer, ri (layer.id)}
          {@const idx = layers.length - 1 - ri}
          <div class="rp-layer" class:active={idx === activeLayerIdx} onclick={() => activeLayerIdx = idx} role="button" tabindex="-1">
            <button class="rp-lvis" onclick={(e) => { e.stopPropagation(); layer.visible = !layer.visible; layers = [...layers]; }}>
              {layer.visible ? "👁" : "—"}
            </button>
            <span class="rp-lname">{layer.name}</span>
            <span class="rp-lcount">{layer.strokes.length}</span>
          </div>
          {#if idx === activeLayerIdx}
            <label class="rp-slider rp-lay-opacity">Opacity
              <input type="range" min="1" max="100" bind:value={layer.opacity}/>
              <span>{layer.opacity}%</span>
            </label>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .draw-root { display: flex; height: 100%; width: 100%; overflow: hidden; background: #1a1a1e; user-select: none; }

  /* ═══ LEFT TOOLBAR ═══ */
  .tool-sidebar { display: flex; flex-direction: column; align-items: center; width: 40px; background: #222226; border-right: 1px solid #333; padding: 4px 0; gap: 1px; flex-shrink: 0; }
  .ts-sep { width: 22px; height: 1px; background: #444; margin: 3px 0; }
  .ts-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 5px; background: none; border: none; color: #777; cursor: pointer; transition: .1s; }
  .ts-btn:hover { background: #333; color: #ccc; }
  .ts-btn.active { background: #6366f1; color: #fff; }
  .ts-btn:disabled { opacity: .2; cursor: default; }
  .ts-spacer { flex: 1; }
  .ts-swatch { width: 22px; height: 22px; border-radius: 3px; border: 2px solid #555; cursor: pointer; position: relative; overflow: hidden; }
  .ts-fg { margin-top: 4px; z-index: 2; }
  .ts-bg { width: 16px; height: 16px; margin-top: -6px; margin-left: 10px; z-index: 1; }
  .ts-color-hid { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .ts-swap { background: none; border: none; color: #555; cursor: pointer; padding: 2px; margin-top: 2px; }
  .ts-swap:hover { color: #aaa; }

  /* ═══ CENTER ═══ */
  .center-area { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

  .options-bar { display: flex; align-items: center; gap: 8px; padding: 3px 10px; background: #26262a; border-bottom: 1px solid #333; min-height: 30px; flex-shrink: 0; overflow-x: auto; }
  .ob-tool { font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .06em; min-width: 50px; }
  .ob-sep { width: 1px; height: 14px; background: #444; flex-shrink: 0; }
  .ob-label { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #666; white-space: nowrap; }
  .ob-slider { width: 52px; height: 3px; accent-color: #6366f1; }
  .ob-val { font-family: 'Geist Mono', monospace; font-size: 9px; color: #555; min-width: 24px; }
  .ob-check { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #666; cursor: pointer; white-space: nowrap; }
  .ob-check input { accent-color: #6366f1; width: 12px; height: 12px; }
  .ob-spacer { flex: 1; }
  .ob-presets { display: flex; gap: 2px; }
  .ob-preset { width: 22px; height: 22px; border-radius: 3px; border: 1px solid #444; background: #2a2a2e; color: #999; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: .1s; }
  .ob-preset:hover { border-color: #6366f1; color: #fff; }
  .ob-preset.active { border-color: #6366f1; background: #2a2a3e; color: #fff; }

  /* ═══ Canvas container (rulers + canvas) ═══ */
  .canvas-container { flex: 1; display: grid; overflow: hidden; min-height: 0; }
  .canvas-container:has(.ruler) { grid-template-columns: 20px 1fr; grid-template-rows: 20px 1fr; }
  .canvas-container:not(:has(.ruler)) { grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .ruler { background: #26262a; overflow: hidden; }
  .ruler-h { grid-column: 2; grid-row: 1; }
  .ruler-v { grid-column: 1; grid-row: 2; }
  .ruler-corner { grid-column: 1; grid-row: 1; background: #26262a; border-right: 1px solid #333; border-bottom: 1px solid #333; }
  .ruler-canvas { width: 100%; height: 100%; display: block; }

  .canvas-wrap { grid-column: 2; grid-row: 2; overflow: hidden; position: relative; background: #1a1a1e; }
  .canvas-wrap.panning { cursor: grab !important; }
  .draw-svg { display: block; position: absolute; box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 2px 16px rgba(0,0,0,.5); cursor: crosshair; }
  .grid-overlay { position: absolute; pointer-events: none; z-index: 1; }

  .brush-cursor { position: absolute; pointer-events: none; border: 1.5px solid; border-radius: 50%; transform: translate(-50%, -50%); z-index: 10; transition: width .05s, height .05s, opacity .15s; }

  /* ═══ Status bar ═══ */
  .status-bar { display: flex; align-items: center; gap: 5px; padding: 2px 10px; background: #26262a; border-top: 1px solid #333; font-size: 10px; color: #555; font-family: 'Geist Mono', monospace; min-height: 24px; flex-shrink: 0; }
  .sb-sep { width: 1px; height: 10px; background: #3a3a3a; }
  .sb-spacer { flex: 1; }
  .sb-btn { display: flex; align-items: center; gap: 2px; padding: 2px 5px; border-radius: 3px; background: #2a2a2e; border: 1px solid #3a3a3a; color: #666; font-size: 9px; cursor: pointer; font-family: 'Geist Mono', monospace; transition: .1s; }
  .sb-btn:hover { border-color: #6366f1; color: #bbb; }
  .sb-btn.active { border-color: #6366f1; color: #6366f1; background: #2a2a3e; }
  .sb-btn.primary { background: #6366f1; border-color: #6366f1; color: #fff; font-weight: 600; }
  .sb-btn.primary:hover { opacity: .85; }
  .sb-btn.primary:disabled { opacity: .4; cursor: not-allowed; }
  .sb-fname { background: #1a1a1e; border: 1px solid #3a3a3a; border-radius: 3px; padding: 1px 5px; color: #888; font-size: 9px; font-family: 'Geist Mono', monospace; width: 90px; outline: none; }
  .sb-fname:focus { border-color: #6366f1; }
  .sb-dim { color: #444; }
  .sb-ok { color: #4ade80; }
  .sb-err { color: #f87171; }

  /* ═══ RIGHT PANEL ═══ */
  .right-panel { width: 210px; flex-shrink: 0; background: #222226; border-left: 1px solid #333; display: flex; flex-direction: column; overflow: hidden; }
  .rp-tabs { display: flex; border-bottom: 1px solid #333; }
  .rp-tab { flex: 1; padding: 5px 0; background: none; border: none; color: #555; font-size: 10px; font-weight: 700; cursor: pointer; border-bottom: 2px solid transparent; transition: .1s; text-transform: uppercase; letter-spacing: .04em; }
  .rp-tab:hover { color: #999; }
  .rp-tab.active { color: #fff; border-bottom-color: #6366f1; }
  .rp-content { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .rp-heading { font-size: 9px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: .08em; margin: 6px 0 3px; }
  .rp-heading:first-child { margin-top: 0; }

  /* Brush categories */
  .rp-cats { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px; }
  .rp-cat { padding: 2px 6px; border-radius: 3px; background: #2a2a2e; border: 1px solid #333; color: #666; font-size: 9px; cursor: pointer; text-transform: capitalize; transition: .1s; }
  .rp-cat:hover { border-color: #555; color: #aaa; }
  .rp-cat.active { border-color: #6366f1; color: #fff; background: #2a2a3e; }

  /* Presets */
  .rp-presets { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }
  .rp-preset { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 5px; background: #2a2a2e; border: 1px solid #333; color: #999; cursor: pointer; font-size: 10px; transition: .1s; text-align: left; }
  .rp-preset:hover { border-color: #555; background: #303034; }
  .rp-preset.active { border-color: #6366f1; background: #2a2a3e; color: #fff; }
  .rp-pi { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
  .rp-pinfo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .rp-pn { font-weight: 600; font-size: 10px; }
  .rp-ps { font-size: 9px; color: #555; font-family: 'Geist Mono', monospace; }

  /* Sliders */
  .rp-slider { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #666; }
  .rp-slider input[type="range"] { flex: 1; accent-color: #6366f1; height: 3px; }
  .rp-slider span { font-size: 9px; color: #555; font-family: 'Geist Mono', monospace; min-width: 28px; text-align: right; }

  /* Color */
  .rp-color-preview { position: relative; width: 50px; height: 50px; margin: 0 auto 6px; }
  .rp-fg-big { position: absolute; top: 0; left: 0; width: 36px; height: 36px; border-radius: 4px; border: 2px solid #555; z-index: 2; }
  .rp-bg-big { position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; border-radius: 3px; border: 2px solid #444; z-index: 1; }
  .rp-color-input { width: 100%; height: 26px; border: 1px solid #444; border-radius: 4px; background: #2a2a2e; cursor: pointer; padding: 1px; }
  .rp-label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #666; }
  .rp-hex { flex: 1; background: #2a2a2e; border: 1px solid #444; border-radius: 3px; padding: 2px 5px; color: #aaa; font-size: 10px; font-family: 'Geist Mono', monospace; outline: none; }
  .rp-hex:focus { border-color: #6366f1; }
  .rp-recent { display: flex; flex-wrap: wrap; gap: 3px; }
  .rp-rswatch { width: 16px; height: 16px; border-radius: 3px; border: 1px solid #444; cursor: pointer; transition: .1s; }
  .rp-rswatch:hover { border-color: #888; transform: scale(1.2); }

  /* Layers */
  .rp-layer-actions { display: flex; gap: 3px; margin-bottom: 4px; }
  .rp-layer-btn { flex: 1; padding: 3px; border-radius: 3px; background: #2a2a2e; border: 1px solid #444; color: #777; font-size: 9px; cursor: pointer; transition: .1s; }
  .rp-layer-btn:hover { border-color: #6366f1; color: #ccc; }
  .rp-layer-btn:disabled { opacity: .25; cursor: default; }
  .rp-layer { display: flex; align-items: center; gap: 5px; padding: 5px 6px; border-radius: 5px; background: #2a2a2e; border: 1px solid #333; color: #999; cursor: pointer; font-size: 10px; transition: .1s; }
  .rp-layer:hover { border-color: #555; }
  .rp-layer.active { border-color: #6366f1; background: #2a2a3e; color: #fff; }
  .rp-lvis { background: none; border: none; font-size: 11px; cursor: pointer; padding: 0; color: inherit; width: 18px; text-align: center; }
  .rp-lname { flex: 1; }
  .rp-lcount { font-size: 9px; color: #444; }
  .rp-lay-opacity { padding: 2px 0; }
</style>
