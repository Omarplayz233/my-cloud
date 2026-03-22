<!-- src/routes/generators/topographic-lines/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconInfoCircle } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';

  let { data } = $props();
  let apiKey = $derived(data?.apiKey ?? "");

  onMount(() => {
    const saved = localStorage.getItem('theme') ?? 'system';
    const isDark = saved === 'dark' || (saved === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    const vars = isDark ? DARK : LIGHT;
    const el = document.documentElement;
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    generate();
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1','--hover':'rgba(255,255,255,.04)','--red':'#f87171'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5','--hover':'rgba(0,0,0,.04)','--red':'#dc2626'};

  // ── Controls ──────────────────────────────────────────────────────────
  let seed        = $state(Math.floor(Math.random() * 99999));
  let lineCount   = $state(18);
  let smoothness  = $state(6);
  let lineWidth   = $state(1.2);
  let bgColor     = $state('#0d0d1a');
  let lineColor   = $state('#6366f1');
  let lineColor2  = $state('#a78bfa');
  let useGradient = $state(false);
  let canvasW     = $state(800);
  let canvasH     = $state(500);

  type ShapeMode = 'contour' | 'circles' | 'ridges';
  let shapeMode: ShapeMode = $state('contour');

  type LineStyle = 'solid' | 'dashed' | 'dotted' | 'wiggly';
  let lineStyle: LineStyle = $state('solid');
  let dashLen    = $state(12);
  let dashGap    = $state(6);
  let wiggleAmp  = $state(2.5);
  let wiggleFreq = $state(0.3);

  let curviness   = $state(0.5);
  let lineOpacity = $state(1.0);
  let invertColors = $state(false);
  let mirrorX     = $state(false);
  let mirrorY     = $state(false);
  let rotation    = $state(0);
  let fillMode    = $state(false);
  let fillOpacity = $state(0.08);

  // ── Save ──────────────────────────────────────────────────────────────
  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

  // ── Tooltip ───────────────────────────────────────────────────────────
  let tooltip = $state<{text:string, x:number, y:number} | null>(null);
  function showTip(e: MouseEvent, text: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltip = { text, x: r.left + r.width / 2, y: r.top - 8 };
  }
  function hideTip() { tooltip = null; }

  // ── Templates ─────────────────────────────────────────────────────────
  const TEMPLATES = [
    { name: 'Dark Topo',    desc: 'Classic dark topographic', apply: () => { bgColor='#0d0d1a'; lineColor='#6366f1'; lineColor2='#a78bfa'; lineCount=18; smoothness=6; curviness=0.5; lineWidth=1.2; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=false; fillMode=false; invertColors=false; }},
    { name: 'Terrain',      desc: 'Dense realistic contours',  apply: () => { bgColor='#0a1628'; lineColor='#3b82f6'; lineColor2='#93c5fd'; lineCount=40; smoothness=8; curviness=0.7; lineWidth=0.8; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=true; fillMode=false; }},
    { name: 'Neon',         desc: 'Vibrant gradient lines',    apply: () => { bgColor='#0a0a0a'; lineColor='#f0abfc'; lineColor2='#67e8f9'; lineCount=25; smoothness=7; curviness=0.8; lineWidth=1.5; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=true; fillMode=false; invertColors=false; }},
    { name: 'Blueprint',    desc: 'Technical drawing style',   apply: () => { bgColor='#0c1f3f'; lineColor='#93c5fd'; lineColor2='#bfdbfe'; lineCount=20; smoothness=4; curviness=0; lineWidth=0.8; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=false; fillMode=false; }},
    { name: 'Paper Map',    desc: 'Vintage paper aesthetic',   apply: () => { bgColor='#f5e6c8'; lineColor='#7c5c2e'; lineColor2='#a0522d'; lineCount=22; smoothness=7; curviness=0.6; lineWidth=1.0; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=false; fillMode=false; invertColors=false; }},
    { name: 'Wiggly',       desc: 'Organic hand-drawn feel',   apply: () => { bgColor='#0d0d1a'; lineColor='#a78bfa'; lineColor2='#6366f1'; lineCount=16; smoothness=6; curviness=0; lineWidth=1.4; lineStyle='wiggly' as LineStyle; wiggleAmp=3; wiggleFreq=0.25; shapeMode='contour' as ShapeMode; useGradient=false; }},
    { name: 'Dashed Ridge', desc: 'Ridgeline with dashes',     apply: () => { bgColor='#111827'; lineColor='#34d399'; lineColor2='#6ee7b7'; lineCount=20; smoothness=5; curviness=0.4; lineWidth=1.2; lineStyle='dashed' as LineStyle; dashLen=8; dashGap=5; shapeMode='ridges' as ShapeMode; useGradient=true; }},
    { name: 'Forest',       desc: 'Dense green terrain',       apply: () => { bgColor='#0d1a0f'; lineColor='#4ade80'; lineColor2='#86efac'; lineCount=45; smoothness=10; curviness=0.85; lineWidth=0.7; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=false; fillMode=false; invertColors=false; }},
    { name: 'Navy Glow',    desc: 'Thin lines, glowing accent',  apply: () => { bgColor='#0f172a'; lineColor='#cbd5e1'; lineColor2='#22d3ee'; lineCount=50; smoothness=12; curviness=0.9; lineWidth=0.5; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=false; fillMode=false; invertColors=false; }},
    { name: 'Gold Relief',  desc: 'Warm metallic contours',      apply: () => { bgColor='#1c1917'; lineColor='#fef3c7'; lineColor2='#b45309'; lineCount=30; smoothness=9; curviness=0.8; lineWidth=0.9; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=true; fillMode=false; invertColors=false; }},
    { name: 'Filled',       desc: 'Layered fill effect',       apply: () => { bgColor='#0d0d1a'; lineColor='#818cf8'; lineColor2='#c4b5fd'; lineCount=15; smoothness=8; curviness=0.9; lineWidth=0.8; lineStyle='solid' as LineStyle; shapeMode='contour' as ShapeMode; useGradient=true; fillMode=true; fillOpacity=0.12; }},
  ];

  // ── Tooltips map ──────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    seed:       'Random seed — same seed always produces the same pattern',
    lineCount:  'How many contour lines to draw — higher = more detail',
    smoothness: 'Controls noise scale — lower = large sweeping blobs, higher = tight fine detail',
    curviness:  'How smooth the line curves are — 0 = angular/blocky, 1 = smooth circles',
    lineWidth:  'Stroke thickness in canvas pixels',
    lineOpacity:'Overall line transparency',
    fillMode:   'Fill the area between contour lines with a tinted color',
    fillOpacity:'Opacity of the fill color between lines',
    bgColor:    'Canvas background color',
    lineColor:  'Primary line color',
    useGradient:'Blend between two colors across contour levels',
    lineColor2: 'Second color for the gradient (bottom contours)',
    invertColors:'Swap background and line colors',
    rotation:   'Rotate the entire pattern on the canvas',
    mirrorX:    'Mirror the pattern horizontally',
    mirrorY:    'Mirror the pattern vertically',
    dashLen:    'Length of each dash segment',
    dashGap:    'Gap between dashes',
    wiggleAmp:  'How far the wiggle deviates from the line path',
    wiggleFreq: 'How frequently the wiggle oscillates per pixel',
    canvasSize: 'Output resolution — higher = larger file, slower render',
  };

  // ── RNG ───────────────────────────────────────────────────────────────
  function mulberry32(s: number) {
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Perlin noise ─────────────────────────────────────────────────────
  function createPerlin(rand: ()=>number) {
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
      p[i + 256] = p[i];
    }
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp  = (t: number, a: number, b: number) => a + t * (b - a);
    const grad  = (h: number, x: number, y: number) => {
      const u = (h & 8) ? y : x, v = (h & 4) ? x : (h & 12) === 12 ? x : y;
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    };
    return (x: number, y: number) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const a = p[X]+Y, b = p[X+1]+Y;
      return lerp(v, lerp(u, grad(p[a],   x,   y), grad(p[b],   x-1, y)),
                     lerp(u, grad(p[a+1], x,   y-1), grad(p[b+1], x-1, y-1)));
    };
  }

  function buildGrid(rand: ()=>number, cols: number, rows: number, smooth: number): number[][] {
    // smooth = noise scale: lower = zoomed in / bigger blobs, higher = tighter
    const noise = createPerlin(rand);
    // Fixed base scale — smoothness does NOT change zoom, only detail level
    const scale = 0.018;
    // smooth 1-18: low = 1 octave (big smooth blobs), high = many octaves (fine jagged detail)
    const octaves = [
      { f: 1.0,  a: 1.0   },
      { f: 2.1,  a: 0.50  },
      { f: 4.3,  a: 0.25  },
      { f: 8.7,  a: 0.125 },
      { f: 17.3, a: 0.063 },
    ];
    // how many octaves to blend in, fractionally
    const octaveBlend = (smooth - 1) / 17; // 0..1
    const activeOctaves = 1 + octaveBlend * (octaves.length - 1);
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        let v = 0, norm = 0;
        for (let o = 0; o < octaves.length; o++) {
          const weight = Math.max(0, Math.min(1, activeOctaves - o));
          if (weight <= 0) break;
          v    += octaves[o].a * weight * noise(c * scale * octaves[o].f, r * scale * octaves[o].f);
          norm += octaves[o].a * weight;
        }
        grid[r][c] = (v / norm + 1) / 2;
      }
    }
    return grid;
  }

  // ── Catmull-Rom bezier — handles both open and closed chains ──────────
  type Pt = {x:number, y:number};

  function catmullBez(ctx: CanvasRenderingContext2D, pts: Pt[], tension: number, ox: number, oy: number, closed: boolean) {
    const n = pts.length;
    if (n < 2) return;
    if (tension === 0 || n === 2) {
      ctx.moveTo(pts[0].x+ox, pts[0].y+oy);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x+ox, pts[i].y+oy);
      if (closed) ctx.closePath();
      return;
    }
    ctx.moveTo(pts[0].x+ox, pts[0].y+oy);
    const limit = closed ? n : n - 1;
    for (let i = 0; i < limit; i++) {
      // For closed loops, wrap indices around instead of clamping — this is what prevents the box artifact
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i % n];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      // tension in 0-1; /6 is the Catmull-Rom standard divisor
      const t6 = tension * 0.15; // Catmull-Rom sweet spot — prevents edge looping
      const cp1x = p1.x + (p2.x - p0.x) * t6;
      const cp1y = p1.y + (p2.y - p0.y) * t6;
      const cp2x = p2.x - (p3.x - p1.x) * t6;
      const cp2y = p2.y - (p3.y - p1.y) * t6;
      ctx.bezierCurveTo(cp1x+ox, cp1y+oy, cp2x+ox, cp2y+oy, p2.x+ox, p2.y+oy);
    }
    if (closed) ctx.closePath();
  }

  function marchContour(ctx: CanvasRenderingContext2D, grid: number[][], level: number, cw: number, ch: number, wx: number, wy: number) {
    const rows = grid.length - 1, cols = grid[0].length - 1;
    const rand2 = mulberry32(seed ^ Math.floor(level * 1000));
    const allSegs: [Pt,Pt][] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tl=grid[r][c], tr=grid[r][c+1], bl=grid[r+1][c], br=grid[r+1][c+1];
        const x = c*cw, y = r*ch;
        const idx = (tl>level?8:0)|(tr>level?4:0)|(br>level?2:0)|(bl>level?1:0);
        if (idx===0||idx===15) continue;
        const top    = {x: x+cw*((level-tl)/(tr-tl+1e-9)), y};
        const right  = {x: x+cw, y: y+ch*((level-tr)/(br-tr+1e-9))};
        const bottom = {x: x+cw*((level-bl)/(br-bl+1e-9)), y: y+ch};
        const left   = {x, y: y+ch*((level-tl)/(bl-tl+1e-9))};
        switch(idx) {
          case 1:  allSegs.push([left,bottom]); break;
          case 2:  allSegs.push([bottom,right]); break;
          case 3:  allSegs.push([left,right]); break;
          case 4:  allSegs.push([top,right]); break;
          case 5:  allSegs.push([left,top],[bottom,right]); break;
          case 6:  allSegs.push([top,bottom]); break;
          case 7:  allSegs.push([left,top]); break;
          case 8:  allSegs.push([left,top]); break;
          case 9:  allSegs.push([top,bottom]); break;
          case 10: allSegs.push([left,bottom],[top,right]); break;
          case 11: allSegs.push([top,right]); break;
          case 12: allSegs.push([left,right]); break;
          case 13: allSegs.push([bottom,right]); break;
          case 14: allSegs.push([left,bottom]); break;
        }
      }
    }

    if (curviness === 0 || lineStyle === 'wiggly') {
      for (const [a, b] of allSegs) {
        if (lineStyle === 'wiggly') drawWiggly(ctx, a.x+wx, a.y+wy, b.x+wx, b.y+wy, rand2);
        else { ctx.moveTo(a.x+wx, a.y+wy); ctx.lineTo(b.x+wx, b.y+wy); }
      }
      return;
    }

    // Chain segments — use a point-keyed map for O(n) lookup
    const EPS = 0.5;
    const key = (p: Pt) => `${Math.round(p.x/EPS)},${Math.round(p.y/EPS)}`;

    // Build adjacency: endpoint -> [segIndex, endIndex(0 or 1)]
    type EndRef = {si: number, ei: 0|1};
    const endMap = new Map<string, EndRef[]>();
    const addEnd = (p: Pt, si: number, ei: 0|1) => {
      const k = key(p);
      if (!endMap.has(k)) endMap.set(k, []);
      endMap.get(k)!.push({si, ei});
    };
    for (let i = 0; i < allSegs.length; i++) {
      addEnd(allSegs[i][0], i, 0);
      addEnd(allSegs[i][1], i, 1);
    }

    const used = new Uint8Array(allSegs.length);
    const chains: {pts: Pt[], closed: boolean}[] = [];

    for (let start = 0; start < allSegs.length; start++) {
      if (used[start]) continue;
      used[start] = 1;
      const chain: Pt[] = [allSegs[start][0], allSegs[start][1]];

      // grow forward
      let growing = true;
      while (growing) {
        growing = false;
        const tail = chain[chain.length-1];
        const refs = endMap.get(key(tail)) ?? [];
        for (const {si, ei} of refs) {
          if (used[si]) continue;
          used[si] = 1;
          chain.push(allSegs[si][ei === 0 ? 1 : 0]);
          growing = true;
          break;
        }
      }
      // grow backward
      growing = true;
      while (growing) {
        growing = false;
        const head = chain[0];
        const refs = endMap.get(key(head)) ?? [];
        for (const {si, ei} of refs) {
          if (used[si]) continue;
          used[si] = 1;
          chain.unshift(allSegs[si][ei === 0 ? 1 : 0]);
          growing = true;
          break;
        }
      }

      // Check if closed loop: head ≈ tail
      const h = chain[0], t = chain[chain.length-1];
      const isClosed = Math.abs(h.x-t.x) < EPS*2 && Math.abs(h.y-t.y) < EPS*2;
      if (isClosed) chain.pop(); // remove duplicate endpoint for closed curves
      chains.push({pts: chain, closed: isClosed});
    }

    for (const {pts, closed} of chains) {
      // Short closed chains (≤6 pts) are tiny islands — clamp tension hard to avoid box artifacts
      const maxT = pts.length <= 4 ? 0 : pts.length <= 8 ? curviness * 0.3 : curviness;
      catmullBez(ctx, pts, maxT, wx, wy, closed);
    }
  }

  function drawWiggly(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, rand: ()=>number) {
    const dx = x2-x1, dy = y2-y1;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (len < 1) return;
    const nx = -dy/len, ny = dx/len;
    const steps = Math.max(2, Math.floor(len / 4));
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const t = i/steps;
      const bx = x1+dx*t, by = y1+dy*t;
      const w = Math.sin(t * Math.PI * wiggleFreq * len) * wiggleAmp * (rand()*0.6+0.7);
      ctx.lineTo(bx+nx*w, by+ny*w);
    }
  }

  function drawCircles(ctx: CanvasRenderingContext2D, grid: number[][], w: number, h: number) {
    const rows = grid.length, cols = grid[0].length;
    const cellW = w/cols, cellH = h/rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = grid[r][c];
        const cx = (c+0.5)*cellW, cy = (r+0.5)*cellH;
        const maxR = Math.min(cellW, cellH)*0.5;
        const numRings = Math.round(v*lineCount*0.4)+1;
        for (let i = 1; i <= numRings; i++) {
          const rad = (i/(numRings+1))*maxR;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI*2);
          ctx.stroke();
        }
      }
    }
  }

  function drawRidges(ctx: CanvasRenderingContext2D, grid: number[][], w: number, h: number, r1: number[], r2: number[]) {
    const rows = grid.length, cols = grid[0].length;
    const cellW = w/(cols-1), cellH = h/(rows-1);
    for (let r = 0; r < rows; r++) {
      const t = r/(rows-1);
      const alpha = lineOpacity*(0.3+t*0.6);
      const [cr,cg,cb] = useGradient ? lerpColor(r1,r2,t) : r1;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const x = c*cellW, y = r*cellH - grid[r][c]*(h/rows)*2.5;
        if (c===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }

  function hexToRgb(hex: string) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function lerpColor(c1: number[], c2: number[], t: number) {
    return c1.map((v,i) => Math.round(v+(c2[i]-v)*t));
  }

  // ── Generate ──────────────────────────────────────────────────────────
  function generate() {
    if (!canvas) return;
    generating = true;
    // Double rAF: first frame flushes Svelte state (shows overlay), second does the work
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      const bg = invertColors ? lineColor : bgColor;
      const fg = invertColors ? bgColor : lineColor;
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,canvasW,canvasH);

      // Clip so edge-crossing curves don't snap back outside canvas
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, canvasH);
      ctx.clip();

      if (rotation !== 0) {
        ctx.save();
        ctx.translate(canvasW/2,canvasH/2);
        ctx.rotate(rotation*Math.PI/180);
        ctx.translate(-canvasW/2,-canvasH/2);
      }

      const rand = mulberry32(seed);
      const cols = 128, rows = Math.max(4, Math.round(128*canvasH/canvasW));
      const cellW = canvasW/(cols-1), cellH = canvasH/(rows-1);
      const grid = buildGrid(rand, cols, rows, smoothness);

      const [r1,g1,b1] = hexToRgb(fg);
      const [r2,g2,b2] = hexToRgb(lineColor2);

      if (lineStyle==='dashed') ctx.setLineDash([dashLen,dashGap]);
      else if (lineStyle==='dotted') ctx.setLineDash([lineWidth*1.5,dashGap]);
      else ctx.setLineDash([]);
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      const drawMirror = (fn: (wx:number,wy:number)=>void) => {
        fn(0,0);
        if (mirrorX) { ctx.save(); ctx.scale(-1,1); ctx.translate(-canvasW,0); fn(0,0); ctx.restore(); }
        if (mirrorY) { ctx.save(); ctx.scale(1,-1); ctx.translate(0,-canvasH); fn(0,0); ctx.restore(); }
        if (mirrorX&&mirrorY) { ctx.save(); ctx.scale(-1,-1); ctx.translate(-canvasW,-canvasH); fn(0,0); ctx.restore(); }
      };

      if (shapeMode==='contour') {
        for (let i = 0; i < lineCount; i++) {
          const level = (i+1)/(lineCount+1);
          const t = i/(lineCount-1||1);
          const alpha = lineOpacity*(0.25+t*0.65);
          const [cr,cg,cb] = useGradient ? lerpColor([r1,g1,b1],[r2,g2,b2],t) : [r1,g1,b1];
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          if (fillMode) ctx.fillStyle = `rgba(${cr},${cg},${cb},${fillOpacity*lineOpacity})`;
          ctx.beginPath();
          drawMirror((wx,wy) => marchContour(ctx,grid,level,cellW,cellH,wx,wy));
          ctx.stroke();
          if (fillMode) ctx.fill();
        }
      } else if (shapeMode==='circles') {
        ctx.strokeStyle = `rgba(${r1},${g1},${b1},${lineOpacity})`;
        drawCircles(ctx,grid,canvasW,canvasH);
      } else if (shapeMode==='ridges') {
        drawRidges(ctx,grid,canvasW,canvasH,[r1,g1,b1],[r2,g2,b2]);
      }

      if (rotation!==0) ctx.restore();
      ctx.restore(); // end clip
      ctx.setLineDash([]);
      generating = false;
    }));
  }

  function randomize() { seed = Math.floor(Math.random()*99999); }

  $effect(() => {
    const _ = seed+lineCount+smoothness+curviness+lineWidth+bgColor+lineColor+lineColor2
      +String(useGradient)+canvasW+canvasH+shapeMode+lineStyle+dashLen+dashGap+wiggleAmp+wiggleFreq
      +lineOpacity+String(invertColors)+String(mirrorX)+String(mirrorY)+rotation+String(fillMode)+fillOpacity;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Topographic Lines · Generators · Omar's Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<!-- Tooltip -->
{#if tooltip}
  <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">{tooltip.text}</div>
{/if}

<SaveDialog
  open={showSave}
  defaultName={`topo-${seed}`}
  apiKey={apiKey}
  onconfirm={(name) => { const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=name; a.click(); }}
  onsave={async (name, folderId) => {
    const dataUrl = canvas.toDataURL('image/png');
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], name, { type: 'image/png' });
    const CHUNK = 18 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK));
    const chunks: any[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const sliceBlob = file.slice(i * CHUNK, Math.min((i + 1) * CHUNK, file.size));
      const form = new FormData();
      form.append('file', new Blob([sliceBlob], { type: 'image/png' }), name);
      const r = await fetch('/api/telegram/uploadChunk', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'X-Chunk-Index': String(i), 'X-File-Name': encodeURIComponent(name) },
        body: form,
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      chunks.push(d);
    }
    const fin = await fetch('/api/telegram/finalizeUpload', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: name, type: 'image/png', totalBytes: file.size, chunks, folderId: folderId ?? null }),
    });
    const j = await fin.json();
    if (j.error) throw new Error(j.error);
  }}
  onclose={() => showSave=false}
/>

<div class="page">
  <header class="topbar">
    <a href="/" class="back-btn"><IconArrowLeft size={16} stroke={1.8}/> Back</a>
    <span class="topbar-title">Topographic Lines</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize} disabled={generating}><IconRefresh size={15}/> Randomize</button>
      <button class="action-btn primary" onclick={() => showSave=true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas bind:this={canvas} class="preview-canvas"></canvas>
      {#if generating}<div class="gen-overlay">generating...</div>{/if}
    </div>

    <aside class="controls">

      <!-- Templates -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Templates</h3>
        <div class="template-grid">
          {#each TEMPLATES as tpl}
            <button class="tpl-btn" onclick={tpl.apply} title={tpl.desc}>{tpl.name}</button>
          {/each}
        </div>
      </section>

      <!-- Shape -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Shape</h3>
        <div class="chip-row">
          {#each ['contour','circles','ridges'] as m}
            <button class="chip" class:active={shapeMode===m} onclick={()=>shapeMode=m as ShapeMode}>{m}</button>
          {/each}
        </div>
      </section>

      <!-- Line style -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Line style</h3>
        <div class="chip-row">
          {#each ['solid','dashed','dotted','wiggly'] as s}
            <button class="chip" class:active={lineStyle===s} onclick={()=>lineStyle=s as LineStyle}>{s}</button>
          {/each}
        </div>
        {#if lineStyle==='dashed'||lineStyle==='dotted'}
          <div class="ctrl-group">
            <label for="dashLen"><span class="label-row">Dash len <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.dashLen)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{dashLen}</span></label>
            <input id="dashLen" type="range" bind:value={dashLen} min="2" max="40"/>
          </div>
          <div class="ctrl-group">
            <label for="dashGap"><span class="label-row">Gap <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.dashGap)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{dashGap}</span></label>
            <input id="dashGap" type="range" bind:value={dashGap} min="1" max="40"/>
          </div>
        {/if}
        {#if lineStyle==='wiggly'}
          <div class="ctrl-group">
            <label for="wiggleAmp"><span class="label-row">Amplitude <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.wiggleAmp)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{wiggleAmp}</span></label>
            <input id="wiggleAmp" type="range" bind:value={wiggleAmp} min="0.5" max="12" step="0.5"/>
          </div>
          <div class="ctrl-group">
            <label for="wiggleFreq"><span class="label-row">Frequency <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.wiggleFreq)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{wiggleFreq}</span></label>
            <input id="wiggleFreq" type="range" bind:value={wiggleFreq} min="0.05" max="1" step="0.05"/>
          </div>
        {/if}
      </section>

      <!-- Terrain -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Terrain</h3>
        <div class="ctrl-group">
          <label for="seed"><span class="label-row">Seed <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.seed)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val mono">{seed}</span></label>
          <input id="seed" type="number" bind:value={seed} min="0" max="99999"/>
        </div>
        <div class="ctrl-group">
          <label for="lineCount"><span class="label-row">Lines / density <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.lineCount)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{lineCount}</span></label>
          <input id="lineCount" type="range" bind:value={lineCount} min="3" max="60"/>
        </div>
        <div class="ctrl-group">
          <label for="smoothness"><span class="label-row">Smoothness <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.smoothness)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{smoothness}</span></label>
          <input id="smoothness" type="range" bind:value={smoothness} min="1" max="18"/>
        </div>
        <div class="ctrl-group">
          <label for="curviness"><span class="label-row">Curviness <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.curviness)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{curviness===0?'blocky':curviness===1?'smooth':curviness.toFixed(2)}</span></label>
          <input id="curviness" type="range" bind:value={curviness} min="0" max="1" step="0.05"/>
          <div class="range-labels"><span>blocky</span><span>smooth</span></div>
        </div>
      </section>

      <!-- Lines -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Lines</h3>
        <div class="ctrl-group">
          <label for="lineWidth"><span class="label-row">Width <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.lineWidth)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{lineWidth}</span></label>
          <input id="lineWidth" type="range" bind:value={lineWidth} min="0.3" max="8" step="0.1"/>
        </div>
        <div class="ctrl-group">
          <label for="lineOpacity"><span class="label-row">Opacity <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.lineOpacity)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{lineOpacity}</span></label>
          <input id="lineOpacity" type="range" bind:value={lineOpacity} min="0.05" max="1" step="0.05"/>
        </div>
        <div class="toggle-row">
          <span class="label-row toggle-label">Fill between lines <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.fillMode)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={fillMode} onclick={()=>fillMode=!fillMode}>{fillMode?'on':'off'}</button>
        </div>
        {#if fillMode}
          <div class="ctrl-group">
            <label for="fillOpacity"><span class="label-row">Fill opacity <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.fillOpacity)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{fillOpacity}</span></label>
            <input id="fillOpacity" type="range" bind:value={fillOpacity} min="0.01" max="0.5" step="0.01"/>
          </div>
        {/if}
      </section>

      <!-- Colors -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Colors</h3>
        <div class="ctrl-group">
          <label for="bgColor"><span class="label-row">Background <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.bgColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="bgColor" type="color" bind:value={bgColor} class="color-swatch"/>
            <span class="mono small">{bgColor}</span>
          </div>
        </div>
        <div class="ctrl-group">
          <label for="lineColor"><span class="label-row">Line color <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.lineColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="lineColor" type="color" bind:value={lineColor} class="color-swatch"/>
            <span class="mono small">{lineColor}</span>
          </div>
        </div>
        <div class="toggle-row">
          <span class="label-row toggle-label">Color gradient <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.useGradient)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={useGradient} onclick={()=>useGradient=!useGradient}>{useGradient?'on':'off'}</button>
        </div>
        {#if useGradient}
          <div class="ctrl-group">
            <label for="lineColor2"><span class="label-row">Second color <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.lineColor2)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
            <div class="color-row">
              <input id="lineColor2" type="color" bind:value={lineColor2} class="color-swatch"/>
              <span class="mono small">{lineColor2}</span>
            </div>
          </div>
        {/if}
        <div class="toggle-row">
          <span class="label-row toggle-label">Invert colors <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.invertColors)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={invertColors} onclick={()=>invertColors=!invertColors}>{invertColors?'on':'off'}</button>
        </div>
      </section>

      <!-- Transform -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Transform</h3>
        <div class="ctrl-group">
          <label for="rotation"><span class="label-row">Rotation <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.rotation)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{rotation}°</span></label>
          <input id="rotation" type="range" bind:value={rotation} min="-180" max="180"/>
        </div>
        <div class="toggle-row">
          <span class="label-row toggle-label">Mirror X <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.mirrorX)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={mirrorX} onclick={()=>mirrorX=!mirrorX}>{mirrorX?'on':'off'}</button>
        </div>
        <div class="toggle-row">
          <span class="label-row toggle-label">Mirror Y <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.mirrorY)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={mirrorY} onclick={()=>mirrorY=!mirrorY}>{mirrorY?'on':'off'}</button>
        </div>
      </section>

      <!-- Canvas -->
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <label><span class="label-row">Size <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.canvasSize)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="200" max="4000" step="100" placeholder="W"/>
            <span class="size-x">×</span>
            <input type="number" bind:value={canvasH} min="200" max="4000" step="100" placeholder="H"/>
          </div>
        </div>
        <div class="preset-row">
          {#each [['16:9','1920x1080'],['1:1','1000x1000'],['4:3','1600x1200'],['Phone','1080x1920']] as [label, size]}
            <button class="chip small" onclick={() => { const [w,h]=size.split('x').map(Number); canvasW=w; canvasH=h; }}>{label}</button>
          {/each}
        </div>
      </section>

    </aside>
  </div>
</div>

<style>
  :global(*,*::before,*::after){box-sizing:border-box;margin:0;}
  :global(body){background:var(--bg-1,#080808);font-family:'Geist',sans-serif;color:var(--text-1,#e2e2e2);}

  .page{min-height:100vh;display:flex;flex-direction:column;}

  .topbar{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid var(--border);background:var(--bg-2);position:sticky;top:0;z-index:10;}
  .back-btn{display:flex;align-items:center;gap:6px;color:var(--text-3);text-decoration:none;font-size:13px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);transition:.13s;white-space:nowrap;}
  .back-btn:hover{color:var(--text-1);border-color:var(--border-hover);}
  .topbar-title{font-size:14px;font-weight:600;color:var(--text-1);flex:1;}
  .topbar-actions{display:flex;gap:8px;}
  .action-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);cursor:pointer;font-family:'Geist',sans-serif;transition:.13s;white-space:nowrap;}
  .action-btn:hover{border-color:var(--border-hover);}
  .action-btn:disabled{opacity:.4;cursor:not-allowed;}
  .action-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
  .action-btn.primary:hover{opacity:.88;}

  .layout{display:flex;flex:1;min-height:0;}
  .preview-wrap{flex:1;padding:20px;display:flex;align-items:flex-start;justify-content:center;position:relative;min-width:0;background:var(--bg-1);}
  .preview-canvas{max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border);display:block;}
  .gen-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:var(--text-3);font-size:13px;font-family:'Geist Mono',monospace;}

  .controls{width:270px;flex-shrink:0;background:var(--bg-2);border-left:1px solid var(--border);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
  .ctrl-section{padding:12px 0;border-bottom:1px solid var(--border);}
  .ctrl-section:last-child{border-bottom:none;}
  .ctrl-section-title{font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;}

  .ctrl-group{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
  .ctrl-group:last-child{margin-bottom:0;}
  .ctrl-group label{font-size:12.5px;color:var(--text-2);font-weight:500;display:flex;justify-content:space-between;align-items:center;}
  .ctrl-val{color:var(--text-3);font-weight:400;}
  .mono{font-family:'Geist Mono',monospace;}
  .small{font-size:11px;}

  /* Label row with info icon */
  .label-row{display:flex;align-items:center;gap:4px;}
  .tip-btn{background:none;border:none;padding:0;cursor:pointer;color:var(--text-3);display:flex;align-items:center;transition:color .13s;line-height:1;}
  .tip-btn:hover{color:var(--accent);}

  /* Tooltip */
  .tooltip{position:fixed;transform:translate(-50%,-100%);background:#1e1e2e;border:1px solid var(--border);color:var(--text-2);font-size:11.5px;padding:6px 10px;border-radius:7px;max-width:220px;text-align:center;pointer-events:none;z-index:9999;line-height:1.4;white-space:normal;font-family:'Geist',sans-serif;}

  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}

  .size-row{display:flex;align-items:center;gap:6px;}
  .size-row input{flex:1;}
  .size-x{color:var(--text-3);font-size:13px;flex-shrink:0;}
  .preset-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}

  .color-row{display:flex;align-items:center;gap:10px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .color-row .mono{font-size:11.5px;color:var(--text-3);}

  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip.small{padding:3px 8px;font-size:11px;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}

  .range-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--text-3);font-family:'Geist Mono',monospace;margin-top:2px;}

  .toggle-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .toggle-label{font-size:12.5px;color:var(--text-2);}
  .toggle{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-3);font-size:11px;font-family:'Geist Mono',monospace;cursor:pointer;transition:.13s;}
  .toggle.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}

  /* Templates */
  .template-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
  .tpl-btn{padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11.5px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tpl-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.08);}

  @media(max-width:700px){
    .layout{flex-direction:column;}
    .controls{width:100%;border-left:none;border-top:1px solid var(--border);}
    .topbar-title{display:none;}
  }
</style>
