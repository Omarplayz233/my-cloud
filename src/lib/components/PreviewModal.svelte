<!-- src/lib/components/PreviewModal.svelte -->
<script lang="ts">
  import {
    IconX, IconDownload, IconWorld, IconLock, IconTrash,
    IconZoomIn, IconZoomOut, IconRefresh, IconFileText, IconMusic,
    IconPlayerPlayFilled, IconPlayerPauseFilled,
    IconVolume, IconVolumeOff, IconMaximize, IconMinimize, IconPictureInPicture,
    IconPlayerSkipBack, IconPlayerSkipForward,
  } from "@tabler/icons-svelte";
  import FileEditor from "./viewer/FileEditor.svelte";
  import { onDestroy } from "svelte";

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

  /* ── helpers ── */
  const FONT_EXTS = new Set(["ttf","otf","woff","woff2"]);
  const TEXT_EXTS = new Set('txt,md,markdown,js,ts,jsx,tsx,svelte,vue,py,rs,go,java,c,cpp,h,css,scss,html,xml,json,yaml,yml,toml,sh,bash,lua,rb,php,swift,kt,sql,graphql'.split(','));

  function isFontFile(f: FileRecord) {
    const ext = f.fileName.split(".").pop()?.toLowerCase() ?? "";
    return FONT_EXTS.has(ext) || f.type.startsWith("font/") || f.type === "application/font-woff" || f.type === "application/x-font-ttf";
  }
  function isTextFile(f: FileRecord) {
    const ext = f.fileName.split(".").pop()?.toLowerCase() ?? "";
    return TEXT_EXTS.has(ext) || f.type.startsWith("text/") || f.type === "application/json";
  }

  function previewKind(f: FileRecord): "image"|"pdf"|"video"|"audio"|"font"|"text"|null {
    if (f.type.startsWith("image/")) return "image";
    if (f.type === "application/pdf") return "pdf";
    if (f.type.startsWith("video/")) return "video";
    if (f.type.startsWith("audio/")) return "audio";
    if (isFontFile(f)) return "font";
    if (isTextFile(f)) return "text";
    return null;
  }

  function fmtBytes(b: number) {
    if (b < 1024) return b + " B";
    if (b < 1024**2) return (b/1024).toFixed(1) + " KB";
    if (b < 1024**3) return (b/1024**2).toFixed(1) + " MB";
    return (b/1024**3).toFixed(2) + " GB";
  }
  function fmtTime(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return m + ":" + String(sec).padStart(2,"0");
  }

  /* ── image zoom ── */
  let zoom = $state(1);

  /* ── font preview ── */
  const PREVIEW_SIZES = [12,16,24,32,48,64,96];
  let fontSizeIdx = $state(3);
  let fontFaceName = $state<string|null>(null);
  let customText = $state("");
  const LOREM = "The quick brown fox jumps over the lazy dog";

  $effect(() => {
    if (previewKind(preview) === 'font' && previewUrl && !fontFaceName) {
      const name = "pf-" + Date.now();
      new FontFace(name, "url(" + previewUrl + ")").load().then(ff => {
        (document.fonts as any).add(ff);
        fontFaceName = name;
      }).catch(() => {});
    }
  });

  /* ── video player ── */
  let videoEl = $state<HTMLVideoElement | null>(null);
  let vPlaying = $state(false);
  let vCur = $state(0);
  let vDur = $state(0);
  let vVol = $state(1);
  let vMuted = $state(false);
  let vBuf = $state(false);
  let vShow = $state(true);
  let vFullscreen = $state(false);
  let vHideTimer: any;
  let vPct = $derived(vDur ? (vCur / vDur) * 100 : 0);
  let vSeeking = $state(false);
  let vSeekVal = $state(0);

  function vToggle() { videoEl?.paused ? videoEl.play() : videoEl?.pause(); }
  function vSkip(s: number) { if (videoEl) videoEl.currentTime = Math.max(0, Math.min(vDur, vCur + s)); }
  function vSeekIn(e: Event) { vSeeking = true; vSeekVal = +(e.target as HTMLInputElement).value; }
  function vSeekEnd(e: Event) { vSeeking = false; if (videoEl) videoEl.currentTime = +(e.target as HTMLInputElement).value; }
  function vVolIn(e: Event) { vVol = +(e.target as HTMLInputElement).value; if (videoEl) videoEl.volume = vVol; }
  function vShowCtrl() {
    vShow = true; clearTimeout(vHideTimer);
    if (vPlaying) vHideTimer = setTimeout(() => vShow = false, 2200);
  }
  async function vPip() { if (videoEl && (document as any).pictureInPictureEnabled) { try { await (videoEl as any).requestPictureInPicture(); } catch {} } }
  async function vFs() {
    const vc = document.querySelector('.vc') as HTMLElement;
    if (!document.fullscreenElement) { await vc?.requestFullscreen(); vFullscreen = true; }
    else { await document.exitFullscreen(); vFullscreen = false; }
  }
  onDestroy(() => clearTimeout(vHideTimer));

  /* ── keyboard ── */
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === ' ' && !e.repeat && previewKind(preview) === 'video') { e.preventDefault(); vToggle(); }
    if (e.key === 'ArrowLeft'  && previewKind(preview) === 'video') vSkip(-10);
    if (e.key === 'ArrowRight' && previewKind(preview) === 'video') vSkip(10);
  }
</script>

<svelte:window onkeydown={onKey} />

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

      {#if previewKind(preview) === 'pdf'}
        <iframe src={previewUrl} class="pdf-frame" title={preview.fileName}></iframe>

      {:else if previewKind(preview) === 'image'}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <img src={previewUrl} alt={preview.fileName} class="img-el"
          style="transform:scale({zoom})" onclick={e => e.stopPropagation()}/>

      {:else if previewKind(preview) === 'video'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="vc" onmousemove={vShowCtrl} onclick={vToggle}>
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={previewUrl}
            class="video"
            bind:currentTime={vCur}
            bind:duration={vDur}
            onplay={() => { vPlaying=true; vHideTimer=setTimeout(()=>vShow=false,2200); }}
            onpause={() => { vPlaying=false; vShow=true; clearTimeout(vHideTimer); }}
            onwaiting={() => vBuf=true}
            oncanplay={() => vBuf=false}
            onclick={e => e.stopPropagation()}
          ></video>
          <div class="v-overlay" class:show={vShow || !vPlaying}>
            <div class="v-scrim"></div>
            <button class="v-center" onclick={e=>{e.stopPropagation();vToggle();}}>
              {#if vBuf}<div class="spin-ring"></div>
              {:else if vPlaying}<IconPlayerPauseFilled size={30}/>
              {:else}<IconPlayerPlayFilled size={30}/>{/if}
            </button>
            <div class="v-ctrl" onclick={e=>e.stopPropagation()}>
              <div class="v-seek-row">
                <span class="v-t">{fmtTime(vSeeking ? vSeekVal : vCur)}</span>
                <div class="sbar">
                  <div class="sbar-track"></div>
                  <div class="sbar-fill" style="width:{vPct}%"></div>
                  <input type="range" class="sbar-input" min="0" max={vDur||100} step="0.1"
                    value={vSeeking ? vSeekVal : vCur}
                    oninput={vSeekIn} onchange={vSeekEnd}/>
                </div>
                <span class="v-t">{fmtTime(vDur)}</span>
              </div>
              <div class="v-row">
                <div class="v-left">
                  <button class="v-btn" onclick={()=>vSkip(-10)}><IconPlayerSkipBack size={16}/></button>
                  <button class="v-btn" onclick={vToggle}>
                    {#if vPlaying}<IconPlayerPauseFilled size={18}/>{:else}<IconPlayerPlayFilled size={18}/>{/if}
                  </button>
                  <button class="v-btn" onclick={()=>vSkip(10)}><IconPlayerSkipForward size={16}/></button>
                  <button class="v-btn" onclick={()=>{vMuted=!vMuted;if(videoEl)videoEl.muted=vMuted;}}>
                    {#if vMuted || vVol===0}<IconVolumeOff size={16}/>{:else}<IconVolume size={16}/>{/if}
                  </button>
                  <div class="v-vol-track">
                    <div class="v-vol-fill" style="width:{vMuted?0:vVol*100}%"></div>
                    <input type="range" class="v-vol-input" min="0" max="1" step="0.02"
                      value={vMuted?0:vVol} oninput={vVolIn}/>
                  </div>
                  <span class="v-t">{fmtTime(vCur)} / {fmtTime(vDur)}</span>
                </div>
                <div class="v-right">
                  <button class="v-btn" onclick={vPip}><IconPictureInPicture size={16}/></button>
                  <button class="v-btn" onclick={vFs}>{#if vFullscreen}<IconMinimize size={16}/>{:else}<IconMaximize size={16}/>{/if}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      {:else if previewKind(preview) === 'audio'}
        <audio src={previewUrl} controls class="audio"></audio>

      {:else if previewKind(preview) === 'font'}
        <div class="font-stage" onclick={e => e.stopPropagation()}>
          <div class="font-meta">
            <span class="font-name">{preview.fileName.replace(/\.[^.]+$/,'')}</span>
            <span class="font-type">{preview.fileName.split('.').pop()?.toUpperCase()}</span>
          </div>
          <div class="font-sample-wrap">
            <div class="font-sample" style="font-family:{fontFaceName ?? 'inherit'};font-size:{PREVIEW_SIZES[fontSizeIdx]}px">
              {customText || LOREM}
            </div>
          </div>
          <div class="font-chars" style="font-family:{fontFaceName ?? 'inherit'}">
            {#each 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'.split('') as ch}
              <span>{ch}</span>
            {/each}
          </div>
          <input class="font-text-input" type="text" bind:value={customText} placeholder="Type to preview…"/>
        </div>

      {:else if previewKind(preview) === 'text'}
        <div class="text-stage" onclick={e => e.stopPropagation()}>
          <FileEditor file={preview} url={previewUrl} {apiKey}/>
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
      <a class="bb" href={"/api/telegram/getRequestFile?api_key=" + apiKey + "&meta_file_id=" + preview.metaFileId + "&download=true"} download={preview.fileName}>
        <IconDownload size={13}/><span class="bl">Download</span>
      </a>
      <button class="bb" class:bb-active={preview.public}
        onclick={() => ontogglePublic(preview)} disabled={togglingPublic === preview.metaFileId}>
        {#if preview.public}<IconWorld size={13}/><span class="bl">Public</span>
        {:else}<IconLock size={13}/><span class="bl">Private</span>{/if}
      </button>
    </div>

    {#if previewKind(preview) === 'image'}
      <div class="bg mid">
        <button class="bb ghost" onclick={() => zoom = Math.max(0.25, zoom - 0.25)}><IconZoomOut size={13}/></button>
        <span class="zoom-v">{Math.round(zoom * 100)}%</span>
        <button class="bb ghost" onclick={() => zoom = Math.min(5, zoom + 0.25)}><IconZoomIn size={13}/></button>
        <button class="bb ghost" onclick={() => zoom = 1}><IconRefresh size={12}/></button>
      </div>
    {/if}

    {#if previewKind(preview) === 'font'}
      <div class="bg mid">
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.max(0, fontSizeIdx - 1)}>A-</button>
        <span class="zoom-v">{PREVIEW_SIZES[fontSizeIdx]}px</span>
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.min(PREVIEW_SIZES.length - 1, fontSizeIdx + 1)}>A+</button>
      </div>
    {/if}

    <div class="bg">
      <button class="bb bb-danger" onclick={() => { ondelete(preview); onclose(); }} disabled={deleting === preview.metaFileId}>
        <IconTrash size={13}/><span class="bl">Delete</span>
      </button>
    </div>
  </div>

</div>

<style>
  /* ── Base ── */
  .backdrop {
    position:fixed; inset:0; z-index:200;
    background:rgba(0,0,0,.92);
    display:flex; align-items:center; justify-content:center;
    overflow:hidden; font-family:'Geist',sans-serif;
  }
  .stage {
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    padding:72px 20px 88px; box-sizing:border-box;
    border-radius:0 !important; background:transparent !important;
    mask:none !important; -webkit-mask:none !important;
  }

  /* ── Top bar ── */
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

  /* ── Bottom bar ── */
  .botbar {
    position:absolute; bottom:22px; left:50%; transform:translateX(-50%);
    z-index:210; max-width:90vw; width:max-content;
    display:flex; align-items:center; gap:3px; padding:5px;
    border-radius:999px; background:rgba(18,18,20,0.8);
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

  /* ── Loader ── */
  .loader { display:flex; align-items:center; justify-content:center; }
  .loader-ring { width:32px; height:32px; border:2px solid rgba(255,255,255,.08); border-top-color:rgba(255,255,255,.7); border-radius:50%; animation:kSpin .7s linear infinite; }

  /* ── PDF ── */
  .pdf-frame { width:90vw; height:85vh; border:none; border-radius:12px; background:#fff; box-shadow:0 24px 64px rgba(0,0,0,.7); }

  /* ── Image ── */
  .img-el { max-width:90vw; max-height:82vh; object-fit:contain; transform-origin:center; transition:transform .18s cubic-bezier(.16,1,.3,1); border-radius:0 !important; display:block; }

  /* ── Video player ── */
  .vc { position:relative; width:min(76vw,1140px); height:min(66vh,740px); background:#000; border-radius:12px; overflow:hidden; box-shadow:0 40px 90px rgba(0,0,0,.8); cursor:pointer; }
  .video { width:100%; height:100%; object-fit:contain; display:block; }
  .v-overlay { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:flex-end; opacity:0; transition:opacity .2s; }
  .v-overlay.show { opacity:1; }
  .v-scrim { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,.1) 40%,transparent 65%); pointer-events:none; }
  .v-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:56px; height:56px; border-radius:50%; background:rgba(255,255,255,.12); backdrop-filter:blur(8px); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:.15s; z-index:1; }
  .v-center:hover { background:rgba(255,255,255,.2); }
  .spin-ring { width:24px; height:24px; border:2px solid rgba(255,255,255,.15); border-top-color:#fff; border-radius:50%; animation:kSpin .65s linear infinite; }
  .v-ctrl { position:relative; z-index:2; padding:8px 14px 12px; display:flex; flex-direction:column; gap:6px; }
  .v-seek-row { display:flex; align-items:center; gap:8px; }
  .v-t { font-size:11.5px; color:rgba(255,255,255,.65); font-family:'Geist Mono',monospace; white-space:nowrap; flex-shrink:0; }
  .sbar { flex:1; position:relative; height:20px; display:flex; align-items:center; cursor:pointer; }
  .sbar-track { position:absolute; inset:0; margin:auto; height:3px; border-radius:99px; background:rgba(255,255,255,.2); pointer-events:none; }
  .sbar-fill  { position:absolute; left:0; top:50%; transform:translateY(-50%); height:3px; border-radius:99px; background:#fff; pointer-events:none; }
  .sbar-input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; margin:0; }
  .v-row { display:flex; align-items:center; justify-content:space-between; }
  .v-left,.v-right { display:flex; align-items:center; gap:4px; }
  .v-btn { background:none; border:none; color:rgba(255,255,255,.7); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px; border-radius:6px; transition:.13s; }
  .v-btn:hover { color:#fff; background:rgba(255,255,255,.1); }
  .v-vol-track { position:relative; width:64px; height:20px; display:flex; align-items:center; }
  .v-vol-track::before { content:''; position:absolute; inset:0; margin:auto; height:2.5px; border-radius:99px; background:rgba(255,255,255,.2); }
  .v-vol-fill { position:absolute; left:0; top:50%; transform:translateY(-50%); height:2.5px; border-radius:99px; background:#fff; pointer-events:none; }
  .v-vol-input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; margin:0; }

  /* ── Audio ── */
  .audio { max-width:90vw; }

  /* ── Font preview ── */
  .font-stage {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:20px; width:100%; height:100%; padding:20px 40px;
    overflow-y:auto;
  }
  .font-meta {
    display:flex; align-items:center; gap:10px;
  }
  .font-name {
    font-size:14px; font-weight:600; color:rgba(255,255,255,.7);
    font-family:'Geist',sans-serif; letter-spacing:-.02em;
  }
  .font-type {
    font-size:10px; padding:2px 7px; border-radius:4px;
    background:rgba(255,255,255,.08); color:rgba(255,255,255,.4);
    font-family:'Geist Mono',monospace; letter-spacing:.06em;
  }
  .font-sample-wrap {
    width:100%; max-width:860px; text-align:center;
    padding:32px 24px;
    background:rgba(255,255,255,.03);
    border:1px solid rgba(255,255,255,.07);
    border-radius:16px;
    min-height:120px; display:flex; align-items:center; justify-content:center;
  }
  .font-sample {
    color:#fff; line-height:1.25; word-break:break-word;
    transition:font-size .12s;
  }
  .font-chars {
    display:flex; flex-wrap:wrap; justify-content:center; gap:4px 2px;
    max-width:760px;
  }
  .font-chars span {
    width:28px; height:28px;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; color:rgba(255,255,255,.55);
    border:1px solid rgba(255,255,255,.06);
    border-radius:5px; transition:.1s;
  }
  .font-chars span:hover { background:rgba(255,255,255,.06); color:#fff; }
  .font-text-input {
    background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
    border-radius:8px; color:rgba(255,255,255,.8); font-size:13px;
    font-family:'Geist',sans-serif; padding:8px 14px; outline:none;
    width:min(340px,80vw); transition:.13s;
    text-align:center;
  }
  .font-text-input:focus { border-color:rgba(255,255,255,.25); background:rgba(255,255,255,.08); }
  .font-text-input::placeholder { color:rgba(255,255,255,.25); }

  /* ── Text / Monaco ── */
  .text-stage {
    width:min(90vw,1100px); height:min(78vh,860px);
    border-radius:12px; overflow:hidden;
    box-shadow:0 24px 64px rgba(0,0,0,.6);
    border:1px solid rgba(255,255,255,.07);
  }

  /* ── No preview ── */
  .no-preview { display:flex; flex-direction:column; align-items:center; gap:12px; color:rgba(255,255,255,.3); font-size:13px; }

  /* ── Animations ── */
  @keyframes kSlideDown { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kSlideUp   { from { opacity:0; transform:translateX(-50%) translateY(8px);  } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kSpin      { to { transform:rotate(360deg); } }
</style>
