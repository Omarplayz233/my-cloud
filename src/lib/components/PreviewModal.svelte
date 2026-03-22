<!-- src/lib/components/PreviewModal.svelte -->
<script lang="ts">
  import {
    IconX, IconDownload, IconWorld, IconLock, IconTrash,
    IconZoomIn, IconZoomOut, IconRefresh,
    IconPlayerPlayFilled, IconPlayerPauseFilled,
    IconVolume, IconVolumeOff, IconMaximize, IconMinimize,
    IconPictureInPicture, IconFileText, IconMusic,
    IconPlayerSkipForward, IconPlayerSkipBack,
    IconEye, IconEdit, IconArrowsExchange
  } from "@tabler/icons-svelte";
  import FileEditor from "./viewer/FileEditor.svelte";

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const FONT_EXTS = new Set(["ttf","otf","woff","woff2"]);
  function isFontFile(fileName: string, type: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return FONT_EXTS.has(ext) ||
      type === "font/ttf" || type === "font/otf" ||
      type === "font/woff" || type === "font/woff2" ||
      type === "application/font-woff" ||
      type === "application/x-font-ttf" ||
      type === "application/x-font-otf";
  }

  function previewKind(t: string): "image"|"pdf"|"video"|"audio"|"font"|null {
    if (t.startsWith("image/")) return "image";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (isFontFile(preview?.fileName ?? "", t)) return "font";
    return null;
  }

  // ── Font previewer state ───────────────────────────────────────────────────
  const LOREM = "The quick brown fox jumps over the lazy dog. 0123456789 !@#$%";
  const PREVIEW_SIZES = [12, 16, 24, 32, 48, 64, 96];
  let fontCustomText = $state(LOREM);
  let fontSizeIdx    = $state(3); // default 32px
  let fontLoaded     = $state(false);
  let fontError      = $state<string | null>(null);
  let fontFaceName   = $state<string | null>(null);

  $effect(() => {
    // Load font whenever previewUrl changes and it's a font file
    if (!previewUrl || !preview || !isFontFile(preview.fileName, preview.type)) {
      fontLoaded = false;
      fontError  = null;
      fontFaceName = null;
      return;
    }
    const name = `preview-font-${Date.now()}`;
    fontFaceName = name;
    fontLoaded = false;
    fontError  = null;
    const face = new FontFace(name, `url(${previewUrl})`);
    face.load().then(loaded => {
      document.fonts.add(loaded);
      fontLoaded = true;
    }).catch(e => {
      fontError = e?.message ?? "Failed to load font";
    });
  });

  function fmtTime(sec: number) {
    if (!sec || !isFinite(sec) || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1024**3) return `${(b/1024**2).toFixed(1)} MB`;
    return `${(b/1024**3).toFixed(2)} GB`;
  }

  function accentFor(name: string): string {
    const p = ["#a78bfa","#34d399","#60a5fa","#f472b6","#fb923c","#38bdf8","#facc15","#818cf8"];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return p[h % p.length];
  }

  // ── Video state ───────────────────────────────────────────────────────────
  let videoEl   = $state<HTMLVideoElement|null>(null);
  let vPlaying  = $state(false);
  let vMuted    = $state(false);
  let vFS       = $state(false);
  let vBuf      = $state(false);
  let vShow     = $state(true);
  let vCur      = $state(0);
  let vDur      = $state(0);
  let vSeeking  = $state(false);
  let vSeekVal  = $state(0);
  let vVolume   = $state(1);
  let vShowVol  = $state(false);
  let vTimer: ReturnType<typeof setTimeout>;
  let vPct = $derived(vDur > 0 ? ((vSeeking ? vSeekVal : vCur) / vDur) * 100 : 0);

  function vOnTime()      { if (videoEl && !vSeeking) vCur = videoEl.currentTime; }
  function vOnMeta()      { if (videoEl) { vDur = videoEl.duration; vCur = 0; } }
  function vSeekIn(e: Event)  { vSeeking = true; vSeekVal = +(e.target as HTMLInputElement).value; vCur = vSeekVal; }
  function vSeekEnd(e: Event) { const t = +(e.target as HTMLInputElement).value; if (videoEl) videoEl.currentTime = t; vCur = t; vSeekVal = t; vSeeking = false; }
  function vToggle(e?: Event) { e?.stopPropagation(); if (!videoEl) return; vPlaying ? videoEl.pause() : videoEl.play(); vNudge(); }
  function vMuteToggle(e: Event) { e.stopPropagation(); if (!videoEl) return; videoEl.muted = !videoEl.muted; vMuted = videoEl.muted; }
  function vVol(e: Event) {
    const v = +(e.target as HTMLInputElement).value;
    vVolume = Math.max(0, Math.min(1, v));
    if (!videoEl) return;
    videoEl.volume = vVolume;
    videoEl.muted = vVolume === 0;
    vMuted = videoEl.muted;
    vNudge();
  }
  function vVolWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    vVolume = Math.max(0, Math.min(1, vVolume + delta));
    if (!videoEl) return;
    videoEl.volume = vVolume;
    videoEl.muted = vVolume === 0;
    vMuted = videoEl.muted;
    vNudge();
  }
  function vNudge() { vShow = true; clearTimeout(vTimer); if (vPlaying) vTimer = setTimeout(() => vShow = false, 2600); }
  async function vToggleFS(e: Event) { e.stopPropagation(); const el = document.querySelector(".vc") as HTMLElement; if (!document.fullscreenElement) { await el?.requestFullscreen().catch(()=>{}); vFS = true; } else { await document.exitFullscreen().catch(()=>{}); vFS = false; } }
  async function vPiP(e: Event) { e.stopPropagation(); if (!videoEl) return; document.pictureInPictureElement ? await document.exitPictureInPicture() : await videoEl.requestPictureInPicture().catch(()=>{}); }
  function vSkip(s: number, e: Event) { e.stopPropagation(); if (!videoEl) return; videoEl.currentTime = Math.max(0, Math.min(vDur, videoEl.currentTime + s)); vNudge(); }

  // ── Audio state ───────────────────────────────────────────────────────────
  let audioEl   = $state<HTMLAudioElement|null>(null);
  let aPlaying  = $state(false);
  let aMuted    = $state(false);
  let aCur      = $state(0);
  let aDur      = $state(0);
  let aSeeking  = $state(false);
  let aSeekVal  = $state(0);
  let aVolume   = $state(1);
  let aPct = $derived(aDur > 0 ? ((aSeeking ? aSeekVal : aCur) / aDur) * 100 : 0);

  function aOnTime()      { if (audioEl && !aSeeking) aCur = audioEl.currentTime; }
  function aOnMeta()      { if (audioEl) { aDur = audioEl.duration; aCur = 0; } }
  function aSeekIn(e: Event)  { aSeeking = true; aSeekVal = +(e.target as HTMLInputElement).value; aCur = aSeekVal; }
  function aSeekEnd(e: Event) { const t = +(e.target as HTMLInputElement).value; if (audioEl) audioEl.currentTime = t; aCur = t; aSeekVal = t; aSeeking = false; }
  function aToggle()      { if (!audioEl) return; aPlaying ? audioEl.pause() : audioEl.play(); }
  function aMuteToggle()  { if (!audioEl) return; audioEl.muted = !audioEl.muted; aMuted = audioEl.muted; }
  function aVol(e: Event) { const v = +(e.target as HTMLInputElement).value; aVolume = v; if (audioEl) { audioEl.volume = v; aMuted = v === 0; } }
  function aVolWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    aVolume = Math.max(0, Math.min(1, aVolume + delta));
    if (!audioEl) return;
    audioEl.volume = aVolume;
    audioEl.muted = aVolume === 0;
    aMuted = audioEl.muted;
  }

  // Extra controls
  let aShuffle = $state(false);
  let aRepeat  = $state(false);
  let aShowVol = $state(false);

  function aOnEnded() {
    aPlaying = false;
    if (aRepeat && audioEl) { audioEl.currentTime = 0; audioEl.play(); }
  }

  // ── ID3 metadata ──────────────────────────────────────────────────────────
  let metaTitle   = $state<string|null>(null);
  let metaArtist  = $state<string|null>(null);
  let metaAlbum   = $state<string|null>(null);
  let metaCover   = $state<string|null>(null);
  let metaLoading = $state(false);
  let _blobUrl: string|null = null;

  function setCover(url: string|null) {
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
    _blobUrl = url;
    metaCover = url;
  }

  function readStr(b: Uint8Array, off: number, len: number, enc: number): string {
    const s = b.subarray(off, off + len);
    try {
      if (enc === 1 || enc === 2) {
        const le = (s[0] === 0xFF && s[1] === 0xFE) || enc === 2;
        const st = (s[0] === 0xFF && s[1] === 0xFE) || (s[0] === 0xFE && s[1] === 0xFF) ? 2 : 0;
        let r = '';
        for (let i = st; i < s.length - 1; i += 2) {
          const c = le ? s[i] | (s[i+1] << 8) : (s[i] << 8) | s[i+1];
          if (c === 0) break; r += String.fromCodePoint(c);
        }
        return r;
      }
      const a = s[0] === 0 ? s.subarray(1) : s;
      const n = a.indexOf(0); const t = n >= 0 ? a.subarray(0, n) : a;
      return enc === 3 ? new TextDecoder('utf-8').decode(t) : new TextDecoder('latin1').decode(t);
    } catch { return ''; }
  }

  async function parseId3(url: string) {
    metaLoading = true;
    metaTitle = null; metaArtist = null; metaAlbum = null; setCover(null);
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-524287' }, cache: 'no-store' });
      if (!res.ok && res.status !== 206) return;
      const buf = await res.arrayBuffer();
      const b = new Uint8Array(buf);
      if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return;
      const ver = b[3];
      const tagSize = ((b[6]&0x7f)<<21)|((b[7]&0x7f)<<14)|((b[8]&0x7f)<<7)|(b[9]&0x7f);
      const end = Math.min(10 + tagSize, b.length);
      let pos = 10;
      const FHS = ver >= 3 ? 10 : 6;
      while (pos + FHS < end) {
        const id = String.fromCharCode(b[pos],b[pos+1],b[pos+2],b[pos+3]);
        if (!id.trim() || b[pos] === 0) break;
        let fs: number;
        if (ver >= 4) fs = ((b[pos+4]&0x7f)<<21)|((b[pos+5]&0x7f)<<14)|((b[pos+6]&0x7f)<<7)|(b[pos+7]&0x7f);
        else fs = (b[pos+4]<<24)|(b[pos+5]<<16)|(b[pos+6]<<8)|b[pos+7];
        if (fs <= 0 || pos + FHS + fs > end) break;
        const ds = pos + FHS;
        const enc = b[ds];
        if      (id === 'TIT2') metaTitle  = readStr(b, ds+1, fs-1, enc) || null;
        else if (id === 'TPE1') metaArtist = readStr(b, ds+1, fs-1, enc) || null;
        else if (id === 'TALB') metaAlbum  = readStr(b, ds+1, fs-1, enc) || null;
        else if (id === 'APIC') {
          let i = ds + 1;
          const me = b.indexOf(0, i); if (me < 0) { pos += FHS + fs; continue; }
          const mime = new TextDecoder('latin1').decode(b.subarray(i, me));
          i = me + 2; // skip null + picType
          const de = enc === 1 || enc === 2
            ? (() => { let j=i; while(j<end-1&&!(b[j]===0&&b[j+1]===0))j+=2; return j+2; })()
            : (() => { let j=i; while(j<end&&b[j]!==0)j++; return j+1; })();
          const img = b.subarray(de, ds + fs);
          if (img.length > 0) setCover(URL.createObjectURL(new Blob([img], { type: mime||'image/jpeg' })));
        }
        pos += FHS + fs;
      }
    } catch { /* silent */ }
    finally { metaLoading = false; }
  }

  let _lastUrl = '';
  $effect(() => {
    if (previewUrl && preview.type.startsWith('audio/') && previewUrl !== _lastUrl) {
      _lastUrl = previewUrl;
      parseId3(previewUrl);
    }
    return () => setCover(null);
  });

  let displayTitle  = $derived(metaTitle  ?? preview.fileName.replace(/\.[^.]+$/, ''));
  let displayArtist = $derived(metaArtist ?? null);
  let displayAlbum  = $derived(metaAlbum  ?? null);
  let accent        = $derived(accentFor(preview.fileName));

  // ── Image zoom ────────────────────────────────────────────────────────────
  let zoom = $state(1);

  // ── Tab ───────────────────────────────────────────────────────────────────
  type Tab = "preview" | "editor";

  function defaultTab(f: FileRecord): Tab {
    const ext = f.fileName.split('.').pop()?.toLowerCase() ?? '';
    const textExts = ['txt','md','markdown','js','ts','jsx','tsx','svelte','vue','py','rs',
                      'go','java','c','cpp','h','css','scss','html','xml','json','yaml','yml',
                      'toml','sh','bash','lua','rb','php','swift','kt','sql','graphql'];
    if (textExts.includes(ext) || f.type.startsWith('text/') || f.type.includes('json')) return 'editor';
    return 'preview';
  }

  let activeTab = $state<Tab>('preview');
  // Update default tab when a new file is opened
  $effect(() => { activeTab = defaultTab(preview); });

  function canEdit(t: string) {
    return t.startsWith("image/") || t.startsWith("text/") || t === "application/json" || t === "application/epub+zip";
  }
  function canConvert(t: string) {
    return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/");
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === ' ' && !e.repeat) {
      if (previewKind(preview.type) === 'video') { e.preventDefault(); vToggle(); }
      if (previewKind(preview.type) === 'audio') { e.preventDefault(); aToggle(); }
    }
    if (e.key === 'ArrowLeft'  && previewKind(preview.type) === 'video') vSkip(-10, e);
    if (e.key === 'ArrowRight' && previewKind(preview.type) === 'video') vSkip(10, e);
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" onclick={onclose} role="dialog" aria-modal="true" tabindex="-1">

  <!-- Top pill -->
  <div class="topbar" onclick={e => e.stopPropagation()}>
    <div class="tb-info">
      <span class="tb-name" title={preview.fileName}>{preview.fileName}</span>
      <span class="tb-sep">·</span>
      <span class="tb-size">{fmtBytes(preview.totalBytes)}</span>
    </div>
    <!-- Tabs -->
    {#if canEdit(preview.type) || canConvert(preview.type)}
      <div class="tb-tabs">
        <button class="tb-tab" class:tb-tab-active={activeTab === "preview"} onclick={() => activeTab = "preview"}>
          <IconEye size={12}/> Preview
        </button>
        {#if canEdit(preview.type)}
          <button class="tb-tab" class:tb-tab-active={activeTab === "editor"} onclick={() => activeTab = "editor"}>
            <IconEdit size={12}/> Editor
          </button>
        {/if}
        {#if canConvert(preview.type)}
          <button class="tb-tab" class:tb-tab-active={activeTab === "converter"} onclick={() => activeTab = "converter"}>
            <IconArrowsExchange size={12}/> Convert
          </button>
        {/if}
      </div>
    {/if}
    <button class="tb-close" onclick={onclose} aria-label="Close"><IconX size={15}/></button>
  </div>

  <!-- Content stage -->
  <div class="stage" onclick={e => e.stopPropagation()}>
    {#if activeTab === "editor"}
      <FileEditor file={preview} url={previewUrl} apiKey={apiKey}/>
    {:else if previewLoading}
      <div class="loader"><div class="loader-ring"></div></div>

    {:else if previewUrl}

      <!-- PDF -->
      {#if previewKind(preview.type) === 'pdf'}
        <iframe src={previewUrl} class="pdf-frame" title={preview.fileName}></iframe>

      <!-- VIDEO -->
      {:else if previewKind(preview.type) === 'video'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="vc"
          onmousemove={vNudge}
          onmouseleave={() => { if (vPlaying) vShow = false; }}
          onclick={e => e.stopPropagation()}>

          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} class="video" src={previewUrl} autoplay
            ontimeupdate={vOnTime} onloadedmetadata={vOnMeta}
            onvolumechange={() => { if (videoEl) { vMuted = videoEl.muted; vVolume = videoEl.volume; } }}
            onplay={() => { vPlaying=true; vBuf=false; vNudge(); }}
            onpause={() => { vPlaying=false; vShow=true; }}
            onwaiting={() => vBuf=true}
            onplaying={() => vBuf=false}
            onclick={vToggle}></video>

          <div class="v-overlay" class:show={vShow||!vPlaying}>
            <div class="v-scrim"></div>
            <button class="v-center" onclick={vToggle}>
              {#if vBuf}<div class="spin-ring"></div>
              {:else if vPlaying}<IconPlayerPauseFilled size={30}/>
              {:else}<IconPlayerPlayFilled size={30}/>{/if}
            </button>
            <div class="v-ctrl">
              <div class="v-seek-row">
                <span class="v-t">{fmtTime(vSeeking ? vSeekVal : vCur)}</span>
                <div class="sbar">
                  <div class="sbar-track"></div>
                  <div class="sbar-fill" style="width:{vPct}%"></div>
                  <input type="range" class="sbar-input" min="0" max={vDur||100} step="0.1"
                    value={vSeeking ? vSeekVal : vCur}
                    oninput={vSeekIn} onchange={vSeekEnd} onclick={e=>e.stopPropagation()}/>
                </div>
                <span class="v-t">{fmtTime(vDur)}</span>
              </div>
              <div class="v-row">
                <div class="v-left">
                  <button class="v-btn" onclick={vToggle}>
                    {#if vPlaying}<IconPlayerPauseFilled size={15}/>{:else}<IconPlayerPlayFilled size={15}/>{/if}
                  </button>
                  <button class="v-btn" onclick={e=>vSkip(-10,e)} title="-10s"><IconPlayerSkipBack size={14}/></button>
                  <button class="v-btn" onclick={e=>vSkip(10,e)}  title="+10s"><IconPlayerSkipForward size={14}/></button>
                  <div
                    class="v-vol-wrap"
                    class:open={vShowVol}
                    onmouseenter={() => { vShowVol = true; vNudge(); }}
                    onmouseleave={() => vShowVol = false}
                    onwheel={vVolWheel}
                  >
                    <button class="v-btn" onclick={vMuteToggle}>
                      {#if vMuted || vVolume === 0}<IconVolumeOff size={15}/>{:else}<IconVolume size={15}/>{/if}
                    </button>
                    <div class="v-vol-track">
                      <div class="v-vol-fill" style="width:{vVolume*100}%"></div>
                      <input type="range" class="v-vol-input" min="0" max="1" step="0.02" value={vVolume} oninput={vVol} />
                    </div>
                  </div>
                  <span class="v-time">{fmtTime(vSeeking ? vSeekVal : vCur)} / {fmtTime(vDur)}</span>
                </div>
                <div class="v-right">
                  <button class="v-btn" onclick={vPiP}><IconPictureInPicture size={14}/></button>
                  <button class="v-btn" onclick={vToggleFS}>
                    {#if vFS}<IconMinimize size={14}/>{:else}<IconMaximize size={14}/>{/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      <!-- AUDIO -->
      {:else if previewKind(preview.type) === 'audio'}
        <div class="audio-card" onclick={e => e.stopPropagation()}>

          <!-- Ambient background -->
          {#if metaCover}
            <div class="ambient" style="background-image:url({metaCover})"></div>
          {:else}
            <div class="ambient-color" style="--ac:{accent}"></div>
          {/if}
          <div class="card-noise"></div>

          <!-- Left: cover art -->
          <div class="cover-col">
            <div class="cover-art" style="--ac:{accent}">
              {#if metaCover}
                <img src={metaCover} alt="cover" class="cover-img"/>
              {:else}
                <div class="cover-placeholder">
                  <IconMusic size={48} stroke={1.2}/>
                </div>
              {/if}
            </div>
          </div>

          <!-- Right: everything else -->
          <div class="right-col">

            <!-- Track info -->
            <div class="track-info">
              {#if metaLoading}
                <div class="shim shim-title"></div>
                <div class="shim shim-artist"></div>
              {:else}
                <p class="t-title">{displayTitle}</p>
                {#if displayArtist}<p class="t-artist">{displayArtist}</p>{/if}
                {#if displayAlbum}<p class="t-album">{displayAlbum}</p>{/if}
              {/if}
            </div>

            <!-- Seek bar -->
            <div class="a-seek">
              <span class="a-t">{fmtTime(aSeeking ? aSeekVal : aCur)}</span>
              <div class="sbar a-sbar">
                <div class="sbar-track"></div>
                <div class="sbar-fill" style="width:{aPct}%; background:{accent}"></div>
                <input type="range" class="sbar-input" min="0" max={aDur||100} step="0.1"
                  value={aSeeking ? aSeekVal : aCur}
                  oninput={aSeekIn} onchange={aSeekEnd}/>
              </div>
              <span class="a-t">{fmtTime(aDur)}</span>
            </div>

            <!-- Controls row -->
            <div class="a-ctrl" style="--ac:{accent}">
              <!-- Secondary: shuffle + repeat -->
              <div class="a-secondary">
                <button class="ghost-btn" class:ghost-active={aShuffle} onclick={() => aShuffle = !aShuffle} title="Shuffle">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                </button>
                <button class="ghost-btn" class:ghost-active={aRepeat} onclick={() => aRepeat = !aRepeat} title="Repeat">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </button>
              </div>

              <!-- Center: play/pause -->
              <button class="play-btn" onclick={aToggle} style="--ac:{accent}" class:playing={aPlaying}>
                {#if aPlaying}<IconPlayerPauseFilled size={20}/>{:else}<IconPlayerPlayFilled size={20}/>{/if}
              </button>

              <!-- Volume -->
              <div
                class="vol-wrap"
                class:open={aShowVol}
                onmouseenter={() => aShowVol = true}
                onmouseleave={() => aShowVol = false}
                onwheel={aVolWheel}
              >
                <button class="ghost-btn" onclick={aMuteToggle}>
                  {#if aMuted || aVolume === 0}<IconVolumeOff size={14}/>{:else}<IconVolume size={14}/>{/if}
                </button>
                <div class="vol-track">
                  <div class="vol-fill" style="width:{aVolume*100}%; background:{accent}"></div>
                  <input type="range" class="vol-input" min="0" max="1" step="0.02"
                    value={aVolume} oninput={aVol}/>
                </div>
              </div>
            </div>

          </div><!-- /right-col -->

          <!-- svelte-ignore a11y_media_has_caption -->
          <audio bind:this={audioEl} src={previewUrl}
            ontimeupdate={aOnTime} onloadedmetadata={aOnMeta}
            onplay={() => aPlaying=true} onpause={() => aPlaying=false}
            onended={aOnEnded} loop={aRepeat}
          ></audio>
        </div>

      <!-- FONT -->
      {:else if previewKind(preview.type) === 'font' || isFontFile(preview.fileName, preview.type)}
        <div class="font-stage" onclick={e => e.stopPropagation()}>
          {#if fontError}
            <span class="font-err">{fontError}</span>
          {:else if !fontLoaded}
            <div class="loader"><div class="loader-ring"></div></div>
          {:else}
            <div class="font-preview-text"
              style="font-family:'{fontFaceName}',sans-serif; font-size:{PREVIEW_SIZES[fontSizeIdx]}px;">
              {fontCustomText || LOREM}
            </div>
            <div class="font-meta">
              {preview.fileName}
            </div>
          {/if}
        </div>

      <!-- IMAGE -->
      {:else}
        <div class="img-stage">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <img src={previewUrl} alt={preview.fileName} class="img-el"
            style="transform:scale({zoom})" onclick={e => e.stopPropagation()}/>
        </div>
      {/if}

    {:else}
      <!-- NO PREVIEW -->
      <div class="no-preview" onclick={e => e.stopPropagation()}>
        <IconFileText size={56} stroke={1} color="rgba(255,255,255,0.15)"/>
        <span>No preview available</span>
      </div>
    {/if}
  </div>

  <!-- Bottom bar -->
  <div class="botbar" onclick={e => e.stopPropagation()}>
    <div class="bg">
      <a class="bb" href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${preview.metaFileId}&download=true`} download={preview.fileName}>
        <IconDownload size={13}/><span class="bl">Download</span>
      </a>
      <button class="bb" class:bb-active={preview.public}
        onclick={() => ontogglePublic(preview)}
        disabled={togglingPublic === preview.metaFileId}>
        {#if preview.public}<IconWorld size={13}/><span class="bl">Public</span>
        {:else}<IconLock size={13}/><span class="bl">Private</span>{/if}
      </button>
    </div>

    {#if previewKind(preview.type) === 'image'}
      <div class="bg mid">
        <button class="bb ghost" onclick={() => zoom = Math.max(0.25, zoom - 0.25)}><IconZoomOut size={13}/></button>
        <span class="zoom-v">{Math.round(zoom*100)}%</span>
        <button class="bb ghost" onclick={() => zoom = Math.min(5, zoom + 0.25)}><IconZoomIn size={13}/></button>
        <button class="bb ghost" onclick={() => zoom = 1}><IconRefresh size={12}/></button>
      </div>
    {/if}

    {#if (previewKind(preview.type) === 'font' || isFontFile(preview.fileName, preview.type)) && fontLoaded}
      <div class="bg mid font-controls">
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.max(0, fontSizeIdx - 1)}>A-</button>
        <span class="zoom-v">{PREVIEW_SIZES[fontSizeIdx]}px</span>
        <button class="bb ghost" onclick={() => fontSizeIdx = Math.min(PREVIEW_SIZES.length - 1, fontSizeIdx + 1)}>A+</button>
        <input
          class="font-text-input"
          type="text"
          placeholder="Type to preview…"
          bind:value={fontCustomText}
          onclick={e => e.stopPropagation()}
        />
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
  /* ── Keyframes ─────────────────────────────────────────────────────────── */
  @keyframes kSpin      { to { transform: rotate(360deg); } }
  @keyframes kPulse     { 0%,100% { transform:scale(1); } 50% { transform:scale(1.03); } }
  @keyframes kGlow      { 0%,100% { opacity:.55; } 50% { opacity:.8; } }
  @keyframes kShimmer   { 0% { background-position:-300% 0; } 100% { background-position:300% 0; } }
  @keyframes kSlideDown { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kSlideUp   { from { opacity:0; transform:translateX(-50%) translateY(10px); }  to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes kCardIn    { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes kDotSpin   { to { transform:translate(-50%,-50%) rotate(360deg); } }

  /* ── Base ──────────────────────────────────────────────────────────────── */
  .backdrop {
    position:fixed; inset:0; z-index:200;
    background:rgba(0,0,0,0.92);
    backdrop-filter:blur(20px) saturate(1.2);
    display:flex; align-items:center; justify-content:center;
    font-family:'Geist',sans-serif;
  }
  .stage {
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
  }

  /* ── Top bar ───────────────────────────────────────────────────────────── */
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
  .tb-info {
    display:flex; align-items:center; gap:7px; overflow:hidden; flex:1;
  }
  .tb-name {
    color:rgba(255,255,255,.85); font-size:12.5px; font-weight:500;
    letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;
  }
  .tb-sep  { color:rgba(255,255,255,.2); font-size:12px; flex-shrink:0; }
  .tb-size { color:rgba(255,255,255,.3); font-size:11px; font-family:'Geist Mono',monospace; flex-shrink:0; }
  .tb-close {
    width:28px; height:28px; border-radius:50%; border:none; flex-shrink:0;
    background:rgba(255,255,255,.07); color:rgba(255,255,255,.6);
    display:flex; align-items:center; justify-content:center; cursor:pointer; transition:.15s;
  }
  .tb-close:hover { background:rgba(255,255,255,.14); color:#fff; }

  /* ── Tabs ──────────────────────────────────────────────────────────────── */
  .tb-tabs { display:flex; align-items:center; gap:2px; }
  .tb-tab {
    display:flex; align-items:center; gap:5px;
    padding:4px 10px; border-radius:999px; border:none; cursor:pointer;
    font-size:11.5px; font-weight:500; font-family:'Geist',sans-serif;
    background:transparent; color:rgba(255,255,255,.4); transition:.13s;
  }
  .tb-tab:hover { color:rgba(255,255,255,.75); background:rgba(255,255,255,.06); }
  .tb-tab-active { background:rgba(255,255,255,.1); color:rgba(255,255,255,.9); }

  /* ── Bottom bar ────────────────────────────────────────────────────────── */
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

  .bb {
    display:flex; align-items:center; gap:5px; padding:6px 12px;
    border-radius:999px; border:none; background:transparent;
    color:rgba(255,255,255,.65); font-size:12px; font-family:'Geist',sans-serif; font-weight:500;
    cursor:pointer; text-decoration:none; transition:.14s; white-space:nowrap;
  }
  .bb:hover { background:rgba(255,255,255,.08); color:rgba(255,255,255,.9); }
  .bb-active { color:#4ade80 !important; }
  .bb-danger { color:#f87171 !important; }
  .bb-danger:hover { background:rgba(220,38,38,.7) !important; color:#fff !important; }
  .bb.ghost { padding:6px 8px; }
  .bb:disabled { opacity:.3; cursor:not-allowed; }
  .zoom-v { color:rgba(255,255,255,.5); font-size:11.5px; font-family:'Geist Mono',monospace; min-width:38px; text-align:center; }

  /* ── Loader ────────────────────────────────────────────────────────────── */
  .loader { display:flex; align-items:center; justify-content:center; }
  .loader-ring { width:32px; height:32px; border:2px solid rgba(255,255,255,.08); border-top-color:rgba(255,255,255,.7); border-radius:50%; animation:kSpin .7s linear infinite; }

  /* ── PDF ───────────────────────────────────────────────────────────────── */
  .pdf-frame { width:90vw; height:85vh; border:none; border-radius:12px; background:#fff; box-shadow:0 24px 64px rgba(0,0,0,.7); }

  /* ── Image ─────────────────────────────────────────────────────────────── */
  .img-stage { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  .img-el { max-width:96vw; max-height:90vh; object-fit:contain; transform-origin:center; transition:transform .18s cubic-bezier(.16,1,.3,1); }

  /* ── Fallback ──────────────────────────────────────────────────────────── */
  .no-preview { display:flex; flex-direction:column; align-items:center; gap:10px; color:rgba(255,255,255,.25); font-size:13px; letter-spacing:.02em; }

  /* ── Font previewer ── */
  .font-stage { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; width:100%; height:100%; padding:40px; box-sizing:border-box; overflow:auto; }
  .font-preview-text { color:rgba(255,255,255,.92); line-height:1.4; text-align:center; word-break:break-word; max-width:800px; transition:font-size .15s; }
  .font-meta { color:rgba(255,255,255,.2); font-size:11px; font-family:'Geist Mono',monospace; letter-spacing:.04em; }
  .font-err { color:rgba(255,100,100,.7); font-size:13px; }
  .font-controls { display:flex; align-items:center; gap:6px; }
  .font-text-input { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); border-radius:6px; color:rgba(255,255,255,.8); font-size:12px; font-family:'Geist',sans-serif; padding:4px 8px; outline:none; width:200px; }
  .font-text-input:focus { border-color:rgba(255,255,255,.25); }

  /* ── Video ─────────────────────────────────────────────────────────────── */
  .vc { position:relative; width:min(76vw,1140px); height:min(66vh,740px); background:#000; border-radius:12px; overflow:hidden; box-shadow:0 40px 90px rgba(0,0,0,.8); }
  .video { width:100%; height:100%; object-fit:contain; display:block; cursor:pointer; }
  .v-overlay { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:flex-end; opacity:0; transition:opacity .2s; pointer-events:none; }
  .v-overlay.show { opacity:1; pointer-events:auto; }
  .v-scrim { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,.1) 40%,transparent 65%); pointer-events:none; }
  .v-center {
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    width:58px; height:58px; border-radius:50%; z-index:1;
    background:rgba(255,255,255,.12); backdrop-filter:blur(8px);
    border:1px solid rgba(255,255,255,.2); color:#fff;
    display:flex; align-items:center; justify-content:center; cursor:pointer; transition:.15s;
  }
  .v-center:hover { background:rgba(255,255,255,.22); transform:translate(-50%,-50%) scale(1.06); }
  .spin-ring { width:24px; height:24px; border:2px solid rgba(255,255,255,.15); border-top-color:#fff; border-radius:50%; animation:kSpin .65s linear infinite; }
  .v-ctrl { position:relative; z-index:1; padding:10px 18px 16px; display:flex; flex-direction:column; gap:8px; }
  .v-seek-row { display:flex; align-items:center; gap:10px; }
  .v-t { color:rgba(255,255,255,.6); font-size:11px; font-family:'Geist Mono',monospace; flex-shrink:0; }
  .v-row { display:flex; align-items:center; justify-content:space-between; }
  .v-left,.v-right { display:flex; align-items:center; gap:6px; }
  .v-btn { background:none; border:none; color:rgba(255,255,255,.7); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px; border-radius:6px; transition:.13s; }
  .v-btn:hover { color:#fff; background:rgba(255,255,255,.1); }
  .v-time { color:rgba(255,255,255,.45); font-size:11px; font-family:'Geist Mono',monospace; }
  .v-vol-wrap { display:flex; align-items:center; gap:6px; min-width:28px; }
  .v-vol-track {
    width:0;
    opacity:0;
    overflow:hidden;
    pointer-events:none;
    position:relative;
    height:16px;
    display:flex;
    align-items:center;
    transition:width .16s ease, opacity .12s ease;
  }
  .v-vol-wrap:hover .v-vol-track,
  .v-vol-wrap.open .v-vol-track {
    width:84px;
    opacity:1;
    pointer-events:auto;
  }
  .v-vol-track::before { content:''; position:absolute; inset:0; margin:auto; height:2.5px; border-radius:99px; background:rgba(255,255,255,.18); }
  .v-vol-fill { position:absolute; left:0; top:50%; transform:translateY(-50%); height:2.5px; border-radius:99px; background:#fff; pointer-events:none; z-index:1; transition:width .05s; }
  .v-vol-input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; z-index:2; -webkit-appearance:none; }

  /* ── Shared seekbar ────────────────────────────────────────────────────── */
  .sbar { flex:1; position:relative; height:20px; display:flex; align-items:center; cursor:pointer; }
  .sbar-track { position:absolute; inset:0; margin:auto; height:3px; border-radius:99px; background:rgba(255,255,255,.12); pointer-events:none; transition:height .12s; }
  .sbar-fill  { position:absolute; left:0; top:50%; transform:translateY(-50%); height:3px; background:#fff; border-radius:99px; pointer-events:none; transition:width .05s, height .12s; z-index:1; }
  .sbar-input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; margin:0; -webkit-appearance:none; z-index:2; }
  .sbar:hover .sbar-track,
  .sbar:hover .sbar-fill  { height:5px; }

  /* ── Audio card ────────────────────────────────────────────────────────── */
  .audio-card {
    position:relative; overflow:hidden;
    display:flex; flex-direction:row; align-items:stretch;
    width:min(620px, 92vw);
    border-radius:20px;
    background:rgba(10,10,12,0.7);
    backdrop-filter:blur(40px) saturate(1.6);
    border:1px solid rgba(255,255,255,0.07);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 48px 120px rgba(0,0,0,0.9),
      0 8px 40px rgba(0,0,0,0.5);
    animation:kCardIn .35s cubic-bezier(.16,1,.3,1);
  }
  .right-col {
    flex:1; display:flex; flex-direction:column; justify-content:center;
    gap:18px; padding:28px 26px; z-index:2; min-width:0;
  }

  /* Ambient background art */
  .ambient {
    position:absolute; inset:-30px; z-index:0;
    background-size:cover; background-position:center;
    filter:blur(40px) saturate(1.4);
    opacity:0.22; pointer-events:none;
  }
  .ambient-color {
    position:absolute; inset:-30px; z-index:0;
    background:radial-gradient(ellipse at 50% 30%, var(--ac) 0%, transparent 70%);
    opacity:0.12; pointer-events:none;
  }
  .card-noise {
    position:absolute; inset:0; z-index:1; pointer-events:none; border-radius:28px;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
    opacity:.35;
  }

  /* Cover art */
  .cover-col {
    flex-shrink:0; z-index:2;
    align-self:stretch;
    border-radius:20px 0 0 20px; overflow:hidden;
    display:flex; align-items:stretch;
  }
  .cover-art {
    display:flex; align-items:stretch;
  }
  .cover-img {
    /* Let the image be its natural width scaled to card height */
    height:100%;
    width:auto;
    display:block;
    object-fit:cover;
    max-width:260px;
    min-width:120px;
  }
  .cover-placeholder {
    width:180px; height:100%;
    background:rgba(255,255,255,.04);
    display:flex; align-items:center; justify-content:center;
    color:var(--ac);
  }

  /* Track info */
  .track-info {
    text-align:left; width:100%; z-index:2;
    display:flex; flex-direction:column; gap:4px;
  }
  .t-title  { color:rgba(255,255,255,.92); font-size:16px; font-weight:600; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3; }
  .t-artist { color:rgba(255,255,255,.45); font-size:12.5px; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:.01em; }
  .t-album  { color:rgba(255,255,255,.2); font-size:11px; font-family:'Geist Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:.04em; text-transform:uppercase; }

  .shim {
    height:14px; border-radius:7px; margin:0 auto;
    background:linear-gradient(90deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 100%);
    background-size:300% 100%; animation:kShimmer 1.6s infinite;
  }
  .shim-title  { width:60%; margin-bottom:4px; }
  .shim-artist { width:38%; height:10px; }

  /* Seek */
  .a-seek { display:flex; align-items:center; gap:8px; width:100%; z-index:2; }
  .a-t { color:rgba(255,255,255,.25); font-size:10.5px; font-family:'Geist Mono',monospace; flex-shrink:0; min-width:30px; }
  .a-sbar { flex:1; }

  /* Controls */
  .a-ctrl { display:flex; align-items:center; justify-content:space-between; width:100%; z-index:2; gap:6px; }
  .a-secondary { display:flex; align-items:center; gap:4px; }
  .vol-wrap { display:flex; align-items:center; gap:7px; width:auto; min-width:28px; flex-shrink:0; }
  .ghost-btn { background:none; border:none; color:rgba(255,255,255,.28); cursor:pointer; display:flex; align-items:center; padding:5px; transition:.13s; flex-shrink:0; border-radius:6px; }
  .ghost-btn:hover { color:rgba(255,255,255,.75); background:rgba(255,255,255,.07); }
  .ghost-active { color:var(--ac, #34d399) !important; }
  .ghost-btn:hover { color:rgba(255,255,255,.7); }
  .vol-track {
    width:0;
    opacity:0;
    overflow:hidden;
    pointer-events:none;
    position:relative;
    height:16px;
    display:flex;
    align-items:center;
    transition:width .16s ease, opacity .12s ease;
  }
  .vol-wrap:hover .vol-track,
  .vol-wrap.open .vol-track {
    width:72px;
    opacity:1;
    pointer-events:auto;
  }
  .vol-track::before { content:''; position:absolute; inset:0; margin:auto; height:2.5px; border-radius:99px; background:rgba(255,255,255,.1); }
  .vol-fill { position:absolute; left:0; top:50%; transform:translateY(-50%); height:2.5px; border-radius:99px; pointer-events:none; z-index:1; transition:width .05s; }
  .vol-input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; z-index:2; -webkit-appearance:none; }

  .play-btn {
    width:52px; height:52px; border-radius:50%; flex-shrink:0;
    background:var(--ac); border:none; color:#000;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:.15s;
    box-shadow:0 6px 24px rgba(0,0,0,.5);
  }
  .play-btn:hover { transform:scale(1.07); }
  .play-btn.playing { box-shadow:0 0 0 4px rgba(255,255,255,.08), 0 6px 24px rgba(0,0,0,.5); }

  /* Mobile */
  @media (max-width:640px) {
    .topbar { max-width:calc(100vw - 16px); padding:5px 5px 5px 12px; gap:10px; }
    .tb-name { max-width:140px; font-size:11.5px; }
    .tb-sep, .tb-size { display:none; }
    .botbar { flex-wrap:wrap; justify-content:center; max-width:calc(100vw - 16px); border-radius:20px; padding:8px; }
    .bl { display:none; }
    .bb { padding:8px; border-radius:50%; }
    .bg.mid { border:none; padding:0; margin:0; }
    .vc { width:99vw; height:55vw; border-radius:8px; }
    .audio-card { flex-direction:column; width:calc(100vw - 24px); border-radius:18px; }
    .cover-col { width:100%; min-height:180px; }
    .right-col { padding:20px 18px 22px; gap:14px; }
  }
</style>
