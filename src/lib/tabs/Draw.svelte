<!-- src/lib/tabs/Draw.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    IconPencil, IconEraser, IconSquare, IconCircle,
    IconLine, IconArrowBack, IconArrowForward,
    IconTrash, IconDownload, IconUpload, IconBrush,
    IconSlash, IconTriangle, IconPentagon,
  } from "@tabler/icons-svelte";

  let { apiKey }: { apiKey: string } = $props();

  // ── Canvas ────────────────────────────────────────────────────────────────
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let startX = 0, startY = 0;
  let snapshotBeforeShape: ImageData | null = null;

  // ── Tool state ────────────────────────────────────────────────────────────
  type Tool = "pen" | "brush" | "eraser" | "line" | "rect" | "ellipse" | "arrow" | "triangle";
  let tool       = $state<Tool>("pen");
  let color      = $state("#ffffff");
  let bgColor    = $state("#1a1a1a");
  let lineWidth  = $state(3);
  let opacity    = $state(100);
  let hardness   = $state(100); // 100 = hard, 0 = soft (blur)
  let fill       = $state(false);

  // ── Undo/Redo ─────────────────────────────────────────────────────────────
  let history: ImageData[] = [];
  let historyIdx = -1;
  const MAX_HISTORY = 40;

  function saveSnapshot() {
    if (!ctx || !canvasEl) return;
    const snap = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    history = history.slice(0, historyIdx + 1);
    history.push(snap);
    if (history.length > MAX_HISTORY) history.shift();
    historyIdx = history.length - 1;
  }

  function undo() {
    if (!ctx || !canvasEl || historyIdx <= 0) return;
    historyIdx--;
    ctx.putImageData(history[historyIdx], 0, 0);
  }

  function redo() {
    if (!ctx || !canvasEl || historyIdx >= history.length - 1) return;
    historyIdx++;
    ctx.putImageData(history[historyIdx], 0, 0);
  }

  // ── Canvas setup ──────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvasEl || !ctx) return;
    const snap = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const wrapper = canvasEl.parentElement!;
    canvasEl.width  = wrapper.clientWidth;
    canvasEl.height = wrapper.clientHeight;
    fillBackground();
    ctx.putImageData(snap, 0, 0);
  }

  function fillBackground() {
    if (!ctx || !canvasEl) return;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }

  onMount(() => {
    if (!canvasEl) return;
    ctx = canvasEl.getContext("2d")!;
    const wrapper = canvasEl.parentElement!;
    canvasEl.width  = wrapper.clientWidth;
    canvasEl.height = wrapper.clientHeight;
    fillBackground();
    saveSnapshot();

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(wrapper);
    return () => ro.disconnect();
  });

  // ── Drawing helpers ───────────────────────────────────────────────────────
  function applyCtxStyle(forEraser = false) {
    if (!ctx) return;
    ctx.globalAlpha     = opacity / 100;
    ctx.lineWidth       = lineWidth;
    ctx.lineCap         = "round";
    ctx.lineJoin        = "round";
    if (forEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.fillStyle   = color;
      if (tool === "brush" && hardness < 100) {
        ctx.shadowBlur  = (100 - hardness) * 0.4 * lineWidth;
        ctx.shadowColor = color;
      } else {
        ctx.shadowBlur = 0;
      }
    }
  }

  function getPos(e: MouseEvent | TouchEvent): [number, number] {
    const rect = canvasEl!.getBoundingClientRect();
    if (e instanceof TouchEvent) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return [t.clientX - rect.left, t.clientY - rect.top];
    }
    return [(e as MouseEvent).clientX - rect.left, (e as MouseEvent).clientY - rect.top];
  }

  function startDraw(e: MouseEvent | TouchEvent) {
    if (!ctx || !canvasEl) return;
    e.preventDefault();
    isDrawing = true;
    [lastX, lastY] = getPos(e);
    [startX, startY] = [lastX, lastY];

    if (["line","rect","ellipse","arrow","triangle"].includes(tool)) {
      snapshotBeforeShape = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    }

    if (tool === "pen" || tool === "brush") {
      applyCtxStyle(false);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
    }
    if (tool === "eraser") {
      applyCtxStyle(true);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
    }
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawing || !ctx || !canvasEl) return;
    e.preventDefault();
    const [x, y] = getPos(e);

    if (tool === "pen" || tool === "brush") {
      applyCtxStyle(false);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x; lastY = y;
      return;
    }

    if (tool === "eraser") {
      applyCtxStyle(true);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x; lastY = y;
      return;
    }

    // Shape preview — restore snapshot then redraw shape
    if (snapshotBeforeShape) ctx.putImageData(snapshotBeforeShape, 0, 0);
    applyCtxStyle(false);
    ctx.beginPath();

    if (tool === "rect") {
      if (fill) ctx.fillRect(startX, startY, x - startX, y - startY);
      ctx.strokeRect(startX, startY, x - startX, y - startY);

    } else if (tool === "ellipse") {
      const rx = Math.abs(x - startX) / 2;
      const ry = Math.abs(y - startY) / 2;
      const cx = startX + (x - startX) / 2;
      const cy = startY + (y - startY) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();

    } else if (tool === "line") {
      ctx.moveTo(startX, startY);
      ctx.lineTo(x, y);
      ctx.stroke();

    } else if (tool === "arrow") {
      const angle = Math.atan2(y - startY, x - startX);
      const len   = Math.hypot(x - startX, y - startY);
      const headLen = Math.min(20 + lineWidth * 2, len * 0.4);
      ctx.moveTo(startX, startY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - headLen * Math.cos(angle - Math.PI / 6), y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 6), y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

    } else if (tool === "triangle") {
      ctx.moveTo(startX + (x - startX) / 2, startY);
      ctx.lineTo(x, y);
      ctx.lineTo(startX, y);
      ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    }
  }

  function endDraw(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    draw(e);
    isDrawing = false;
    ctx!.shadowBlur = 0;
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
    snapshotBeforeShape = null;
    saveSnapshot();
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
    const map: Record<string, Tool> = { p:"pen", b:"brush", e:"eraser", l:"line", r:"rect", o:"ellipse", a:"arrow", t:"triangle" };
    if (!e.ctrlKey && !e.metaKey && map[e.key]) tool = map[e.key];
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clearCanvas() {
    if (!ctx || !canvasEl) return;
    fillBackground();
    saveSnapshot();
  }

  // ── Save as PNG to Telegram ───────────────────────────────────────────────
  let saving    = $state(false);
  let saveError = $state<string | null>(null);
  let saveName  = $state("drawing.png");
  let saveOk    = $state(false);

  async function saveToCloud() {
    if (!canvasEl || saving) return;
    saving = true; saveError = null; saveOk = false;
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvasEl!.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
      );
      const fd = new FormData();
      fd.append("file", blob, saveName);
      const res = await fetch(`/api/telegram/uploadFile?api_key=${encodeURIComponent(apiKey)}`, {
        method: "POST", body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      saveOk = true;
      setTimeout(() => saveOk = false, 3000);
    } catch (err: any) {
      saveError = err?.message ?? "Failed to save";
    } finally {
      saving = false;
    }
  }

  // ── Download locally ──────────────────────────────────────────────────────
  function downloadPng() {
    if (!canvasEl) return;
    const a = document.createElement("a");
    a.href     = canvasEl.toDataURL("image/png");
    a.download = saveName;
    a.click();
  }

  // ── Load image onto canvas ────────────────────────────────────────────────
  let fileInput: HTMLInputElement;
  function loadImage() { fileInput?.click(); }
  function onFileLoad(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !ctx || !canvasEl) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      ctx!.drawImage(img, 0, 0, canvasEl!.width, canvasEl!.height);
      URL.revokeObjectURL(url);
      saveSnapshot();
    };
    img.src = url;
  }

  // ── Palette ───────────────────────────────────────────────────────────────
  const PALETTE = [
    "#ffffff","#000000","#f87171","#fb923c","#fbbf24",
    "#4ade80","#34d399","#38bdf8","#818cf8","#f472b6",
    "#e2e8f0","#94a3b8","#64748b","#334155","#1e293b",
  ];

  const TOOLS: { id: Tool; icon: any; label: string; key: string }[] = [
    { id: "pen",      icon: IconPencil,   label: "Pen",      key: "P" },
    { id: "brush",    icon: IconBrush,    label: "Brush",    key: "B" },
    { id: "eraser",   icon: IconEraser,   label: "Eraser",   key: "E" },
    { id: "line",     icon: IconSlash,    label: "Line",     key: "L" },
    { id: "rect",     icon: IconSquare,   label: "Rect",     key: "R" },
    { id: "ellipse",  icon: IconCircle,   label: "Ellipse",  key: "O" },
    { id: "arrow",    icon: IconLine,     label: "Arrow",    key: "A" },
    { id: "triangle", icon: IconTriangle, label: "Triangle", key: "T" },
  ];
</script>

<svelte:window onkeydown={onKey} />

<div class="draw-root">
  <!-- Left toolbar -->
  <aside class="toolbar">
    <div class="tool-group">
      {#each TOOLS as t}
        <button
          class="tool-btn"
          class:active={tool === t.id}
          title="{t.label} ({t.key})"
          onclick={() => tool = t.id}
        >
          <t.icon size={17} stroke={1.6} />
        </button>
      {/each}
    </div>

    <div class="divider"></div>

    <div class="tool-group">
      <button class="tool-btn" class:active={fill} title="Fill shapes" onclick={() => fill = !fill}>
        <IconPentagon size={17} stroke={1.6} />
      </button>
    </div>

    <div class="divider"></div>

    <div class="tool-group">
      <button class="tool-btn" title="Undo (Ctrl+Z)" onclick={undo}><IconArrowBack size={17} stroke={1.6} /></button>
      <button class="tool-btn" title="Redo (Ctrl+Y)" onclick={redo}><IconArrowForward size={17} stroke={1.6} /></button>
    </div>

    <div class="divider"></div>

    <div class="tool-group">
      <button class="tool-btn danger" title="Clear canvas" onclick={clearCanvas}><IconTrash size={17} stroke={1.6} /></button>
    </div>
  </aside>

  <!-- Canvas area -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="canvas-wrap">
    <canvas
      bind:this={canvasEl}
      onmousedown={startDraw}
      onmousemove={draw}
      onmouseup={endDraw}
      onmouseleave={endDraw}
      ontouchstart={startDraw}
      ontouchmove={draw}
      ontouchend={endDraw}
      style="cursor: {tool === 'eraser' ? 'cell' : 'crosshair'}"
    ></canvas>
  </div>

  <!-- Right panel -->
  <aside class="panel">
    <section class="panel-section">
      <span class="panel-label">Color</span>
      <input type="color" class="color-pick" bind:value={color} title="Stroke color" />
      <div class="palette">
        {#each PALETTE as c}
          <button
            class="swatch"
            class:selected={color === c}
            style="background:{c};"
            onclick={() => color = c}
            title={c}
          ></button>
        {/each}
      </div>
    </section>

    <section class="panel-section">
      <span class="panel-label">Background</span>
      <input type="color" class="color-pick" bind:value={bgColor} title="Canvas background" />
    </section>

    <section class="panel-section">
      <div class="slider-row">
        <span class="panel-label">Size</span>
        <span class="slider-val">{lineWidth}px</span>
      </div>
      <input type="range" class="slider" min="1" max="80" bind:value={lineWidth} />
    </section>

    <section class="panel-section">
      <div class="slider-row">
        <span class="panel-label">Opacity</span>
        <span class="slider-val">{opacity}%</span>
      </div>
      <input type="range" class="slider" min="1" max="100" bind:value={opacity} />
    </section>

    {#if tool === "brush"}
      <section class="panel-section">
        <div class="slider-row">
          <span class="panel-label">Hardness</span>
          <span class="slider-val">{hardness}%</span>
        </div>
        <input type="range" class="slider" min="0" max="100" bind:value={hardness} />
      </section>
    {/if}

    <div class="divider"></div>

    <section class="panel-section">
      <span class="panel-label">Filename</span>
      <input class="name-input" type="text" bind:value={saveName} placeholder="drawing.png" />
    </section>

    <section class="panel-section actions">
      <button class="action-btn" onclick={downloadPng} title="Download PNG locally">
        <IconDownload size={14} /> Download
      </button>
      <button class="action-btn primary" onclick={saveToCloud} disabled={saving} title="Save to your cloud">
        <IconUpload size={14} /> {saving ? "Saving…" : "Save to Cloud"}
      </button>
      <button class="action-btn" onclick={loadImage} title="Load image onto canvas">
        <IconUpload size={14} /> Load Image
      </button>
      {#if saveOk}
        <span class="save-ok">✓ Saved to cloud!</span>
      {/if}
      {#if saveError}
        <span class="save-err">{saveError}</span>
      {/if}
    </section>

    <div class="divider"></div>

    <section class="panel-section">
      <span class="panel-label" style="color:var(--text-3); font-size:10px;">
        P pen · B brush · E eraser · L line<br>
        R rect · O ellipse · A arrow · T triangle<br>
        Ctrl+Z undo · Ctrl+Y redo
      </span>
    </section>
  </aside>

  <input bind:this={fileInput} type="file" accept="image/*" style="display:none" onchange={onFileLoad} />
</div>

<style>
  .draw-root {
    display: flex;
    height: 100vh;
    background: var(--bg-1);
    overflow: hidden;
  }

  /* ── Left toolbar ── */
  .toolbar {
    width: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 6px;
    background: var(--bg-2);
    border-right: 1px solid var(--border);
    flex-shrink: 0;
    overflow-y: auto;
  }
  .tool-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
  }
  .tool-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-3);
    cursor: pointer;
    transition: all 0.12s;
    flex-shrink: 0;
  }
  .tool-btn:hover { background: var(--hover); color: var(--text-1); border-color: var(--border); }
  .tool-btn.active { background: var(--hover); color: var(--accent); border-color: var(--accent); }
  .tool-btn.danger:hover { color: var(--red); border-color: var(--red-border); }

  /* ── Canvas ── */
  .canvas-wrap {
    flex: 1;
    overflow: hidden;
    position: relative;
    background: #1a1a1a;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  /* ── Right panel ── */
  .panel {
    width: 200px;
    flex-shrink: 0;
    background: var(--bg-2);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .panel-section.actions { gap: 4px; }
  .panel-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-3);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .divider {
    height: 1px;
    background: var(--border);
    margin: 6px 0;
    flex-shrink: 0;
  }

  /* color picker */
  .color-pick {
    width: 100%;
    height: 32px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
    padding: 2px;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.1s, transform 0.1s;
  }
  .swatch:hover { transform: scale(1.15); }
  .swatch.selected { border-color: var(--accent); }

  /* sliders */
  .slider-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .slider-val {
    font-size: 11px;
    font-family: "Geist Mono", monospace;
    color: var(--text-2);
  }
  .slider {
    width: 100%;
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* filename */
  .name-input {
    width: 100%;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 8px;
    color: var(--text-1);
    font-size: 12px;
    font-family: "Geist", sans-serif;
    outline: none;
    box-sizing: border-box;
  }
  .name-input:focus { border-color: var(--border-hover); }

  /* action buttons */
  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 10px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--text-2);
    font-size: 12px;
    font-family: "Geist", sans-serif;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }
  .action-btn:hover { background: var(--bg-3); border-color: var(--border-hover); color: var(--text-1); }
  .action-btn.primary { border-color: var(--accent); color: var(--accent); }
  .action-btn.primary:hover { background: rgba(99,102,241,.1); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .save-ok  { font-size: 11px; color: var(--green); }
  .save-err { font-size: 11px; color: var(--red); }
</style>
