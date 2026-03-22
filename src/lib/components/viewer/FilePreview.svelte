<!-- src/lib/components/viewer/FilePreview.svelte -->
<script lang="ts">
  import WasmLoader from './WasmLoader.svelte';
  import { WASM_REGISTRY } from '$lib/wasmCache';
  import { IconFileText, IconFile3d, IconFileZip, IconBook } from '@tabler/icons-svelte';

  type FileRecord = {
    fileName: string; type: string; totalBytes: number;
    metaFileId: string;
  };

  let { file, url }: { file: FileRecord; url: string | null } = $props();

  function kind(t: string) {
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf') return 'pdf';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('text/') || t === 'application/json') return 'text';
    if (t === 'application/epub+zip') return 'epub';
    if (/\.(step|stp|iges|igs|brep)$/i.test(file.fileName)) return 'cad';
    if (/\.(obj|stl|gltf|glb|3mf)$/i.test(file.fileName)) return '3d';
    if (/\.(zip|7z|tar|gz|rar|bz2)$/i.test(file.fileName)) return 'archive';
    return 'unknown';
  }

  let fileKind = $derived(kind(file.type));

  // Text content for text previews
  let textContent = $state<string | null>(null);
  let textLoading = $state(false);

  async function loadText() {
    if (!url || textContent !== null) return;
    textLoading = true;
    try {
      const res = await fetch(url);
      textContent = await res.text();
    } catch { textContent = '(failed to load)'; }
    textLoading = false;
  }

  $effect(() => {
    if (fileKind === 'text' && url) loadText();
  });

  // pdf.js
  let pdfBlobUrls: Record<string, string> | null = $state(null);

  // Archive listing
  let archiveEntries = $state<string[]>([]);
  let archiveLoading = $state(false);
</script>

{#if !url}
  <div class="fp-empty">
    <IconFileText size={52} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>Loading…</span>
  </div>

{:else if fileKind === 'image'}
  <div class="fp-img-stage">
    <img src={url} alt={file.fileName} class="fp-img"/>
  </div>

{:else if fileKind === 'video'}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video src={url} controls class="fp-video" autoplay></video>

{:else if fileKind === 'audio'}
  <!-- audio handled by parent PreviewModal (full player UI) -->
  <slot/>

{:else if fileKind === 'pdf'}
  {#if !pdfBlobUrls}
    <WasmLoader entry={WASM_REGISTRY.pdfjs} onready={(urls) => pdfBlobUrls = urls}>
    </WasmLoader>
  {:else}
    <iframe src={url} class="fp-pdf" title={file.fileName}></iframe>
  {/if}

{:else if fileKind === 'text'}
  <div class="fp-text">
    {#if textLoading}
      <div class="fp-loading">Loading…</div>
    {:else}
      <pre class="fp-pre"><code>{textContent}</code></pre>
    {/if}
  </div>

{:else if fileKind === 'epub'}
  <div class="fp-empty">
    <IconBook size={52} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>EPUB preview — open in Editor tab</span>
  </div>

{:else if fileKind === 'cad' || fileKind === '3d'}
  <div class="fp-empty">
    <IconFile3d size={52} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>3D/CAD viewer — open in Editor tab</span>
  </div>

{:else if fileKind === 'archive'}
  <div class="fp-empty">
    <IconFileZip size={52} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>Archive preview — open in Editor tab</span>
  </div>

{:else}
  <div class="fp-empty">
    <IconFileText size={52} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>No preview available for this file type</span>
  </div>
{/if}

<style>
  .fp-img-stage {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .fp-img {
    max-width: 96vw; max-height: 80vh;
    object-fit: contain;
  }
  .fp-video {
    max-width: 90vw; max-height: 82vh;
    border-radius: 12px; background: #000;
    box-shadow: 0 24px 64px rgba(0,0,0,.7);
  }
  .fp-pdf {
    width: 90vw; height: 82vh; border: none;
    border-radius: 12px; background: #fff;
    box-shadow: 0 24px 64px rgba(0,0,0,.7);
  }
  .fp-text {
    width: min(820px, 90vw); max-height: 80vh;
    overflow: auto; border-radius: 12px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08);
  }
  .fp-pre {
    padding: 20px 24px; margin: 0;
    color: rgba(255,255,255,.8); font-size: 13px;
    font-family: 'Geist Mono', monospace; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
  }
  .fp-loading { padding: 40px; text-align: center; color: rgba(255,255,255,.3); font-size: 13px; }
  .fp-empty {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    color: rgba(255,255,255,.25); font-size: 13px;
  }
</style>
