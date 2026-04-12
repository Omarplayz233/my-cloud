<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';

  let { data } = $props();

  onMount(() => {
    const saved = localStorage.getItem('theme') ?? 'system';
    const isDark = saved === 'dark' || (saved === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    const vars = isDark ? DARK : LIGHT;
    const el = document.documentElement;
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    generate();
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5'};

  // ── Settings (mirrors the API params) ────────────────────────────────
  let canvasW      = $state(800);
  let canvasH      = $state(600);
  let glitchI      = $state(1.0);
  let noiseI       = $state(1.0);
  let scanI        = $state(1.0);
  let shiftI       = $state(1.0);
  let screenPush   = $state(false);
  let screenPushI  = $state(0.2);
  let cleanPush    = $state(false);
  let pushStart    = $state(0.5);
  let pushInt      = $state(1.0);
  let slicePush    = $state(false);
  let sliceCount   = $state(3);
  let sliceInt     = $state(1.0);
  let dust         = $state(false);
  let dustOpacity  = $state(0.3);
  let dustDensity  = $state(0.0005);
  let dustColor    = $state<'brown'|'gray'>('brown');
  let rectStyle    = $state<'split'|'solid'|'noise'>('split');
  let vlineCount   = $state(1);
  let vlineNoise   = $state(0.3);
  let vlineTemp    = $state<'auto'|'warm'|'cool'|'neon'>('auto');
  let showSave     = $state(false);
  let canvas: HTMLCanvasElement;
  let generating   = $state(false);
  let liveMode     = $state(false);
  let animFrame    = 0;

  function startLive() {
    cancelAnimationFrame(animFrame);
    if (!liveMode) return;
    function loop() {
      if (!liveMode) return;
      generate();
      animFrame = requestAnimationFrame(loop);
    }
    animFrame = requestAnimationFrame(loop);
  }

  $effect(() => {
    if (liveMode) startLive();
    else cancelAnimationFrame(animFrame);
  });

  // ── Helpers ───────────────────────────────────────────────────────────
  function clamp(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // ── All effect functions operating on Uint8ClampedArray ──────────────

  function drawColorBars(d: Uint8ClampedArray, w: number, h: number) {
    const cols: [number,number,number][] = [
      [255,0,0],[255,165,0],[255,255,0],[0,180,255],[0,255,0],[255,0,255],[0,0,255]
    ];
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    const bw = Math.floor(w / cols.length);
    for (let i = 0; i < cols.length; i++) {
      const [r,g,b] = cols[i];
      const x0 = i * bw, x1 = i === cols.length - 1 ? w : x0 + bw;
      for (let x = x0; x < x1; x++) {
        for (let y = 0; y < h; y++) {
          const idx = (w * y + x) * 4;
          const f = ((x + y) / (w + h)) * 0.4;
          d[idx]   = r * (1 - f);
          d[idx+1] = g * (1 - f);
          d[idx+2] = b * (1 - f);
          d[idx+3] = 255;
        }
      }
    }
  }

  function applyScreenPush(d: Uint8ClampedArray, w: number, h: number, intensity: number) {
    const buf = new Uint8ClampedArray(d);
    const off = Math.floor((Math.random() < 0.5 ? -1 : 1) * w * intensity);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = ((x - off) % w + w) % w;
        const si = (w * y + srcX) * 4, di = (w * y + x) * 4;
        d[di]=buf[si]; d[di+1]=buf[si+1]; d[di+2]=buf[si+2]; d[di+3]=buf[si+3];
      }
    }
  }

  function applyCleanPush(d: Uint8ClampedArray, w: number, h: number, startFrac: number, intensity: number) {
    const orig = new Uint8ClampedArray(d);
    const startY = Math.floor(h * startFrac);
    const maxOff = Math.floor(w * 0.5 * intensity);
    for (let y = startY; y < h; y++) {
      const rel = (y - startY) / (h - startY);
      const off = Math.floor(maxOff * rel);
      for (let x = 0; x < w; x++) {
        const srcX = ((x - off) % w + w) % w;
        const di = (w * y + x) * 4, si = (w * y + srcX) * 4;
        d[di]=orig[si]; d[di+1]=orig[si+1]; d[di+2]=orig[si+2]; d[di+3]=orig[si+3];
      }
    }
    if (startY >= 0 && startY < h) {
      for (let x = 0; x < w; x++) {
        const idx = (w * startY + x) * 4;
        d[idx]=d[idx+1]=d[idx+2]=255;
      }
    }
  }

  function applySlicePush(d: Uint8ClampedArray, w: number, h: number, count: number, intensity: number) {
    const orig = new Uint8ClampedArray(d);
    for (let i = 0; i < count; i++) {
      const y = Math.floor(Math.random() * h);
      const thickness = Math.max(1, Math.floor(intensity * 5));
      const offset = Math.floor((Math.random()<0.5?-1:1) * intensity * 20);
      for (let dy = 0; dy < thickness; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let x = 0; x < w; x++) {
          const si = (w * yy + x) * 4;
          const dstX = ((x + offset) % w + w) % w;
          const di = (w * yy + dstX) * 4;
          d[di]=orig[si]; d[di+1]=orig[si+1]; d[di+2]=orig[si+2]; d[di+3]=orig[si+3];
        }
      }
    }
  }

  function applyScanlines(d: Uint8ClampedArray, w: number, h: number, I: number) {
    const base = 0.5 * I;
    for (let y = 0; y < h; y++) {
      if (Math.random() < 0.3) {
        const li = base * (0.7 + (y / h) * 0.3);
        for (let x = 0; x < w; x++) {
          const idx = (w * y + x) * 4;
          d[idx]   = clamp(d[idx]   * (1 - li));
          d[idx+1] = clamp(d[idx+1] * (1 - li));
          d[idx+2] = clamp(d[idx+2] * (1 - li));
        }
      }
    }
  }

  function applyVignette(d: Uint8ClampedArray, w: number, h: number, strength: number) {
    const cx = w/2, cy = h/2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x-cx)/cx, dy = (y-cy)/cy;
        const v = Math.max(0, 1 - strength * Math.sqrt(dx*dx+dy*dy));
        const idx = (w * y + x) * 4;
        d[idx]*=v; d[idx+1]*=v; d[idx+2]*=v;
      }
    }
  }

  function addVerticalGlitchLine(d: Uint8ClampedArray, w: number, h: number, I: number) {
    // Pick base hue from temperature setting
    function pickColor(): [number,number,number] {
      const t = vlineTemp;
      if (t === 'warm') {
        // reds, oranges, yellows
        const hues: [number,number,number][] = [[255,60,0],[255,180,0],[255,220,30],[255,80,30],[200,40,0]];
        return hues[Math.floor(Math.random()*hues.length)];
      } else if (t === 'cool') {
        // blues, cyans, purples
        const hues: [number,number,number][] = [[0,180,255],[80,100,255],[160,0,255],[0,255,220],[30,80,200]];
        return hues[Math.floor(Math.random()*hues.length)];
      } else if (t === 'neon') {
        // hot pinks, electric greens, acid yellows
        const hues: [number,number,number][] = [[255,0,180],[0,255,60],[200,255,0],[255,0,255],[0,255,255]];
        return hues[Math.floor(Math.random()*hues.length)];
      } else {
        // auto — random full hue
        const h6 = Math.random() * 6;
        const s = Math.floor(h6), f = h6 - s;
        const q = Math.floor((1 - f) * 255), t2 = Math.floor(f * 255);
        const palette: [number,number,number][] = [
          [255,t2,0],[q,255,0],[0,255,t2],[0,q,255],[t2,0,255],[255,0,q]
        ];
        return palette[s % 6];
      }
    }

    const count = Math.max(1, vlineCount);
    for (let li = 0; li < count; li++) {
      const [cr, cg, cb] = pickColor();
      const x0  = Math.floor(Math.random() * w);
      const lw  = Math.max(1, Math.floor(I * (1 + Math.random() * 2)));
      const y0  = Math.floor(Math.random() * h * 0.9);
      const lh  = Math.floor(h * (0.05 + Math.random() * 0.5));

      for (let y = y0; y < y0 + lh && y < h; y++) {
        for (let x = x0; x < x0 + lw && x < w; x++) {
          const idx = (w * y + x) * 4;
          // Per-pixel noise on the color
          const nr = vlineNoise > 0 ? Math.floor((Math.random()*2-1) * vlineNoise * 80) : 0;
          const ng = vlineNoise > 0 ? Math.floor((Math.random()*2-1) * vlineNoise * 80) : 0;
          const nb = vlineNoise > 0 ? Math.floor((Math.random()*2-1) * vlineNoise * 80) : 0;
          // Also randomly skip pixels for a scanline-within-line effect
          if (vlineNoise > 0 && Math.random() < vlineNoise * 0.3) continue;
          d[idx]   = clamp(cr + nr);
          d[idx+1] = clamp(cg + ng);
          d[idx+2] = clamp(cb + nb);
          d[idx+3] = 255;
        }
      }
    }
  }

  function applyTiltGlitch(d: Uint8ClampedArray, w: number, h: number, I: number) {
    const buf = new Uint8ClampedArray(d);
    const bh = Math.floor(h * 0.1);
    const y0 = Math.floor(Math.random() * (h - bh));
    const off = (Math.random()<0.5?-1:1) * (1 + Math.floor(Math.random()*8));
    for (let y = y0; y < y0+bh; y++) {
      for (let x = 0; x < w; x++) {
        const di = (w*y+x)*4;
        const srcY = Math.max(y0, Math.min(h-1, y-off));
        const si = (w*srcY+x)*4;
        d[di]=buf[si]; d[di+1]=buf[si+1]; d[di+2]=buf[si+2]; d[di+3]=buf[si+3];
      }
    }
  }

  function addScratches(d: Uint8ClampedArray, w: number, h: number, I: number) {
    const cnt = Math.floor(5 + Math.random() * 5);
    for (let i = 0; i < cnt; i++) {
      const x0 = Math.random()*w, y0 = Math.random()*h;
      const len = 20 + Math.random()*(w/2);
      const t = Math.random()<0.5?1:2;
      for (let j = 0; j < len; j++) {
        for (let tt = 0; tt < t; tt++) {
          const x = Math.floor(x0+j), y = Math.floor(y0+tt+(Math.random()*2-1));
          if (x>=0&&x<w&&y>=0&&y<h) {
            const idx=(w*y+x)*4;
            d[idx]=d[idx+1]=d[idx+2]=255; d[idx+3]=255;
          }
        }
      }
    }
  }

  function addRandomGlitchLines(d: Uint8ClampedArray, w: number, h: number, I: number) {
    const cnt = Math.floor(h * 0.15 * I);
    for (let i = 0; i < cnt; i++) {
      const y   = Math.floor(Math.random()*h*0.7);
      const off = Math.floor(Math.random()*40*I) - 20*I;
      const len = Math.floor(Math.random()*w*0.8) + w*0.2;
      const x0  = Math.floor(Math.random()*(w-len));
      for (let x = x0; x < x0+len; x++) {
        const idx = (w*y+x)*4;
        d[idx]  =clamp(d[idx]  +off);
        d[idx+1]=clamp(d[idx+1]+off);
        d[idx+2]=clamp(d[idx+2]+off);
      }
    }
  }

  function darkenBottomRegion(d: Uint8ClampedArray, w: number, h: number, rH: number, rW: number) {
    const bh = Math.floor(h*rH), y0 = h-bh;
    const bw  = Math.floor(w * (rW + (Math.random() * 0.15)));
    const x0  = Math.floor(w * (0.1 + Math.random() * 0.6));
    const yOff = Math.floor(bh * (0.1 + Math.random() * 0.4));
    // Pick solid color once if needed
    const sr = 120 + Math.floor(Math.random()*135);
    const sg = 120 + Math.floor(Math.random()*135);
    const sb = 120 + Math.floor(Math.random()*135);
    for (let y = y0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (w*y+x)*4;
        const inBright = x>=x0 && x<x0+bw && y>y0+yOff;
        if (!inBright) {
          d[idx]*=0.3; d[idx+1]*=0.3; d[idx+2]*=0.3;
        } else {
          if (rectStyle === 'solid') {
            d[idx]=sr; d[idx+1]=sg; d[idx+2]=sb;
          } else if (rectStyle === 'noise') {
            d[idx]  = clamp(d[idx]   + Math.floor(Math.random()*180 - 40));
            d[idx+1]= clamp(d[idx+1] + Math.floor(Math.random()*180 - 40));
            d[idx+2]= clamp(d[idx+2] + Math.floor(Math.random()*180 - 40));
          } else {
            // split (original)
            d[idx]  = 140 + Math.floor(Math.random()*40);
            d[idx+1]= 220 + Math.floor(Math.random()*35);
            d[idx+2]= Math.floor(Math.random()*30);
          }
        }
      }
    }
  }

  function applyPushGlitch(d: Uint8ClampedArray, w: number, h: number, rH: number, I: number) {
    const buf = new Uint8ClampedArray(d);
    const bh = Math.floor(h*rH), y0 = h-bh;
    const xL = Math.floor(w*0.25), xR = Math.floor(w*0.75);
    for (let y = y0; y < h; y++) {
      const off = (Math.random()<0.5?-1:1)*(1+Math.floor(Math.random()*4));
      for (let x = xL; x < xR; x++) {
        const di = (w*y+x)*4;
        const srcY = Math.max(y0,Math.min(h-1,y-off));
        const si = (w*srcY+x)*4;
        d[di]=buf[si]; d[di+1]=buf[si+1]; d[di+2]=buf[si+2]; d[di+3]=buf[si+3];
      }
    }
  }

  function applyRGBSplit(d: Uint8ClampedArray, w: number, h: number, I: number) {
    const buf = new Uint8ClampedArray(d);
    const off = Math.ceil(2 * I);
    for (let y = 0; y < h; y++) {
      for (let x = off; x < w-off; x++) {
        const di   = (w*y+x)*4;
        const rsrc = (w*y+(x-off))*4;
        const bsrc = (w*y+(x+off))*4;
        d[di]   = buf[rsrc];
        d[di+2] = buf[bsrc+2];
      }
    }
  }

  function boxBlur(buf: Uint8ClampedArray, w: number, h: number) {
    const tmp = new Uint8ClampedArray(buf);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r=0,g=0,b=0,a=0,cnt=0;
        for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
          const nx=x+dx,ny=y+dy;
          if (nx>=0&&nx<w&&ny>=0&&ny<h) {
            const i=(w*ny+nx)*4;
            r+=tmp[i];g+=tmp[i+1];b+=tmp[i+2];a+=tmp[i+3];cnt++;
          }
        }
        const idx=(w*y+x)*4;
        buf[idx]=r/cnt;buf[idx+1]=g/cnt;buf[idx+2]=b/cnt;buf[idx+3]=a/cnt;
      }
    }
  }

  function applyBloom(d: Uint8ClampedArray, w: number, h: number, threshold=200, strength=0.5) {
    const mask = new Uint8ClampedArray(w*h*4);
    for (let i = 0; i < w*h; i++) {
      const idx=i*4;
      const lum=0.2126*d[idx]+0.7152*d[idx+1]+0.0722*d[idx+2];
      if (lum > threshold) {
        mask[idx]=d[idx];mask[idx+1]=d[idx+1];mask[idx+2]=d[idx+2];mask[idx+3]=255;
      }
    }
    boxBlur(mask,w,h); boxBlur(mask,w,h); boxBlur(mask,w,h);
    for (let i = 0; i < w*h; i++) {
      const idx=i*4;
      d[idx]  =clamp(d[idx]  +mask[idx]  *strength);
      d[idx+1]=clamp(d[idx+1]+mask[idx+1]*strength);
      d[idx+2]=clamp(d[idx+2]+mask[idx+2]*strength);
    }
  }

  function applyChromaticAberration(d: Uint8ClampedArray, w: number, h: number, offset=2) {
    const buf = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx=(w*y+x)*4;
        if (x-offset>=0)   d[idx]   = buf[(w*y+(x-offset))*4];
        if (x+offset<w)    d[idx+2] = buf[(w*y+(x+offset))*4+2];
      }
    }
  }

  function addNoise(d: Uint8ClampedArray, w: number, h: number, intensity: number) {
    for (let y = 0; y < h; y++) {
      const vf = 1 - (y/h)*0.5;
      for (let x = 0; x < w; x++) {
        const idx=(w*y+x)*4;
        const n=((Math.random()*2-1)*intensity*15*vf)|0;
        d[idx]  =clamp(d[idx]  +n);
        d[idx+1]=clamp(d[idx+1]+n);
        d[idx+2]=clamp(d[idx+2]+n);
      }
    }
  }

  function addDust(d: Uint8ClampedArray, w: number, h: number, opacity: number, density: number, colorName: string) {
    const count = Math.floor(w*h*density);
    for (let i = 0; i < count; i++) {
      const x=Math.floor(Math.random()*w), y=Math.floor(Math.random()*h);
      const idx=(w*y+x)*4;
      let r,g,b;
      if (colorName==='gray') {
        const v=100+Math.floor(Math.random()*56); r=g=b=v;
      } else {
        r=120+Math.floor(Math.random()*81);
        g=80+Math.floor(Math.random()*71);
        b=50+Math.floor(Math.random()*51);
      }
      d[idx]  =clamp(d[idx]  *(1-opacity)+r*opacity);
      d[idx+1]=clamp(d[idx+1]*(1-opacity)+g*opacity);
      d[idx+2]=clamp(d[idx+2]*(1-opacity)+b*opacity);
      d[idx+3]=255;
    }
  }

  // ── Main generate (mirrors the API pipeline exactly) ──────────────────
  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const W = canvasW, H = canvasH;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(W, H);
      const d = img.data;

      // 1. Base color bars
      drawColorBars(d, W, H);

      // 1a. Screen push
      if (screenPush && screenPushI > 0) applyScreenPush(d, W, H, screenPushI);

      // 2. Clean push
      if (cleanPush) applyCleanPush(d, W, H, pushStart, pushInt);

      // 3. Slice push
      if (slicePush && sliceCount > 0) applySlicePush(d, W, H, sliceCount, sliceInt);

      // 4. CRT / glitch effects
      if (scanI > 0) applyScanlines(d, W, H, scanI);
      applyVignette(d, W, H, 0.7);
      if (glitchI > 0) {
        addVerticalGlitchLine(d, W, H, glitchI);
        applyTiltGlitch(d, W, H, glitchI);
        addScratches(d, W, H, glitchI);
        addRandomGlitchLines(d, W, H, glitchI);
      }
      darkenBottomRegion(d, W, H, 0.25, 0.2);
      applyPushGlitch(d, W, H, 0.25, glitchI);
      if (shiftI > 0) applyRGBSplit(d, W, H, shiftI);

      // 5. Bloom
      applyBloom(d, W, H, 200, 0.5);

      // 6. Chromatic aberration
      applyChromaticAberration(d, W, H, 2);

      // 7. Noise
      if (noiseI > 0) addNoise(d, W, H, noiseI);

      // 8. Dust
      if (dust && dustOpacity > 0 && dustDensity > 0) addDust(d, W, H, dustOpacity, dustDensity, dustColor);

      ctx.putImageData(img, 0, 0);
      generating = false;
    }));
  }

  $effect(() => {
    const _ = canvasW+canvasH+glitchI+noiseI+scanI+shiftI+screenPush+screenPushI+cleanPush+pushStart+pushInt+slicePush+sliceCount+sliceInt+dust+dustOpacity+dustDensity+dustColor+rectStyle+vlineCount+vlineNoise+vlineTemp;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Technical Difficulties · Generators</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="glitch"
  apiKey={data?.apiKey ?? ''}
  onconfirm={(name) => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = name; a.click(); }}
  onsave={async (name, folderId) => {
    const key = data?.apiKey ?? '';
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
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
        headers: { 'x-api-key': key, 'X-Chunk-Index': String(i), 'X-File-Name': encodeURIComponent(name) },
        body: form,
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      chunks.push(j);
    }
    const fin = await fetch('/api/telegram/finalizeUpload', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: name, type: 'image/png', totalBytes: file.size, chunks, folderId: folderId ?? null }),
    });
    const fj = await fin.json();
    if (fj.error) throw new Error(fj.error);
  }}
  onclose={() => showSave = false}
/>

<div class="page">
  <header class="topbar">
    <a href="/" class="back-btn"><IconArrowLeft size={16} stroke={1.8}/> Back</a>
    <span class="topbar-title">Technical Difficulties</span>
    <div class="topbar-actions">
      <button class="action-btn" class:live-active={liveMode} onclick={() => liveMode = !liveMode}>
        {liveMode ? '⏹ Stop' : '▶ Live'}
      </button>
      <button class="action-btn" onclick={generate} disabled={generating || liveMode}><IconRefresh size={15}/> Regenerate</button>
      <button class="action-btn primary" onclick={() => showSave = true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas bind:this={canvas} class="preview-canvas"></canvas>
      {#if generating}<div class="gen-overlay">generating...</div>{/if}
    </div>

    <aside class="controls">

      <section class="ctrl-section">
        <h3 class="ctrl-title">Intensities</h3>
        <div class="ctrl-group">
          <label for="glitchI">Glitch <span class="val">{glitchI.toFixed(2)}</span></label>
          <input type="range" id="glitchI" bind:value={glitchI} min="0" max="3" step="0.05"/>
        </div>
        <div class="ctrl-group">
          <label for="noiseI">Noise <span class="val">{noiseI.toFixed(2)}</span></label>
          <input type="range" id="noiseI" bind:value={noiseI} min="0" max="3" step="0.05"/>
        </div>
        <div class="ctrl-group">
          <label for="scanI">Scanlines <span class="val">{scanI.toFixed(2)}</span></label>
          <input type="range" id="scanI" bind:value={scanI} min="0" max="10" step="0.1"/>
        </div>
        <div class="ctrl-group">
          <label for="shiftI">Color shift <span class="val">{shiftI.toFixed(2)}</span></label>
          <input type="range" id="shiftI" bind:value={shiftI} min="0" max="9" step="0.1"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Screen Push</h3>
        <div class="toggle-row">
          <label for="screenPush">Enabled</label>
          <input type="checkbox" id="screenPush" bind:checked={screenPush}/>
        </div>
        {#if screenPush}
        <div class="ctrl-group">
          <label for="screenPushI">Intensity <span class="val">{screenPushI.toFixed(2)}</span></label>
          <input type="range" id="screenPushI" bind:value={screenPushI} min="0" max="1" step="0.01"/>
        </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Clean Push</h3>
        <div class="toggle-row">
          <label for="cleanPush">Enabled</label>
          <input type="checkbox" id="cleanPush" bind:checked={cleanPush}/>
        </div>
        {#if cleanPush}
        <div class="ctrl-group">
          <label for="pushStart">Start <span class="val">{pushStart.toFixed(2)}</span></label>
          <input type="range" id="pushStart" bind:value={pushStart} min="0" max="1" step="0.01"/>
        </div>
        <div class="ctrl-group">
          <label for="pushInt">Intensity <span class="val">{pushInt.toFixed(2)}</span></label>
          <input type="range" id="pushInt" bind:value={pushInt} min="0" max="2" step="0.05"/>
        </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Slice Push</h3>
        <div class="toggle-row">
          <label for="slicePush">Enabled</label>
          <input type="checkbox" id="slicePush" bind:checked={slicePush}/>
        </div>
        {#if slicePush}
        <div class="ctrl-group">
          <label for="sliceCount">Count <span class="val">{sliceCount}</span></label>
          <input type="range" id="sliceCount" bind:value={sliceCount} min="0" max="20" step="1"/>
        </div>
        <div class="ctrl-group">
          <label for="sliceInt">Intensity <span class="val">{sliceInt.toFixed(2)}</span></label>
          <input type="range" id="sliceInt" bind:value={sliceInt} min="0" max="3" step="0.05"/>
        </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Vertical Lines</h3>
        <div class="ctrl-group">
          <label for="vlineCount">Count <span class="val">{vlineCount}</span></label>
          <input type="range" id="vlineCount" bind:value={vlineCount} min="1" max="20" step="1"/>
        </div>
        <div class="ctrl-group">
          <label for="vlineNoise">Noise <span class="val">{vlineNoise.toFixed(2)}</span></label>
          <input type="range" id="vlineNoise" bind:value={vlineNoise} min="0" max="1" step="0.01"/>
        </div>
        <div class="ctrl-group">
          <span class="ctrl-label">Color temp</span>
          <div class="seg">
            <button class="seg-btn" class:active={vlineTemp==='auto'}  onclick={()=>vlineTemp='auto'}>Auto</button>
            <button class="seg-btn" class:active={vlineTemp==='warm'}  onclick={()=>vlineTemp='warm'}>Warm</button>
            <button class="seg-btn" class:active={vlineTemp==='cool'}  onclick={()=>vlineTemp='cool'}>Cool</button>
            <button class="seg-btn" class:active={vlineTemp==='neon'}  onclick={()=>vlineTemp='neon'}>Neon</button>
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Dust</h3>
        <div class="toggle-row">
          <label for="dust">Enabled</label>
          <input type="checkbox" id="dust" bind:checked={dust}/>
        </div>
        {#if dust}
        <div class="ctrl-group">
          <label for="dustOpacity">Opacity <span class="val">{dustOpacity.toFixed(2)}</span></label>
          <input type="range" id="dustOpacity" bind:value={dustOpacity} min="0" max="1" step="0.01"/>
        </div>
        <div class="ctrl-group">
          <label for="dustDensity">Density <span class="val">{dustDensity.toFixed(4)}</span></label>
          <input type="range" id="dustDensity" bind:value={dustDensity} min="0.0001" max="0.01" step="0.0001"/>
        </div>
        <div class="ctrl-group">
          <span class="ctrl-label">Color</span>
          <div class="seg">
            <button class="seg-btn" class:active={dustColor==='brown'} onclick={()=>dustColor='brown'}>Brown</button>
            <button class="seg-btn" class:active={dustColor==='gray'}  onclick={()=>dustColor='gray'}>Gray</button>
          </div>
        </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Bottom Rectangle</h3>
        <div class="ctrl-group">
          <span class="ctrl-label">Style</span>
          <div class="seg">
            <button class="seg-btn" class:active={rectStyle==='split'} onclick={()=>rectStyle='split'}>Split</button>
            <button class="seg-btn" class:active={rectStyle==='solid'} onclick={()=>rectStyle='solid'}>Solid</button>
            <button class="seg-btn" class:active={rectStyle==='noise'} onclick={()=>rectStyle='noise'}>Noise</button>
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title">Canvas</h3>
        <div class="size-row">
          <input type="number" bind:value={canvasW} min="200" max="4000" step="100" placeholder="W"/>
          <span class="size-x">×</span>
          <input type="number" bind:value={canvasH} min="200" max="4000" step="100" placeholder="H"/>
        </div>
        <div class="preset-row">
          {#each [['16:9','1920x1080'],['4:3','1600x1200'],['1:1','1000x1000']] as [label, size]}
            <button class="chip" onclick={() => { const [w,h]=size.split('x').map(Number); canvasW=w; canvasH=h; }}>{label}</button>
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
  .topbar-title{font-size:14px;font-weight:600;flex:1;}
  .topbar-actions{display:flex;gap:8px;}
  .action-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);cursor:pointer;font-family:'Geist',sans-serif;transition:.13s;white-space:nowrap;}
  .action-btn:hover{border-color:var(--border-hover);}
  .action-btn:disabled{opacity:.4;cursor:not-allowed;}
  .action-btn.live-active{background:var(--accent);border-color:var(--accent);color:#fff;animation:pulse 1s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.7;}}
  .action-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
  .action-btn.primary:hover{opacity:.88;}
  .layout{display:flex;flex:1;min-height:0;}
  .preview-wrap{flex:1;padding:20px;display:flex;align-items:flex-start;justify-content:center;position:relative;background:var(--bg-1);}
  .preview-canvas{max-width:100%;height:auto;border-radius:6px;border:1px solid var(--border);display:block;image-rendering:pixelated;}
  .gen-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:var(--text-3);font-size:13px;font-family:'Geist Mono',monospace;border-radius:6px;}
  .controls{width:240px;flex-shrink:0;background:var(--bg-2);border-left:1px solid var(--border);padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
  .ctrl-section{padding:10px 0;border-bottom:1px solid var(--border);}
  .ctrl-section:last-child{border-bottom:none;}
  .ctrl-title{font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;}
  .ctrl-group{display:flex;flex-direction:column;gap:5px;margin-bottom:9px;}
  .ctrl-group:last-child{margin-bottom:0;}
  .ctrl-label{font-size:12px;color:var(--text-2);}
  .ctrl-group label{font-size:12px;color:var(--text-2);display:flex;justify-content:space-between;align-items:center;}
  .val{color:var(--text-3);font-family:'Geist Mono',monospace;font-size:11px;}
  .toggle-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-2);margin-bottom:8px;}
  .toggle-row:last-child{margin-bottom:0;}
  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="checkbox"]{accent-color:var(--accent);cursor:pointer;width:14px;height:14px;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}
  .size-row{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
  .size-row input{flex:1;}
  .size-x{color:var(--text-3);font-size:13px;}
  .preset-row{display:flex;gap:5px;}
  .chip{padding:3px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  .seg{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;}
  .seg-btn{flex:1;padding:4px 0;font-size:11px;font-family:'Geist',sans-serif;background:var(--bg-1);color:var(--text-2);border:none;cursor:pointer;transition:.13s;}
  .seg-btn:hover{color:var(--text-1);}
  .seg-btn.active{background:var(--accent);color:#fff;}
  @media(max-width:600px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
