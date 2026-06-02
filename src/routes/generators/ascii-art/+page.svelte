<!-- src/routes/generators/ascii-art/+page.svelte -->
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
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1','--hover':'rgba(255,255,255,.04)','--red':'#f87171'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5','--hover':'rgba(0,0,0,.04)','--red':'#dc2626'};

  type Mode = 'text' | 'image';
  type CharSet = 'standard' | 'blocks' | 'dots';
  let mode: Mode = $state('text');
  let inputText = $state('Hello World');
  let fontSize = $state(24);
  let charSet: CharSet = $state('standard');
  let resolution = $state(80);
  let colorAscii = $state(false);
  let outputSize = $state(100);
  let imageDataUrl = $state('');

  const CHARSETS: Record<string, string> = {
    standard: ' .,:;i1tfLCG08@',
    blocks: ' .:-~=+*#%@',
    dots: ' .oO0@#',
  };

  let asciiOutput = $state('');
  let colorGrid = $state<string[][]>([]);
  let showSave = $state(false);
  let displayEl: HTMLDivElement;

  const CHAR_LIST = $derived(CHARSETS[charSet] ?? CHARSETS.standard);

  function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { imageDataUrl = reader.result as string; };
    reader.readAsDataURL(file);
  }

  function renderTextToAscii(): { grid: string[][], colors: string[][] } {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d')!;
    const chars = Math.min(outputSize, 120);
    const lines = Math.ceil(chars * 0.45);
    const px = 6;
    tempCanvas.width = chars * px;
    tempCanvas.height = lines * px;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${fontSize * px}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inputText || ' ', tempCanvas.width / 2, tempCanvas.height / 2);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    const grid: string[][] = [];
    const colors: string[][] = [];

    for (let row = 0; row < lines; row++) {
      grid[row] = [];
      colors[row] = [];
      for (let col = 0; col < chars; col++) {
        const sx = col * px, sy = row * px;
        let sum = 0;
        for (let dy = 0; dy < px; dy++) {
          for (let dx = 0; dx < px; dx++) {
            const idx = ((sy + dy) * tempCanvas.width + (sx + dx)) * 4;
            sum += data[idx];
          }
        }
        const brightness = sum / (px * px * 255);
        const charIdx = Math.min(CHAR_LIST.length - 1, Math.floor(brightness * CHAR_LIST.length));
        grid[row][col] = CHAR_LIST[charIdx] || ' ';
        const v = Math.round(brightness * 220 + 35);
        colors[row][col] = `rgb(${v},${v},${v})`;
      }
    }
    return { grid, colors };
  }

  function renderImageToAscii(img: HTMLImageElement): { grid: string[][], colors: string[][] } {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d')!;
    const aspect = img.height / img.width;
    const chars = Math.min(resolution, 150);
    const lines = Math.ceil(chars * aspect * 0.5);
    tempCanvas.width = chars;
    tempCanvas.height = lines;

    ctx.drawImage(img, 0, 0, chars, lines);
    const imageData = ctx.getImageData(0, 0, chars, lines);
    const data = imageData.data;
    const grid: string[][] = [];
    const colors: string[][] = [];

    for (let row = 0; row < lines; row++) {
      grid[row] = [];
      colors[row] = [];
      for (let col = 0; col < chars; col++) {
        const idx = (row * chars + col) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const charIdx = Math.min(CHAR_LIST.length - 1, Math.floor(brightness * CHAR_LIST.length));
        grid[row][col] = CHAR_LIST[charIdx] || ' ';
        colors[row][col] = `rgb(${r},${g},${b})`;
      }
    }
    return { grid, colors };
  }

  function generate() {
    if (mode === 'text') {
      const { grid, colors } = renderTextToAscii();
      colorGrid = colors;
      asciiOutput = grid.map(row => row.join('')).join('\n');
    } else if (imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        const { grid, colors } = renderImageToAscii(img);
        colorGrid = colors;
        asciiOutput = grid.map(row => row.join('')).join('\n');
      };
      img.src = imageDataUrl;
    }
  }

  function renderToCanvas(): HTMLCanvasElement {
    const lines = asciiOutput.split('\n');
    const maxLen = Math.max(...lines.map(l => l.length));
    const charW = 8, charH = 14;
    const c = document.createElement('canvas');
    c.width = maxLen * charW;
    c.height = lines.length * charH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = `${charH}px monospace`;
    ctx.textBaseline = 'top';

    for (let row = 0; row < lines.length; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        if (colorAscii && colorGrid[row]?.[col]) {
          ctx.fillStyle = colorGrid[row][col];
        } else {
          ctx.fillStyle = '#e2e2e2';
        }
        ctx.fillText(lines[row][col], col * charW, row * charH);
      }
    }
    return c;
  }

  $effect(() => {
    const _ = mode + inputText + fontSize + charSet + resolution + colorAscii + outputSize + imageDataUrl;
    generate();
  });
</script>

<svelte:head>
  <title>ASCII Art · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="ascii-art"
  apiKey={apiKey}
  onconfirm={(name) => {
    const c = renderToCanvas();
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = name;
    a.click();
  }}
  onsave={async (name, folderId) => {
    const c = renderToCanvas();
    const dataUrl = c.toDataURL('image/png');
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
    <span class="topbar-title">ASCII Art</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={generate}><IconRefresh size={15}/> Regenerate</button>
      <button class="action-btn primary" onclick={() => showSave=true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <div bind:this={displayEl} class="ascii-display">
        {#if colorAscii}
          {#each asciiOutput.split('\n') as line, ri}
            <div class="ascii-line">
              {#each line.split('') as ch, ci}
                <span style="color:{colorGrid[ri]?.[ci] ?? '#e2e2e2'}">{ch}</span>
              {/each}
            </div>
          {/each}
        {:else}
          <pre class="ascii-pre">{asciiOutput}</pre>
        {/if}
      </div>
    </div>

    <aside class="controls">
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Mode</h3>
        <div class="chip-row">
          <button class="chip" class:active={mode==='text'} onclick={()=>mode='text'}>Text</button>
          <button class="chip" class:active={mode==='image'} onclick={()=>mode='image'}>Image</button>
        </div>
      </section>

      {#if mode === 'text'}
        <section class="ctrl-section">
          <h3 class="ctrl-section-title">Text</h3>
          <div class="ctrl-group">
            <label>Input text</label>
            <textarea bind:value={inputText} class="text-input" rows="3" placeholder="Type something..."></textarea>
          </div>
          <div class="ctrl-group">
            <label><span class="label-row">Font size</span><span class="ctrl-val">{fontSize}</span></label>
            <input type="range" bind:value={fontSize} min="8" max="72"/>
          </div>
          <div class="ctrl-group">
            <label><span class="label-row">Output width</span><span class="ctrl-val">{outputSize} chars</span></label>
            <input type="range" bind:value={outputSize} min="20" max="150"/>
          </div>
        </section>
      {:else}
        <section class="ctrl-section">
          <h3 class="ctrl-section-title">Image</h3>
          <div class="ctrl-group">
            <label>Upload image</label>
            <input type="file" accept="image/*" onchange={handleImageUpload} class="file-input"/>
          </div>
          {#if imageDataUrl}
            <div class="img-preview">
              <img src={imageDataUrl} alt="Source"/>
            </div>
          {/if}
          <div class="ctrl-group">
            <label><span class="label-row">Resolution</span><span class="ctrl-val">{resolution} cols</span></label>
            <input type="range" bind:value={resolution} min="20" max="150"/>
          </div>
        </section>
      {/if}

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Style</h3>
        <div class="ctrl-group">
          <label>Character set</label>
          <div class="chip-row">
            {#each Object.keys(CHARSETS) as cs}
              <button class="chip" class:active={charSet===cs} onclick={()=>charSet=cs as CharSet}>{cs}</button>
            {/each}
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Colored ASCII</span>
          <button class="toggle" class:on={colorAscii} onclick={()=>colorAscii=!colorAscii}>{colorAscii?'on':'off'}</button>
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
  .preview-wrap{flex:1;padding:20px;display:flex;align-items:flex-start;justify-content:center;position:relative;min-width:0;background:var(--bg-1);overflow:auto;}
  .ascii-display{background:#0d0d1a;border-radius:10px;border:1px solid var(--border);padding:16px;max-width:100%;overflow:auto;}
  .ascii-pre{font-family:'Geist Mono',monospace;font-size:10px;line-height:1.2;color:#e2e2e2;margin:0;white-space:pre;}
  .ascii-line{font-family:'Geist Mono',monospace;font-size:10px;line-height:1.2;white-space:pre;}
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
  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  .text-input{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;resize:vertical;}
  .text-input:focus{border-color:var(--border-hover);}
  .file-input{font-size:12px;color:var(--text-2);}
  .file-input::file-selector-button{background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text-2);font-size:12px;cursor:pointer;font-family:'Geist',sans-serif;margin-right:8px;}
  .img-preview{margin-top:6px;}
  .img-preview img{max-width:100%;border-radius:7px;border:1px solid var(--border);}
  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .toggle-label{font-size:12.5px;color:var(--text-2);}
  .toggle{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-3);font-size:11px;font-family:'Geist Mono',monospace;cursor:pointer;transition:.13s;}
  .toggle.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
