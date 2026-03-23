<!-- src/lib/components/PreviewModal.svelte -->
<script lang="ts">
  import {
    IconX, IconDownload, IconWorld, IconLock, IconTrash,
    IconZoomIn, IconZoomOut, IconRefresh,
    IconPlayerPlayFilled, IconPlayerPauseFilled,
    IconVolume, IconVolumeOff, IconMaximize, IconMinimize,
    IconPictureInPicture, IconFileText, IconMusic,
    IconPlayerSkipForward, IconPlayerSkipBack
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

  /* ── Helpers ───────────────────────────────────────────────────────────── */
  const FONT_EXTS = new Set(["ttf","otf","woff","woff2"]);
  function isFontFile(fileName: string, type: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return FONT_EXTS.has(ext) ||
      type.startsWith("font/") ||
      type === "application/font-woff" ||
      type === "application/x-font-ttf" ||
      type === "application/x-font-otf";
  }

  function previewKind(t: string): "image"|"pdf"|"video"|"audio"|null {
    if (t.startsWith("image/")) return "image";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    return null;
  }

  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1024**3) return `${(b/1024**2).toFixed(1)} MB`;
    return `${(b/1024**3).toFixed(2)} GB`;
  }

  let zoom = $state(1);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="backdrop" onclick={onclose}>

  <!-- TOP BAR (UNCHANGED) -->
  <div class="topbar" onclick={e => e.stopPropagation()}>
    <div class="tb-info">
      <span class="tb-name">{preview.fileName}</span>
      <span class="tb-sep">·</span>
      <span class="tb-size">{fmtBytes(preview.totalBytes)}</span>
    </div>
    <button class="tb-close" onclick={onclose}>
      <IconX size={15}/>
    </button>
  </div>

  <!-- STAGE -->
  <div class="stage" onclick={e => e.stopPropagation()}>
    {#if previewLoading}
      <div class="loader"><div class="loader-ring"></div></div>

    {:else if previewUrl}

      {#if previewKind(preview.type) === 'pdf'}
        <iframe src={previewUrl} class="pdf-frame"></iframe>

      {:else if previewKind(preview.type) === 'image'}
        <img src={previewUrl} class="img-el" style="transform:scale({zoom})"/>

      {:else if previewKind(preview.type) === 'video'}
        <video src={previewUrl} controls class="video"></video>

      {:else if previewKind(preview.type) === 'audio'}
        <audio src={previewUrl} controls class="audio"></audio>

      {:else}
        <div class="no-preview">
          <IconFileText size={56}/>
          <span>No preview available</span>
        </div>
      {/if}

    {:else}
      <div class="no-preview">
        <IconFileText size={56}/>
        <span>No preview available</span>
      </div>
    {/if}
  </div>

  <!-- BOTTOM BAR (UNCHANGED STRUCTURE) -->
  <div class="botbar" onclick={e => e.stopPropagation()}>
    <div class="bg">
      <a class="bb"
        href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${preview.metaFileId}&download=true`}
        download={preview.fileName}>
        <IconDownload size={13}/>
        <span class="bl">Download</span>
      </a>

      <button class="bb"
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
        <button class="bb ghost" onclick={() => zoom = Math.max(0.25, zoom - 0.25)}>
          <IconZoomOut size={13}/>
        </button>
        <span class="zoom-v">{Math.round(zoom*100)}%</span>
        <button class="bb ghost" onclick={() => zoom = Math.min(5, zoom + 0.25)}>
          <IconZoomIn size={13}/>
        </button>
        <button class="bb ghost" onclick={() => zoom = 1}>
          <IconRefresh size={12}/>
        </button>
      </div>
    {/if}

    <div class="bg">
      <button class="bb bb-danger"
        onclick={() => { ondelete(preview); onclose(); }}
        disabled={deleting === preview.metaFileId}>
        <IconTrash size={13}/>
        <span class="bl">Delete</span>
      </button>
    </div>
  </div>

</div>

<style>
/* ✅ YOUR ORIGINAL CSS IS KEPT — ONLY TAB STUFF REMOVED */

.backdrop {
  position:fixed; inset:0; z-index:200;
  background:rgba(0,0,0,0.92);
  backdrop-filter:blur(20px) saturate(1.2);
  display:flex; align-items:center; justify-content:center;
}

.topbar {
  position:absolute; top:20px; left:50%; transform:translateX(-50%);
  z-index:210;
  display:flex; align-items:center; gap:20px;
  padding:6px 6px 6px 16px; border-radius:999px;
  background:rgba(18,18,20,0.8);
  backdrop-filter:blur(28px);
}

.tb-name {
  color:rgba(255,255,255,.85);
  font-size:12.5px;
}

.tb-size {
  color:rgba(255,255,255,.3);
  font-size:11px;
}

.tb-close {
  width:28px; height:28px;
  border-radius:50%;
  border:none;
  background:rgba(255,255,255,.07);
  color:#fff;
  cursor:pointer;
}

.stage {
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
}

.img-el {
  max-width:96vw;
  max-height:90vh;
  object-fit:contain;
}

.pdf-frame {
  width:90vw;
  height:85vh;
  border:none;
}

.video, .audio {
  max-width:90vw;
}

/* bottom bar stays the same vibe */
.botbar {
  position:absolute; bottom:22px; left:50%; transform:translateX(-50%);
  display:flex; gap:3px;
  padding:5px;
  border-radius:999px;
  background:rgba(18,18,20,0.8);
}

.bb {
  display:flex; align-items:center; gap:5px;
  padding:6px 12px;
  border-radius:999px;
  background:transparent;
  color:rgba(255,255,255,.65);
  border:none;
  cursor:pointer;
}

.bb:hover { background:rgba(255,255,255,.08); }

.bb-danger { color:#f87171; }

.zoom-v {
  color:rgba(255,255,255,.5);
  font-size:11px;
}

.loader-ring {
  width:32px; height:32px;
  border:2px solid rgba(255,255,255,.08);
  border-top-color:#fff;
  border-radius:50%;
  animation:spin .7s linear infinite;
}

@keyframes spin { to { transform:rotate(360deg); } }
</style>
