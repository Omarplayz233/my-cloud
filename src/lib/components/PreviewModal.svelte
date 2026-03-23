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

  /* helpers */
  const FONT_EXTS = new Set(["ttf","otf","woff","woff2"]);
  function isFontFile(fileName: string, type: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return FONT_EXTS.has(ext) || type.includes("font");
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
    if (b < 1024) return `${b} B`;
    if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1024**3) return `${(b/1024**2).toFixed(1)} MB`;
    return `${(b/1024**3).toFixed(2)} GB`;
  }

  /* image zoom */
  let zoom = $state(1);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="backdrop" onclick={onclose}>
  <!-- top bar -->
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

  <!-- stage -->
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
          <IconFileText size={50}/>
          <span>No preview</span>
        </div>
      {/if}

    {:else}
      <div class="no-preview">
        <IconFileText size={50}/>
        <span>No preview</span>
      </div>
    {/if}
  </div>

  <!-- bottom bar -->
  <div class="botbar" onclick={e => e.stopPropagation()}>
    <div class="bg">
      <a class="bb"
        href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${preview.metaFileId}&download=true`}
        download={preview.fileName}>
        <IconDownload size={13}/> Download
      </a>

      <button class="bb"
        onclick={() => ontogglePublic(preview)}>
        {#if preview.public}
          <IconWorld size={13}/> Public
        {:else}
          <IconLock size={13}/> Private
        {/if}
      </button>
    </div>

    {#if previewKind(preview.type) === 'image'}
      <div class="bg">
        <button class="bb" onclick={() => zoom -= 0.25}><IconZoomOut size={13}/></button>
        <button class="bb" onclick={() => zoom += 0.25}><IconZoomIn size={13}/></button>
        <button class="bb" onclick={() => zoom = 1}><IconRefresh size={13}/></button>
      </div>
    {/if}

    <div class="bg">
      <button class="bb bb-danger"
        onclick={() => { ondelete(preview); onclose(); }}>
        <IconTrash size={13}/> Delete
      </button>
    </div>
  </div>
</div>

<style>
.backdrop {
  position:fixed; inset:0;
  background:rgba(0,0,0,.9);
  display:flex; align-items:center; justify-content:center;
}

.topbar {
  position:absolute; top:20px;
  display:flex; gap:10px;
  background:#111; padding:8px 14px;
  border-radius:999px;
}

.tb-name { color:#fff; }
.tb-size { color:#aaa; font-size:12px; }

.stage {
  display:flex; align-items:center; justify-content:center;
  width:100%; height:100%;
}

.img-el {
  max-width:90vw;
  max-height:90vh;
}

.video, .audio {
  max-width:90vw;
}

.botbar {
  position:absolute; bottom:20px;
  display:flex; gap:10px;
  background:#111; padding:8px;
  border-radius:999px;
}

.bb {
  color:#fff;
  background:none;
  border:none;
  cursor:pointer;
}

.bb-danger { color:red; }

.loader-ring {
  width:30px; height:30px;
  border:3px solid #333;
  border-top-color:#fff;
  border-radius:50%;
  animation:spin 1s linear infinite;
}

@keyframes spin { to { transform:rotate(360deg); } }
</style>
