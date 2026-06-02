<!-- src/routes/generators/waveform/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconInfoCircle } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

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
  let inputText = $state('Hello World! This is a waveform.');
  type WaveType = 'sine' | 'square' | 'sawtooth' | 'noise';
  let waveType: WaveType = $state('sine');
  let amplitude = $state(80);
  let frequency = $state(0.05);
  let speed = $state(1.0);
  let waveColor = $state('#6366f1');
  let bgColor = $state('#080808');
  let canvasW = $state(800);
  let canvasH = $state(300);

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
    { name: 'Neon Wave', desc: 'Bright sine wave', apply: () => { waveType='sine'; waveColor='#6366f1'; bgColor='#080808'; amplitude=80; frequency=0.05; speed=1.0; }},
    { name: 'Square Digital', desc: 'Digital square wave', apply: () => { waveType='square'; waveColor='#22d3ee'; bgColor='#0a0a0a'; amplitude=60; frequency=0.04; speed=0.8; }},
    { name: 'Sawtooth Gritty', desc: 'Sharp sawtooth', apply: () => { waveType='sawtooth'; waveColor='#f87171'; bgColor='#1a0a0a'; amplitude=70; frequency=0.06; speed=1.2; }},
    { name: 'Noise Static', desc: 'Random noise pattern', apply: () => { waveType='noise'; waveColor='#a78bfa'; bgColor='#080808'; amplitude=50; frequency=0.03; speed=1.5; }},
    { name: 'Dense Sine', desc: 'High density sine', apply: () => { waveType='sine'; waveColor='#4ade80'; bgColor='#080808'; amplitude=60; frequency=0.08; speed=2.0; }},
  ];

  // ── Tooltips map ──────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    inputText: 'Text to encode into the waveform',
    waveType: 'Wave shape: sine is smooth, square is digital, sawtooth is sharp, noise is random',
    amplitude: 'Wave height in pixels',
    frequency: 'How compressed the waves are — higher = tighter waves',
    speed: 'Density multiplier — higher packs more wave cycles per character',
    waveColor: 'Color of the waveform line',
    bgColor: 'Canvas background color',
    canvasSize: 'Output resolution',
  };

  // ── Waveform functions ────────────────────────────────────────────────
  function sampleWave(type: WaveType, t: number, rand: () => number): number {
    switch (type) {
      case 'sine': return Math.sin(t);
      case 'square': return Math.sin(t) >= 0 ? 1 : -1;
      case 'sawtooth': return 2 * (t / (2 * Math.PI) - Math.floor(0.5 + t / (2 * Math.PI)));
      case 'noise': return rand() * 2 - 1;
    }
  }

  // ── RNG ───────────────────────────────────────────────────────────────
  function mulberry32(s: number) {
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // ── Generate ──────────────────────────────────────────────────────────
  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);

      if (!inputText) { generating = false; return; }

      const [cr, cg, cb] = hexToRgb(waveColor);
      const chars = inputText.split('');
      const segW = canvasW / Math.max(chars.length, 1);
      const midY = canvasH / 2;
      const bottomLabelY = canvasH - 12;

      // Grid: vertical segment separators + center line
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 1; i < chars.length; i++) {
        ctx.beginPath();
        ctx.moveTo(i * segW, 0);
        ctx.lineTo(i * segW, canvasH);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(canvasW, midY);
      ctx.stroke();

      // Pre-compute wave points for each segment
      type SegPoints = { x0: number; points: { x: number; y: number }[]; char: string; charCode: number };
      const segments: SegPoints[] = [];
      for (let i = 0; i < chars.length; i++) {
        const charCode = chars[i].charCodeAt(0);
        const charNorm = charCode / 127;
        const segAmp = amplitude * (0.5 + charNorm * 0.5);
        const segFreq = frequency * (0.5 + charNorm * 0.5);
        const phaseOffset = charCode * 0.5;
        const localRand = mulberry32(charCode * 31 + i * 17);
        const x0 = i * segW;
        const steps = Math.ceil(segW);
        const points: { x: number; y: number }[] = [];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = x0 + t * segW;
          const waveT = t * segW * segFreq * speed + phaseOffset;
          const val = sampleWave(waveType, waveT, localRand);
          const y = midY + val * segAmp * (1 - 0.3 * Math.pow(t * 2 - 1, 2));
          points.push({ x, y });
        }
        segments.push({ x0, points, char: chars[i], charCode });
      }

      // Fill: area under wave (top half)
      for (const seg of segments) {
        const grad = ctx.createLinearGradient(0, midY - amplitude, 0, midY);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.12)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0.01)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(seg.x0, midY);
        for (const p of seg.points) ctx.lineTo(p.x, p.y);
        ctx.lineTo(seg.x0 + segW, midY);
        ctx.closePath();
        ctx.fill();
      }

      // Mirror reflection (below midline, flipped)
      for (const seg of segments) {
        const grad = ctx.createLinearGradient(0, midY, 0, midY + amplitude);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.06)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0.01)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(seg.x0, midY);
        for (const p of seg.points) {
          const dy = p.y - midY;
          ctx.lineTo(p.x, midY - dy * 0.4);
        }
        ctx.lineTo(seg.x0 + segW, midY);
        ctx.closePath();
        ctx.fill();
      }

      // Glow pass
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.25)`;
      ctx.lineWidth = 8;
      for (const seg of segments) {
        ctx.beginPath();
        for (let j = 0; j < seg.points.length; j++) {
          const p = seg.points[j];
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Main line
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
      ctx.lineWidth = 3;
      for (const seg of segments) {
        ctx.beginPath();
        for (let j = 0; j < seg.points.length; j++) {
          const p = seg.points[j];
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Character labels
      ctx.font = '10px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.4)`;
      for (const seg of segments) {
        ctx.fillText(seg.char, seg.x0 + segW / 2, bottomLabelY);
      }

      generating = false;
    }));
  }

  function randomize() { inputText = inputText.split('').sort(() => Math.random() - 0.5).join(''); }

  $effect(() => {
    const _ = inputText + waveType + amplitude + frequency + speed + waveColor + bgColor + canvasW + canvasH;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Waveform · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

{#if tooltip}
  <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">{tooltip.text}</div>
{/if}

<SaveDialog
  open={showSave}
  defaultName={`waveform-${waveType}`}
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
    <span class="topbar-title">Waveform</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize} disabled={generating}><IconRefresh size={15}/> Shuffle</button>
      <button class="action-btn primary" onclick={() => showSave=true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas bind:this={canvas} class="preview-canvas"></canvas>
      {#if generating}<div class="gen-overlay">generating...</div>{/if}
    </div>

    <aside class="controls">

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Templates</h3>
        <div class="template-grid">
          {#each TEMPLATES as tpl}
            <button class="tpl-btn" onclick={tpl.apply} title={tpl.desc}>{tpl.name}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Input</h3>
        <div class="ctrl-group">
          <label for="inputText"><span class="label-row">Text <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.inputText)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <input id="inputText" type="text" bind:value={inputText} class="text-input" placeholder="Enter text..."/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Wave</h3>
        <div class="ctrl-group">
          <label><span class="label-row">Type <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.waveType)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="chip-row">
            {#each ['sine', 'square', 'sawtooth', 'noise'] as t}
              <button class="chip" class:active={waveType===t} onclick={()=>waveType=t as WaveType}>{t}</button>
            {/each}
          </div>
        </div>
        <div class="ctrl-group">
          <label for="amplitude"><span class="label-row">Amplitude <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.amplitude)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{amplitude}</span></label>
          <input id="amplitude" type="range" bind:value={amplitude} min="10" max="150"/>
        </div>
        <div class="ctrl-group">
          <label for="frequency"><span class="label-row">Frequency <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.frequency)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{frequency}</span></label>
          <input id="frequency" type="range" bind:value={frequency} min="0.01" max="0.2" step="0.005"/>
        </div>
        <div class="ctrl-group">
          <label for="speed"><span class="label-row">Speed <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.speed)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{speed.toFixed(1)}</span></label>
          <input id="speed" type="range" bind:value={speed} min="0.2" max="4" step="0.1"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Colors</h3>
        <div class="ctrl-group">
          <label for="waveColor"><span class="label-row">Wave color <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.waveColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="waveColor" type="color" bind:value={waveColor} class="color-swatch"/>
            <span class="mono small">{waveColor}</span>
          </div>
        </div>
        <div class="ctrl-group">
          <label for="bgColor"><span class="label-row">Background <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.bgColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="bgColor" type="color" bind:value={bgColor} class="color-swatch"/>
            <span class="mono small">{bgColor}</span>
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <label><span class="label-row">Size <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.canvasSize)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="200" max="4000" step="100" placeholder="W"/>
            <span class="size-x">×</span>
            <input type="number" bind:value={canvasH} min="100" max="2000" step="100" placeholder="H"/>
          </div>
        </div>
        <div class="preset-row">
          {#each [['Wide','1920x400'],['16:9','1920x1080'],['Square','800x800'],['Banner','1200x300']] as [label, size]}
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

  .label-row{display:flex;align-items:center;gap:4px;}
  .tip-btn{background:none;border:none;padding:0;cursor:pointer;color:var(--text-3);display:flex;align-items:center;transition:color .13s;line-height:1;}
  .tip-btn:hover{color:var(--accent);}

  .tooltip{position:fixed;transform:translate(-50%,-100%);background:#1e1e2e;border:1px solid var(--border);color:var(--text-2);font-size:11.5px;padding:6px 10px;border-radius:7px;max-width:220px;text-align:center;pointer-events:none;z-index:9999;line-height:1.4;white-space:normal;font-family:'Geist',sans-serif;}

  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}
  .text-input{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  .text-input:focus{border-color:var(--border-hover);}

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

  .template-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
  .tpl-btn{padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11.5px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tpl-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.08);}

  @media(max-width:700px){
    .layout{flex-direction:column;}
    .controls{width:100%;border-left:none;border-top:1px solid var(--border);}
    .topbar-title{display:none;}
  }
</style>
