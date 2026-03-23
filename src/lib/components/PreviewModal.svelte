<!-- src/lib/components/PreviewModal.svelte -->
<script lang="ts">
  import {
    IconX, IconDownload, IconWorld, IconLock, IconTrash,
    IconZoomIn, IconZoomOut, IconRefresh,
    IconFileText, IconMusic
  } from "@tabler/icons-svelte";

  type FileRecord = {
    fileName: string; type: string; totalBytes: number; time: string;
    telegramFileId: string; telegramMessageId: number;
    metaFileId: string; metaMessageId: number;
    public?: boolean; tags?: string[]; favorite?: boolean;
  };

  let {
    preview, previewUrl, previewLoading, apiKey, togglingPublic, deleting,
    onclose, ontogglePublic, ondelete
  }: {
    preview: FileRecord; previewUrl: string | null; previewLoading: boolean;
    apiKey: string; togglingPublic: string | null; deleting: string | null;
    onclose: () => void; ontogglePublic: (f: FileRecord) => void;
    ondelete: (f: FileRecord) => void;
  } = $props();

  const FONT_EXTS = new Set(["ttf","otf","woff","woff2"]);
  function isFontFile(fileName: string, type: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return FONT_EXTS.has(ext) || type.startsWith("font/") ||
      type === "application/font-woff" || type === "application/x-font-ttf" || type === "application/x-font-otf";
  }

  function previewKind(t: string): "image"|"pdf"|"video"|"audio"|"font"|null {
    if (t.startsWith("image/")) return "image";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (isFontFile(preview?.fileName ?? "", t)) return "font";
    return null;
  }

  function fmtBytes(b: number) {
    if (b < 1024) return b + " B";
    if (b < 1024**2) return (b/1024).toFixed(1) + " KB";
    if (b < 1024**3) return (b/1024**2).toFixed(1) + " MB";
    return (b/1024**3).toFixed(2) + " GB";
  }

  let zoom = $state(1);

  const PREVIEW_SIZES = [12,16,24,32,48,64,96];
  let fontSizeIdx = $state(3);
  let fontFaceName = $state<string|null>(null);
  let customText = $state("");
  const LOREM = "The quick brown fox jumps over the lazy dog";

  $effect(() => {
    if (previewKind(preview.type) === 'font' && previewUrl && !fontFaceName) {
      const name = "preview-" + Date.now();
      const ff = new FontFace(name, "url(" + previewUrl + ")");
      ff.load().then(loaded => {
        (document.fonts as any).add(loaded);
        fontFaceName = name;
      }).catch(() => {});
    }
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" onclick={onclose} role="dialog" aria-modal="true" tabindex="-1">

  <!-- TOP BAR -->
  <div class="topbar" onclick={e => e.stopPropagation()}>
    <div class="tb-info">
      <span class="tb-name" title={preview.fileName}>{preview.fileName}</span>
      <span class="tb-sep">·</span>
      <span class="tb-size">{fmtBytes(preview.totalBytes)}</span>
    </div>
    <button class="tb-close" onclick={onclose} aria-label="Close"><IconX size={15}/></button>
  </div>

  <!-- STAGE -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="stage" onclick={e => e.stopPropagation()}>
    {#if previewLoading}
      <div class="loader"><div class="loader-ring"></div></div>

    {:else if previewUrl}

      {#if previewKind(preview.type) === 'pdf'}
        <iframe src={previewUrl} class="pdf-frame" title={preview.fileName}></iframe>

      {:else if previewKind(preview.type) === 'image'}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <img src={previewUrl} alt={preview.fileName} class="img-el"
          style="transform:scale({zoom})" onclick={e => e.stopPropagation()}/>

      {:else if previewKind(preview.type) === 'video'}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <video src={previewUrl} controls class="video" onclick={e => e.stopPropagation()}></video>

      {:else if previewKind(preview.type) === 'audio'}
        <audio src={previewUrl} controls class="audio"></audio>

      {:else if previewKind(preview.type) === 'font'}
        <div class="font-stage" onclick={e => e.stopPropagation()}>
          <div class="font-sample" style="font-family:{fontFaceName ?? 'inherit'};font-size:{PREVIEW_SIZES[fontSizeIdx]}px">
            {customText || LOREM}
          </div>
          <input class="font-text-input" type="text" bind:value={customText} placeholder="Type to preview…"/>
        </div>

      {:else}
        <div class="no-preview" onclick={e => e.stopPropagation()}>
          <IconFileText size={56} stroke={1} color="rgba(255,255,255,0.15)"/>
          <span>No preview available</span>
        </div>
      {/if}

    {:else}
      <div class="no-preview" onclick={e => e.stopPropagation()}>
        <IconFileText size={56} stroke={1} color="rgba(255,255,255,0.15)"/>
        <span>No preview available</span>
      </div>
    {/if}
  </div>

  <!-- BOTTOM BAR -->
  <div class="botbar" onclick={e => e.stopPropagation()}>
    <div class="bg">
      <a class="bb"
        href={"/api/telegram/getRequestFile?api_key=" + apiKey + "&meta_file_id=" + preview.metaFileId + "&download=true"}
        download={preview.fileName}>
        <IconDownload size={13}/><span class="bl">Download</span>
      </a>
      <button class="bb" class:bb-active={preview.public}
        onclick={() => ontogglePublic(preview)}
        disabled={togglingPublic === preview.metaFileId}>
        {#if preview.public}
          <IconWorld size={13}/><span class="bl">Public</span>
        {:else}
          <IconLock size={13}/><span class="bl">Private</span>
        {/if}
      </button>
    </div>

    {#if previewKind(preview.type) === 'image'}
      <div class="bg mid">
        <button class="bb ghost" onclick={() => zoom = Math.max(0.25, zoom - 0.25)}><IconZoomOut size={13}/></button>
        <span class="zoom-v">{Math.round(zoom * 100)}%</span>
        <button class="bb ghost" onclick={() => zoom = Math.min(5, zoom + 0.25)}><IconZoomIn size={13}/></button>
        <button class="bb ghost" onclick={() => zoom = 1}><IconRefresh size={12}/></button>
      </div>
    {/if}

    {#if previewKind(preview.type) === 'font'}
      <div class="bg mid font-controls">
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.max(0, fontSizeIdx - 1)}>A-</button>
        <span class="zoom-v">{PREVIEW_SIZES[fontSizeIdx]}px</span>
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.min(PREVIEW_SIZES.length - 1, fontSizeIdx + 1)}>A+</button>
      </div>
    {/if}

    <div class="bg">
      <button class="bb bb-danger"
        onclick={() => { ondelete(preview); onclose(); }}
        disabled={deleting === preview.metaFileId}>
        <IconTrash size={13}/><span class="bl">Delete</span>
      </button>
    </div>
  </div>

</div>

<style>
  .backdrop {
    position:fixed; inset:0; z-index:200;
    background:rgba(0,0,0,.92);
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
    font-family:'Geist',sans-serif;
  }
  .stage {
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    padding:72px 20px 88px;
    box-sizing:border-box;
    border-radius:0 !important;
    background:transparent !important;
    mask:none !important;
    -webkit-mask:none !important;
  }

  /* top bar */
  .topbar {
    position:absolute; top:20px; left:50%; transform:translateX(-50%);
    z-index:210; max-width:86vw; width:max-content;
    display:flex; align-items:center; gap:20px;
    padding:6px 6px 6px 16px; border-radius:999px;
    background:rgba(18,18,20,0.8);
    backdrop-filter:blur(28px) saturate(1.4);
    border:1px solid rgba(255,255,255,0.08);
    box-shadow:0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
    animation:kSlideDown .28s cubic-bezier(.16,1,.3,1);
  }
  .tb-info { display:flex; align-items:center; gap:7px; overflow:hidden; flex:1; }
  .tb-name { font-size:12.5px; font-weight:500; color:rgba(255,255,255,.85); font-family:'Geist',sans-serif; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px; }
  .tb-sep  { color:rgba(255,255,255,.2); font-size:12px; flex-shrink:0; }
  .tb-size { color:rgba(255,255,255,.3); font-size:11px; font-family:'Geist Mono',monospace; flex-shrink:0; }
  .tb-close { width:28px; height:28px; border-radius:50%; border:none; flex-shrink:0; background:rgba(255,255,255,.07); color:rgba(255,255,255,.6); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:.13s; }
  .tb-close:hover { background:rgba(255,255,255,.14); color:#fff; }

  /* bottom bar */
  .botbar {
    position:absolute; bottom:22px; left:50%; transform:translateX(-50%);
    z-index:210; max-width:90vw; width:max-content;
    display:flex; align-items:center; gap:3px; padding:5px;
    border-radius:999px;
    background:rgba(18,18,20,0.8);
    backdrop-filter:blur(28px) saturate(1.4);
    border:1px solid rgba(255,255,255,0.08);
    box-shadow:0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
    animation:kSlideUp .28s cubic-bezier(.16,1,.3,1);
  }
  .bg { display:flex; align-items:center; gap:2px; }
  .bg.mid { padding:0 8px; margin:0 3px; border-left:1px solid rgba(255,255,255,.07); border-right:1px solid rgba(255,255,255,.07); }
  .bb { display:flex; align-items:center; gap:5px; padding:6px 12px; border-radius:999px; border:none; background:transparent; color:rgba(255,255,255,.65); font-size:12px; font-family:'Geist',sans-serif; font-weight:500; cursor:pointer; text-decoration:none; transition:.14s; white-space:nowrap; }
  .bb:hover { background:rgba(255,255,255,.08); color:rgba(255,255,255,.9); }
  .bb-active { color:#4ade80 !important; }
  .bb-danger { color:#f87171 !important; }
  .bb-danger:hover { background:rgba(220,38,38,.7) !important; color:#fff !important; }
  .bb.ghost { padding:6px 8px; }
  .bb:disabled { opacity:.3; cursor:not-allowed; }
  .zoom-v { color:rgba(255,255,255,.5); font-size:11.5px; font-family:'Geist Mono',monospace; min-width:38px; text-align:center; }

  /* loader */
  .loader { display:flex; align-items:center; justify-content:center; }
  .loader-ring { width:32px; height:32px; border:2px solid rgba(255,255,255,.08); border-top-color:rgba(255,255,255,.7); border-radius:50%; animation:kSpin .7s linear infinite; }

  /* pdf */
  .pdf-frame { width:90vw; height:85vh; border:none; border-radius:12px; background:#fff; box-shadow:0 24px 64px rgba(0,0,0,.7); }

  /* image */
  .img-el { max-width:90vw; max-height:82vh; object-fit:contain; transform-origin:center; transition:transform .18s cubic-bezier(.16,1,.3,1); border-radius:0 !important; display:block; }

  /* video */
  .video { width:min(76vw,1140px); height:min(66vh,740px); background:#000; border-radius:12px; object-fit:contain; display:block; box-shadow:0 40px 90px rgba(0,0,0,.8); }

  /* audio */
  .audio { max-width:90vw; }

  /* font */
  .font-stage { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; width:100%; height:100%; padding:40px; }
  .font-sample { color:#fff; line-height:1.3; text-align:center; max-width:80vw; word-break:break-word; transition:font-size .15s; }
  .font-text-input { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); border-radius:6px; color:rgba(255,255,255,.8); font-size:12px; font-family:'Geist',sans-serif; padding:4px 8px; outline:none; width:200px; }

  /* no preview */
  .no-preview { display:flex; flex-direction:column; align-items:center; gap:12px; color:rgba(255,255,255,.3); font-size:13px; }

  @keyframes kSlideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kSlideUp   { from { opacity:0; transform:translateX(-50%) translateY(8px);  } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kSpin      { to { transform:rotate(360deg); } }
</style>
