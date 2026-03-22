<!-- src/lib/components/viewer/FileConverter.svelte -->
<script lang="ts">
  import WasmLoader from './WasmLoader.svelte';
  import { WASM_REGISTRY } from '$lib/wasmCache';
  import { getFfmpegWorker, getImageMagickWorker } from '$lib/workerManager';

  type FileRecord = {
    fileName: string; type: string; totalBytes: number; metaFileId: string;
  };

  let { file, url }: { file: FileRecord; url: string | null } = $props();

  // Determine which engine to use
  function engineFor(f: FileRecord): 'ffmpeg' | 'imagemagick' | 'native' | null {
    const t = f.type;
    if (t.startsWith('video/') || t.startsWith('audio/')) return 'ffmpeg';
    if (t.startsWith('image/')) {
      // Simple formats browser can handle natively
      if (['image/png','image/jpeg','image/webp','image/gif'].includes(t)) return 'native';
      return 'imagemagick'; // RAW, TIFF, AVIF, etc
    }
    return null;
  }

  type Engine = 'ffmpeg' | 'imagemagick' | 'native' | null;
  let engine: Engine = $derived(engineFor(file));

  // Format options
  const VIDEO_FORMATS = ['mp4','webm','mkv','mov','avi','gif'];
  const AUDIO_FORMATS = ['mp3','aac','opus','flac','wav','ogg','m4a'];
  const IMAGE_FORMATS_NATIVE = ['png','jpeg','webp'];
  const IMAGE_FORMATS_MAGICK = ['png','jpeg','webp','avif','tiff','gif','bmp','ico'];

  let outputFormat = $state('');
  let converting = $state(false);
  let progress = $state(0);
  let resultUrl = $state<string | null>(null);
  let resultName = $state('');
  let error = $state<string | null>(null);

  // ffmpeg/imagemagick blob URLs once loaded
  let ffmpegReady = $state(false);
  let ffmpegUrls: Record<string, string> = {};
  let imageMagickReady = $state(false);

  let outputFormats = $derived.by(() => {
    const t = file.type;
    if (t.startsWith('video/')) return VIDEO_FORMATS;
    if (t.startsWith('audio/')) return AUDIO_FORMATS;
    if (engine === 'native') return IMAGE_FORMATS_NATIVE;
    if (engine === 'imagemagick') return IMAGE_FORMATS_MAGICK;
    return [];
  });

  $effect(() => {
    const fmts = outputFormats;
    if (fmts.length && !outputFormat) outputFormat = fmts[0];
  });

  function baseName(n: string) { return n.replace(/\.[^.]+$/, ''); }

  async function convertNative() {
    if (!url) return;
    converting = true; error = null; resultUrl = null;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      await new Promise((r, j) => { img.onload = r; img.onerror = j; });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      const mime = outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`;
      const out = await new Promise<Blob>((r) => canvas.toBlob(b => r(b!), mime, 0.92));
      resultUrl = URL.createObjectURL(out);
      resultName = `${baseName(file.fileName)}.${outputFormat}`;
    } catch (e: any) {
      error = e.message;
    }
    converting = false;
  }

  async function convertFfmpeg() {
    if (!url || !ffmpegReady) return;
    converting = true; error = null; resultUrl = null; progress = 0;
    try {
      const res = await fetch(url);
      const inputData = new Uint8Array(await res.arrayBuffer());
      const inputName = file.fileName;
      const outputName = `${baseName(file.fileName)}.${outputFormat}`;

      // Initialize worker with cached URLs if not already done
      const worker = getFfmpegWorker();
      if (!ffmpegReady) {
        await worker.send('init', { coreUrl: ffmpegUrls.js, wasmUrl: ffmpegUrls.wasm });
      }

      const result = await worker.send<Uint8Array>(
        'convert',
        {
          inputName,
          inputData,
          outputName,
          args: ['-i', inputName, outputName],
        },
        (pct) => progress = pct,
        [inputData.buffer]
      );

      const mime = file.type.startsWith('audio/') ? `audio/${outputFormat}` : `video/${outputFormat}`;
      resultUrl = URL.createObjectURL(new Blob([result], { type: mime }));
      resultName = outputName;
    } catch (e: any) {
      error = e.message;
    }
    converting = false;
  }

  async function convertImageMagick() {
    if (!url) return;
    converting = true; error = null; resultUrl = null;
    try {
      const res = await fetch(url);
      const inputData = new Uint8Array(await res.arrayBuffer());
      const worker = getImageMagickWorker();

      const result = await worker.send<Uint8Array>(
        'convert',
        { inputData, outputFormat: outputFormat.toUpperCase() },
        undefined,
        [inputData.buffer]
      );

      const mime = `image/${outputFormat}`;
      resultUrl = URL.createObjectURL(new Blob([result], { type: mime }));
      resultName = `${baseName(file.fileName)}.${outputFormat}`;
    } catch (e: any) {
      error = e.message;
    }
    converting = false;
  }

  async function convert() {
    if (engine === 'native') await convertNative();
    else if (engine === 'ffmpeg') await convertFfmpeg();
    else if (engine === 'imagemagick') await convertImageMagick();
  }

  function download() {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl; a.download = resultName; a.click();
  }
</script>

<div class="fc-wrap">
  {#if engine === null}
    <p class="fc-unsupported">Conversion not supported for this file type.</p>

  {:else if engine === 'ffmpeg' && !ffmpegReady}
    <WasmLoader
      entry={WASM_REGISTRY.ffmpeg}
      onready={(urls) => { ffmpegUrls = urls; ffmpegReady = true; }}
    />

  {:else if engine === 'imagemagick' && !imageMagickReady}
    <WasmLoader
      entry={WASM_REGISTRY.imagemagick}
      onready={() => { imageMagickReady = true; }}
    />

  {:else}
    <div class="fc-card">
      <p class="fc-label">Output format</p>
      <div class="fc-formats">
        {#each outputFormats as fmt}
          <button
            class="fc-fmt"
            class:fc-fmt-active={outputFormat === fmt}
            onclick={() => outputFormat = fmt}
          >{fmt.toUpperCase()}</button>
        {/each}
      </div>

      <button class="fc-btn" onclick={convert} disabled={converting || !outputFormat}>
        {#if converting}
          Converting… {progress > 0 ? `${progress}%` : ''}
        {:else}
          Convert to {outputFormat.toUpperCase()}
        {/if}
      </button>

      {#if converting && progress > 0}
        <div class="fc-bar-wrap">
          <div class="fc-bar" style="width:{progress}%"></div>
        </div>
      {/if}

      {#if error}
        <p class="fc-error">{error}</p>
      {/if}

      {#if resultUrl}
        <div class="fc-result">
          <span class="fc-result-name">✓ {resultName}</span>
          <button class="fc-btn fc-dl" onclick={download}>Download</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fc-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%; min-height: 280px; padding: 20px;
  }
  .fc-card {
    display: flex; flex-direction: column; gap: 16px;
    width: min(420px, 100%);
  }
  .fc-label { color: rgba(255,255,255,.45); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .06em; margin: 0; }
  .fc-formats { display: flex; flex-wrap: wrap; gap: 6px; }
  .fc-fmt {
    padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,.1);
    background: transparent; color: rgba(255,255,255,.5); font-size: 12px; font-weight: 600;
    font-family: 'Geist Mono', monospace; cursor: pointer; transition: .13s;
  }
  .fc-fmt:hover { border-color: rgba(255,255,255,.25); color: rgba(255,255,255,.8); }
  .fc-fmt-active { background: var(--accent, #6366f1); border-color: transparent; color: #fff; }
  .fc-btn {
    padding: 10px 24px; border-radius: 999px; border: none;
    background: var(--accent, #6366f1); color: #fff;
    font-size: 13.5px; font-weight: 500; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: opacity .15s; align-self: flex-start;
  }
  .fc-btn:disabled { opacity: .4; cursor: not-allowed; }
  .fc-btn:not(:disabled):hover { opacity: .85; }
  .fc-dl { background: #22c55e; margin-top: 4px; }
  .fc-bar-wrap { height: 4px; border-radius: 99px; background: rgba(255,255,255,.08); overflow: hidden; }
  .fc-bar { height: 100%; border-radius: 99px; background: var(--accent, #6366f1); transition: width .2s; }
  .fc-error { color: #f87171; font-size: 12.5px; margin: 0; }
  .fc-result { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .fc-result-name { color: #4ade80; font-size: 13px; font-family: 'Geist Mono', monospace; }
  .fc-unsupported { color: rgba(255,255,255,.3); font-size: 13px; }
</style>
