<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconPlayerSkipBack,
    IconPlayerSkipForward, IconPlayerTrackNext, IconPlayerTrackPrev,
    IconUpload, IconTrash, IconScissors, IconCopy,
    IconDownload, IconVolume, IconVolume3,
    IconZoomIn, IconZoomOut, IconSettings,
  } from "@tabler/icons-svelte";

  let { apiKey }: { apiKey: string } = $props();

  // ── Media types ──────────────────────────────────────────────────────
  type MediaClip = {
    id: string;
    name: string;
    type: "video" | "audio" | "image";
    url: string;
    duration: number;
    width: number;
    height: number;
    thumbnail?: string;
  };

  type TimelineClip = {
    id: string;
    mediaId: string;
    trackIdx: number;
    startFrame: number;
    durationFrames: number;
    trimStart: number;
    trimEnd: number;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
  };

  type Track = {
    id: string;
    name: string;
    type: "video" | "audio" | "text";
    muted: boolean;
    locked: boolean;
    clips: TimelineClip[];
  };

  type TextOverlay = {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    startFrame: number;
    durationFrames: number;
  };

  // ── State ────────────────────────────────────────────────────────────
  let mediaPool = $state<MediaClip[]>([]);
  let tracks = $state<Track[]>([
    { id: "v1", name: "Video 1", type: "video", muted: false, locked: false, clips: [] },
    { id: "a1", name: "Audio 1", type: "audio", muted: false, locked: false, clips: [] },
  ]);
  let textOverlays = $state<TextOverlay[]>([]);

  let playing = $state(false);
  let currentFrame = $state(0);
  let totalFrames = $state(300);
  let fps = $state(30);
  let volume = $state(1);
  let muted = $state(false);
  let loop = $state(true);

  let zoomTimeline = $state(1);
  let scrollX = $state(0);
  let selectedClipId = $state<string | null>(null);
  let dragClipId = $state<string | null>(null);
  let dragStartX = $state(0);
  let dragOrigStart = $state(0);

  let previewEl: HTMLVideoElement | null = $state(null);
  let fileInputEl: HTMLInputElement | null = $state(null);
  let dropZone: HTMLDivElement | null = $state(null);
  let animFrame = 0;
  let lastTime = 0;

  const FRAME_WIDTH = 8;
  const TRACK_HEIGHT = 48;
  const HEADER_HEIGHT = 32;

  // ── Derived ──────────────────────────────────────────────────────────
  let currentTime = $derived(currentFrame / fps);
  let duration = $derived(totalFrames / fps);
  let progress = $derived(totalFrames > 0 ? currentFrame / totalFrames : 0);

  // ── Media import ─────────────────────────────────────────────────────
  function importMedia() {
    fileInputEl?.click();
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    input.value = "";
    for (const file of Array.from(files)) {
      addMediaFile(file);
    }
  }

  function addMediaFile(file: File) {
    const url = URL.createObjectURL(file);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isVideo = ["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext);
    const isAudio = ["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext);
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);

    const type = isVideo ? "video" : isAudio ? "audio" : "image";
    if (!isVideo && !isAudio && !isImage) return;

    const clip: MediaClip = {
      id: "media_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: file.name,
      type,
      url,
      duration: 0,
      width: 0,
      height: 0,
    };

    if (isVideo || isAudio) {
      const el = document.createElement(isVideo ? "video" : "audio") as HTMLVideoElement;
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        clip.duration = el.duration;
        clip.width = el.videoWidth ?? 0;
        clip.height = el.videoHeight ?? 0;
        if (isVideo) {
          el.currentTime = 1;
          el.onseeked = () => {
            const c = document.createElement("canvas");
            c.width = 120;
            c.height = Math.round((el.videoHeight / el.videoWidth) * 120) || 68;
            const ctx = c.getContext("2d");
            if (ctx) { ctx.drawImage(el, 0, 0, c.width, c.height); clip.thumbnail = c.toDataURL("image/jpeg", 0.6); }
            mediaPool = [...mediaPool];
          };
        }
        recalcTotal();
        mediaPool = [...mediaPool];
      };
      el.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        clip.duration = 5;
        clip.width = img.naturalWidth;
        clip.height = img.naturalHeight;
        clip.thumbnail = url;
        mediaPool = [...mediaPool];
      };
      img.src = url;
    }
    mediaPool = [...mediaPool, clip];
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    draggingOver = false;
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      addMediaFile(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  let draggingOver = $state(false);

  // ── Timeline operations ──────────────────────────────────────────────
  function addToTrack(media: MediaClip) {
    const targetTrack = tracks.find(t => t.type === media.type) ?? tracks.find(t => t.type === "video");
    if (!targetTrack) return;

    const lastClip = targetTrack.clips.sort((a, b) => (a.startFrame + a.durationFrames) - (b.startFrame + b.durationFrames)).pop();
    const startFrame = lastClip ? lastClip.startFrame + lastClip.durationFrames : 0;
    const durationFrames = Math.round(media.duration * fps);

    const clip: TimelineClip = {
      id: "tc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      mediaId: media.id,
      trackIdx: tracks.indexOf(targetTrack),
      startFrame,
      durationFrames,
      trimStart: 0,
      trimEnd: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      opacity: 1,
    };

    targetTrack.clips = [...targetTrack.clips, clip];
    recalcTotal();
    tracks = [...tracks];
  }

  function removeClip(trackIdx: number, clipId: string) {
    tracks[trackIdx].clips = tracks[trackIdx].clips.filter(c => c.id !== clipId);
    if (selectedClipId === clipId) selectedClipId = null;
    recalcTotal();
    tracks = [...tracks];
  }

  function splitClipAtPlayhead() {
    for (const track of tracks) {
      for (const clip of [...track.clips]) {
        if (clip.id === selectedClipId) {
          const splitPoint = currentFrame - clip.startFrame;
          if (splitPoint <= 0 || splitPoint >= clip.durationFrames) continue;
          const rightClip: TimelineClip = { ...clip, id: clip.id + "_r", startFrame: clip.startFrame + splitPoint, durationFrames: clip.durationFrames - splitPoint, trimStart: clip.trimStart + splitPoint };
          clip.durationFrames = splitPoint;
          clip.trimEnd = clip.trimEnd;
          track.clips = [...track.clips, rightClip];
          tracks = [...tracks];
          return;
        }
      }
    }
  }

  function recalcTotal() {
    let max = fps * 10;
    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = clip.startFrame + clip.durationFrames;
        if (end > max) max = end;
      }
    }
    totalFrames = max;
  }

  // ── Playback ─────────────────────────────────────────────────────────
  function play() {
    playing = true;
    lastTime = performance.now();
    tick();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(animFrame);
  }

  function stop() {
    pause();
    currentFrame = 0;
  }

  function tick() {
    if (!playing) return;
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    currentFrame = Math.min(currentFrame + dt * fps, totalFrames);
    if (currentFrame >= totalFrames) {
      if (loop) { currentFrame = 0; } else { pause(); return; }
    }
    animFrame = requestAnimationFrame(tick);
  }

  function seekTo(frame: number) {
    currentFrame = Math.max(0, Math.min(totalFrames, frame));
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * fps);
    return `${m}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  }

  // ── Keyboard ─────────────────────────────────────────────────────────
  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === "Delete" || e.code === "Backspace") {
      if (selectedClipId) {
        for (let i = 0; i < tracks.length; i++) {
          const clip = tracks[i].clips.find(c => c.id === selectedClipId);
          if (clip) { removeClip(i, selectedClipId); break; }
        }
      }
    }
    if (e.code === "KeyS" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); /* save */ }
    if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) { /* undo placeholder */ }
  }

  function handleTimelineClick(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const frame = Math.round(x / FRAME_WIDTH / zoomTimeline);
    seekTo(frame);
  }

  function handleClipMouseDown(e: MouseEvent, clip: TimelineClip, trackIdx: number) {
    e.stopPropagation();
    selectedClipId = clip.id;
    dragClipId = clip.id;
    dragStartX = e.clientX;
    dragOrigStart = clip.startFrame;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragClipId) return;
    const dx = e.clientX - dragStartX;
    const frameDelta = Math.round(dx / FRAME_WIDTH / zoomTimeline);
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === dragClipId);
      if (clip) {
        clip.startFrame = Math.max(0, dragOrigStart + frameDelta);
        tracks = [...tracks];
        return;
      }
    }
  }

  function handleMouseUp() {
    dragClipId = null;
    recalcTotal();
  }

  // ── Thumbnail generation ─────────────────────────────────────────────
  function getMediaForClip(clip: TimelineClip): MediaClip | undefined {
    return mediaPool.find(m => m.id === clip.mediaId);
  }

  function getClipColor(type: string): string {
    switch (type) {
      case "video": return "#6366f1";
      case "audio": return "#10b981";
      case "text": return "#f59e0b";
      default: return "#666";
    }
  }

  // ── Mount ────────────────────────────────────────────────────────────
  onMount(() => {
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    cancelAnimationFrame(animFrame);
    for (const m of mediaPool) { URL.revokeObjectURL(m.url); }
  });

  let showSettings = $state(false);

  // ── Export ─────────────────────────────────────────────────────────
  let exporting = $state(false);
  let exportProgress = $state(0);
  let exportStatus = $state("");
  let showExportDialog = $state(false);
  let exportFormat = $state<"mp4" | "webm">("mp4");
  let exportQuality = $state<"high" | "medium" | "low">("medium");
  let exportWidth = $state(1920);
  let exportHeight = $state(1080);
  let ffmpegLoaded = $state(false);
  let ffmpeg: any = null;

  async function loadFfmpeg() {
    if (ffmpegLoaded) return;
    exportStatus = "Loading FFmpeg WASM...";
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }: any) => { console.log("[FFmpeg]", message); });
      ffmpeg.on("progress", ({ progress, time }: any) => {
        exportProgress = Math.min(100, Math.round(progress * 100));
        if (time > 0) exportStatus = `Encoding... ${exportProgress}%`;
      });
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpegLoaded = true;
      exportStatus = "FFmpeg loaded";
    } catch (err: any) {
      console.error("Failed to load FFmpeg:", err);
      exportStatus = `FFmpeg load failed: ${err.message}`;
    }
  }

  async function startExport() {
    showExportDialog = false;
    if (!ffmpeg) await loadFfmpeg();
    if (!ffmpeg) return;

    exporting = true;
    exportProgress = 0;
    exportStatus = "Rendering frames...";

    const outW = exportWidth;
    const outH = exportHeight;
    const outFps = fps;
    const total = totalFrames;
    const qualityBitrate = exportQuality === "high" ? "8M" : exportQuality === "medium" ? "4M" : "2M";

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

    try {
      // Clean up any previous files
      try { await ffmpeg.deleteFile("input.mp4"); } catch {}
      try { await ffmpeg.deleteFile("output." + exportFormat); } catch {}

      // Render frames to PNG files
      const savedFrame = currentFrame;
      const frameBatchSize = 10;

      for (let f = 0; f < total; f += frameBatchSize) {
        const batchEnd = Math.min(f + frameBatchSize, total);
        for (let i = f; i < batchEnd; i++) {
          currentFrame = i;
          await tickRender();

          // Draw preview to canvas
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, outW, outH);

          // Draw all visible video clips at this frame
          for (const track of tracks) {
            if (track.type !== "video" || track.muted) continue;
            for (const clip of track.clips) {
              if (i < clip.startFrame || i >= clip.startFrame + clip.durationFrames) continue;
              const media = getMediaForClip(clip);
              if (!media) continue;

              const videoEl = document.querySelector(`video[src="${media.url}"]`) as HTMLVideoElement | null;
              if (videoEl) {
                try {
                  const sx = (i - clip.startFrame) / clip.durationFrames;
                  videoEl.currentTime = media.duration * (clip.trimStart / (clip.durationFrames || 1) + sx * ((clip.durationFrames - clip.trimStart - clip.trimEnd) / clip.durationFrames));
                  await new Promise(r => { videoEl.onseeked = () => r(undefined); videoEl.onseeked = r; setTimeout(r, 50); });
                  ctx.save();
                  ctx.globalAlpha = clip.opacity;
                  ctx.drawImage(videoEl, 0, 0, outW, outH);
                  ctx.restore();
                } catch {}
              }
            }
          }

          const frameName = `frame${String(i).padStart(5, "0")}.png`;
          const dataUrl = canvas.toDataURL("image/png");
          const binary = Uint8Array.from(atob(dataUrl.split(",")[1]), c => c.charCodeAt(0));
          await ffmpeg.writeFile(frameName, binary);
        }
        exportProgress = Math.round((batchEnd / total) * 70);
        exportStatus = `Rendering frames... ${batchEnd}/${total}`;
        await tick();
      }

      currentFrame = savedFrame;

      // Encode with FFmpeg
      exportStatus = "Encoding video...";
      exportProgress = 75;
      await tick();

      const inputArgs = [
        "-framerate", String(outFps),
        "-i", "frame%05d.png",
      ];

      if (exportFormat === "mp4") {
        await ffmpeg.exec([
          ...inputArgs,
          "-c:v", "libx264",
          "-preset", "medium",
          "-b:v", qualityBitrate,
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "output.mp4",
        ]);
      } else {
        await ffmpeg.exec([
          ...inputArgs,
          "-c:v", "libvpx-vp9",
          "-b:v", qualityBitrate,
          "-crf", "30",
          "-pix_fmt", "yuv420p",
          "output.webm",
        ]);
      }

      exportProgress = 95;
      exportStatus = "Preparing download...";
      await tick();

      // Read output
      const outFile = `output.${exportFormat}`;
      const data = await ffmpeg.readFile(outFile);
      const blob = new Blob([data], { type: exportFormat === "mp4" ? "video/mp4" : "video/webm" });
      const url = URL.createObjectURL(blob);

      // Download
      const a = document.createElement("a");
      a.href = url;
      a.download = `export.${exportFormat}`;
      a.click();

      // Cleanup frames
      for (let i = 0; i < total; i++) {
        try { await ffmpeg.deleteFile(`frame${String(i).padStart(5, "0")}.png`); } catch {}
      }
      try { await ffmpeg.deleteFile(outFile); } catch {}

      exportProgress = 100;
      exportStatus = "Export complete!";
      setTimeout(() => { exporting = false; exportStatus = ""; }, 2000);

    } catch (err: any) {
      console.error("Export failed:", err);
      exportStatus = `Export failed: ${err.message}`;
      exporting = false;
    }
  }

  async function tickRender() {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ve-root" ondragover={handleDragOver} ondrop={handleDrop} bind:this={dropZone}>
  <!-- ═══ TOP BAR ═══ -->
  <div class="ve-topbar">
    <span class="ve-logo">Video Editor</span>
    <div class="ve-topbar-spacer"></div>
    <button class="ve-tb-btn" onclick={importMedia}><IconUpload size={14}/> Import</button>
    <button class="ve-tb-btn export-btn" onclick={() => showExportDialog = true} disabled={exporting || totalFrames === 0}>
      {#if exporting}
        {exportProgress}%
      {:else}
        <IconDownload size={14}/> Export
      {/if}
    </button>
    <button class="ve-tb-btn" onclick={() => showSettings = !showSettings}><IconSettings size={14}/></button>
  </div>

  <div class="ve-main">
    <!-- ═══ LEFT: MEDIA POOL ═══ -->
    <div class="ve-sidebar">
      <div class="ve-sidebar-header">
        <span>Media</span>
        <button class="ve-small-btn" onclick={importMedia}>+</button>
      </div>
      <div class="ve-media-list">
        {#if mediaPool.length === 0}
          <div class="ve-empty">
            {#if draggingOver}
              Drop files here
            {:else}
              Drop files or<br/>click Import
            {/if}
          </div>
        {/if}
        {#each mediaPool as m (m.id)}
          <div class="ve-media-item" onclick={() => addToTrack(m)} title={m.name}>
            {#if m.thumbnail}
              <img class="ve-media-thumb" src={m.thumbnail} alt={m.name}/>
            {:else}
              <div class="ve-media-thumb ve-media-thumb-placeholder">
                {m.type === "video" ? "🎬" : m.type === "audio" ? "🎵" : "🖼"}
              </div>
            {/if}
            <div class="ve-media-info">
              <span class="ve-media-name">{m.name}</span>
              <span class="ve-media-meta">{m.type} · {formatTime(m.duration)}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- ═══ CENTER: PREVIEW + TIMELINE ═══ -->
    <div class="ve-center">
      <!-- Preview -->
      <div class="ve-preview-wrap">
        <div class="ve-preview">
          <div class="ve-preview-canvas" style="background:#000;">
            {#if mediaPool.length > 0}
              <!-- Render current frame's video clips -->
              {#each tracks as track}
                {#if track.type === "video" && !track.muted}
                  {#each track.clips as clip}
                    {@const media = getMediaForClip(clip)}
                    {#if media && currentFrame >= clip.startFrame && currentFrame < clip.startFrame + clip.durationFrames}
                      <video
                        class="ve-preview-video"
                        src={media.url}
                        muted
                        autoplay
                        loop
                        style="opacity:{clip.opacity}"
                      ></video>
                    {/if}
                  {/each}
                {/if}
              {/each}
              <!-- Text overlays -->
              {#each textOverlays as t}
                {#if currentFrame >= t.startFrame && currentFrame < t.startFrame + t.durationFrames}
                  <div class="ve-text-overlay" style="left:{t.x}%;top:{t.y}%;font-size:{t.fontSize}px;font-family:{t.fontFamily};color:{t.color};">
                    {t.text}
                  </div>
                {/if}
              {/each}
            {:else}
              <div class="ve-preview-empty">Import media to start</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Transport controls -->
      <div class="ve-transport">
        <button class="ve-t-btn" onclick={() => seekTo(0)}><IconPlayerSkipBack size={16}/></button>
        <button class="ve-t-btn" onclick={playing ? pause : play}>
          {#if playing}<IconPlayerPause size={18}/>{:else}<IconPlayerPlay size={18}/>{/if}
        </button>
        <button class="ve-t-btn" onclick={stop}><IconPlayerStop size={16}/></button>
        <button class="ve-t-btn" onclick={() => seekTo(totalFrames)}><IconPlayerSkipForward size={16}/></button>
        <span class="ve-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <div class="ve-transport-spacer"></div>
        <button class="ve-t-btn" onclick={() => muted = !muted}>
          {#if muted}<IconVolume3 size={14}/>{:else}<IconVolume size={14}/>{/if}
        </button>
        <input type="range" min="0" max="1" step="0.05" bind:value={volume} class="ve-volume-slider"/>
        <button class="ve-t-btn ve-loop-btn" class:active={loop} onclick={() => loop = !loop}>Loop</button>
      </div>

      <!-- Timeline -->
      <div class="ve-timeline-wrap">
        <!-- Time ruler -->
        <div class="ve-ruler" onclick={handleTimelineClick}>
          {#each Array(Math.ceil(totalFrames / fps / 5) + 1) as _, i}
            <div class="ve-ruler-tick" style="left:{i * 5 * fps * FRAME_WIDTH * zoomTimeline}px">
              <span class="ve-ruler-label">{i * 5}s</span>
            </div>
          {/each}
          <div class="ve-playhead" style="left:{currentFrame * FRAME_WIDTH * zoomTimeline}px"></div>
        </div>

        <!-- Tracks -->
        <div class="ve-tracks-scroll">
          {#each tracks as track, ti (track.id)}
            <div class="ve-track-row">
              <div class="ve-track-header">
                <span class="ve-track-name" style="color:{getClipColor(track.type)}">{track.name}</span>
                <button class="ve-th-btn" class:muted={track.muted} onclick={() => { track.muted = !track.muted; tracks = [...tracks]; }}>
                  {#if track.muted}🔇{:else if track.type === "video"}🎬{:else}🎵{/if}
                </button>
              </div>
              <div class="ve-track-clips" onclick={handleTimelineClick}>
                {#each track.clips as clip (clip.id)}
                  {@const media = getMediaForClip(clip)}
                  <div
                    class="ve-clip"
                    class:selected={selectedClipId === clip.id}
                    style="left:{clip.startFrame * FRAME_WIDTH * zoomTimeline}px;width:{clip.durationFrames * FRAME_WIDTH * zoomTimeline}px;background:{getClipColor(track.type)}22;border-color:{getClipColor(track.type)}55;"
                    onmousedown={(e) => handleClipMouseDown(e, clip, ti)}
                  >
                    {#if media?.thumbnail}
                      <div class="ve-clip-bg" style="background-image:url({media.thumbnail})"></div>
                    {/if}
                    <span class="ve-clip-label">{clip.id === selectedClipId ? "" : media?.name ?? "Clip"}</span>
                    {#if clip.id === selectedClipId}
                      <button class="ve-clip-delete" onclick={(e) => { e.stopPropagation(); removeClip(ti, clip.id); }}>×</button>
                    {/if}
                  </div>
                {/each}
                <div class="ve-playhead-track" style="left:{currentFrame * FRAME_WIDTH * zoomTimeline}px"></div>
              </div>
            </div>
          {/each}
        </div>

        <!-- Zoom controls -->
        <div class="ve-zoom-bar">
          <button class="ve-z-btn" onclick={() => zoomTimeline = Math.max(0.1, zoomTimeline / 1.5)}><IconZoomOut size={12}/></button>
          <input type="range" min="0.1" max="5" step="0.1" bind:value={zoomTimeline} class="ve-zoom-slider"/>
          <button class="ve-z-btn" onclick={() => zoomTimeline = Math.min(5, zoomTimeline * 1.5)}><IconZoomIn size={12}/></button>
        </div>
      </div>
    </div>

    <!-- ═══ RIGHT: PROPERTIES ═══ -->
    <div class="ve-properties">
      <div class="ve-prop-header">Properties</div>
      {#if selectedClipId}
        {#each tracks as track}
          {@const clip = track.clips.find(c => c.id === selectedClipId)}
          {#if clip}
            {@const media = getMediaForClip(clip)}
            <div class="ve-prop-section">
              <div class="ve-prop-label">Clip</div>
              <div class="ve-prop-row"><span>Name</span><span>{media?.name ?? "—"}</span></div>
              <div class="ve-prop-row"><span>Start</span><span>{clip.startFrame}</span></div>
              <div class="ve-prop-row"><span>Duration</span><span>{clip.durationFrames}f</span></div>
              <div class="ve-prop-row"><span>Opacity</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={clip.opacity} class="ve-prop-slider"/>
              </div>
            </div>
            <div class="ve-prop-actions">
              <button class="ve-prop-btn" onclick={() => splitClipAtPlayhead()}>Split at Playhead</button>
              <button class="ve-prop-btn danger" onclick={() => removeClip(tracks.indexOf(track), clip.id)}>Delete</button>
            </div>
          {/if}
        {/each}
      {:else}
        <div class="ve-prop-empty">Select a clip to edit</div>
      {/if}

      <div class="ve-prop-section">
        <div class="ve-prop-label">Project</div>
        <div class="ve-prop-row"><span>Resolution</span><span>1920×1080</span></div>
        <div class="ve-prop-row"><span>FPS</span><span>{fps}</span></div>
        <div class="ve-prop-row"><span>Duration</span><span>{formatTime(duration)}</span></div>
        <div class="ve-prop-row"><span>Clips</span><span>{tracks.reduce((a, t) => a + t.clips.length, 0)}</span></div>
      </div>
    </div>
  </div>
</div>

<input bind:this={fileInputEl} type="file" accept="video/*,audio/*,image/*" multiple style="display:none" onchange={handleFileInput}/>

<!-- Export progress overlay -->
{#if exporting}
  <div class="ve-export-overlay">
    <div class="ve-export-box">
      <div class="ve-export-title">Exporting...</div>
      <div class="ve-export-bar-track">
        <div class="ve-export-bar-fill" style="width:{exportProgress}%"></div>
      </div>
      <div class="ve-export-status">{exportStatus}</div>
    </div>
  </div>
{/if}

<!-- Export dialog -->
{#if showExportDialog}
  <div class="ve-export-overlay" onclick={() => showExportDialog = false}>
    <div class="ve-export-dialog" onclick={(e) => e.stopPropagation()}>
      <div class="ve-export-dialog-title">Export Video</div>
      <div class="ve-export-row">
        <label>Format</label>
        <select bind:value={exportFormat}>
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM (VP9)</option>
        </select>
      </div>
      <div class="ve-export-row">
        <label>Quality</label>
        <select bind:value={exportQuality}>
          <option value="high">High (8 Mbps)</option>
          <option value="medium">Medium (4 Mbps)</option>
          <option value="low">Low (2 Mbps)</option>
        </select>
      </div>
      <div class="ve-export-row">
        <label>Width</label>
        <input type="number" min="1" max="3840" bind:value={exportWidth}/>
      </div>
      <div class="ve-export-row">
        <label>Height</label>
        <input type="number" min="1" max="2160" bind:value={exportHeight}/>
      </div>
      <div class="ve-export-info">
        Frames: {totalFrames} · Duration: {formatTime(duration)} · FPS: {fps}
      </div>
      <div class="ve-export-actions">
        <button class="ve-export-cancel" onclick={() => showExportDialog = false}>Cancel</button>
        <button class="ve-export-go" onclick={startExport}>
          <IconDownload size={14}/> Export
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ve-root { display: flex; flex-direction: column; height: 100%; background: #111114; color: #ccc; font-family: 'Inter', 'Segoe UI', sans-serif; overflow: hidden; }

  .ve-topbar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; background: #1a1a1e; border-bottom: 1px solid #2a2a2e; flex-shrink: 0; }
  .ve-logo { font-size: 13px; font-weight: 700; color: #fff; }
  .ve-topbar-spacer { flex: 1; }
  .ve-tb-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 4px; border: 1px solid #333; background: #222226; color: #888; font-size: 11px; cursor: pointer; transition: .15s; }
  .ve-tb-btn:hover { border-color: #6366f1; color: #fff; }

  .ve-main { display: flex; flex: 1; overflow: hidden; }

  /* ── Sidebar (Media Pool) ── */
  .ve-sidebar { width: 200px; background: #161619; border-right: 1px solid #2a2a2e; display: flex; flex-direction: column; flex-shrink: 0; }
  .ve-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #2a2a2e; }
  .ve-small-btn { width: 20px; height: 20px; border-radius: 3px; border: 1px solid #333; background: #222226; color: #888; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .ve-small-btn:hover { border-color: #6366f1; color: #fff; }
  .ve-media-list { flex: 1; overflow-y: auto; padding: 4px; }
  .ve-empty { padding: 20px; text-align: center; color: #444; font-size: 11px; line-height: 1.5; }
  .ve-media-item { display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 4px; cursor: pointer; transition: .1s; }
  .ve-media-item:hover { background: #222226; }
  .ve-media-thumb { width: 40px; height: 28px; border-radius: 3px; object-fit: cover; flex-shrink: 0; background: #222226; }
  .ve-media-thumb-placeholder { display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .ve-media-info { flex: 1; min-width: 0; }
  .ve-media-name { display: block; font-size: 10px; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ve-media-meta { display: block; font-size: 9px; color: #555; }

  /* ── Center ── */
  .ve-center { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  /* Preview */
  .ve-preview-wrap { flex: 1; display: flex; align-items: center; justify-content: center; background: #0a0a0c; padding: 12px; min-height: 0; }
  .ve-preview { width: 100%; max-width: 800px; aspect-ratio: 16/9; position: relative; }
  .ve-preview-canvas { width: 100%; height: 100%; position: relative; overflow: hidden; border-radius: 4px; }
  .ve-preview-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .ve-preview-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #333; font-size: 14px; }
  .ve-text-overlay { position: absolute; }

  /* Transport */
  .ve-transport { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #1a1a1e; border-top: 1px solid #2a2a2e; border-bottom: 1px solid #2a2a2e; flex-shrink: 0; }
  .ve-t-btn { width: 28px; height: 28px; border-radius: 4px; border: none; background: none; color: #888; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .1s; }
  .ve-t-btn:hover { background: #2a2a2e; color: #fff; }
  .ve-loop-btn { width: auto; padding: 0 8px; font-size: 10px; font-weight: 600; }
  .ve-loop-btn.active { color: #6366f1; }
  .ve-time { font-size: 11px; font-family: 'Geist Mono', monospace; color: #666; margin-left: 6px; min-width: 120px; }
  .ve-transport-spacer { flex: 1; }
  .ve-volume-slider { width: 60px; height: 3px; accent-color: #6366f1; }

  /* Timeline */
  .ve-timeline-wrap { height: 200px; background: #141417; border-top: 1px solid #2a2a2e; display: flex; flex-direction: column; flex-shrink: 0; }
  .ve-ruler { position: relative; height: 24px; background: #1a1a1e; border-bottom: 1px solid #2a2a2e; overflow: hidden; cursor: pointer; flex-shrink: 0; }
  .ve-ruler-tick { position: absolute; top: 0; height: 100%; border-left: 1px solid #333; }
  .ve-ruler-label { font-size: 8px; color: #555; font-family: 'Geist Mono', monospace; padding-left: 3px; }
  .ve-playhead { position: absolute; top: 0; width: 2px; height: 100%; background: #ef4444; z-index: 5; pointer-events: none; }

  .ve-tracks-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .ve-track-row { display: flex; height: 48px; border-bottom: 1px solid #1a1a1e; }
  .ve-track-header { width: 100px; padding: 0 8px; display: flex; flex-direction: column; justify-content: center; gap: 2px; background: #161619; border-right: 1px solid #2a2a2e; flex-shrink: 0; }
  .ve-track-name { font-size: 10px; font-weight: 600; }
  .ve-th-btn { font-size: 10px; cursor: pointer; background: none; border: none; color: #666; text-align: left; padding: 0; }
  .ve-th-btn.muted { opacity: .4; }
  .ve-track-clips { flex: 1; position: relative; overflow: hidden; }
  .ve-playhead-track { position: absolute; top: 0; width: 2px; height: 100%; background: #ef4444; z-index: 4; pointer-events: none; }

  .ve-clip { position: absolute; top: 4px; height: 40px; border-radius: 4px; border: 1px solid; cursor: pointer; overflow: hidden; display: flex; align-items: center; z-index: 1; transition: box-shadow .1s; }
  .ve-clip:hover { box-shadow: 0 0 0 1px rgba(255,255,255,.15); z-index: 2; }
  .ve-clip.selected { box-shadow: 0 0 0 2px #6366f1; z-index: 3; }
  .ve-clip-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .4; }
  .ve-clip-label { position: relative; padding: 0 6px; font-size: 9px; color: rgba(255,255,255,.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; z-index: 1; }
  .ve-clip-delete { position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 3px; border: none; background: rgba(0,0,0,.6); color: #f87171; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; }

  /* Zoom */
  .ve-zoom-bar { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #161619; border-top: 1px solid #2a2a2e; flex-shrink: 0; }
  .ve-z-btn { width: 18px; height: 18px; border-radius: 3px; border: none; background: none; color: #555; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .ve-z-btn:hover { color: #aaa; }
  .ve-zoom-slider { flex: 1; height: 3px; accent-color: #6366f1; }

  /* ── Properties ── */
  .ve-properties { width: 200px; background: #161619; border-left: 1px solid #2a2a2e; overflow-y: auto; flex-shrink: 0; }
  .ve-prop-header { padding: 8px 10px; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #2a2a2e; }
  .ve-prop-section { padding: 8px 10px; border-bottom: 1px solid #1a1a1e; }
  .ve-prop-label { font-size: 9px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .ve-prop-row { display: flex; justify-content: space-between; font-size: 10px; color: #888; padding: 2px 0; }
  .ve-prop-row span:last-child { color: #aaa; font-family: 'Geist Mono', monospace; }
  .ve-prop-slider { width: 80px; height: 3px; accent-color: #6366f1; }
  .ve-prop-empty { padding: 20px 10px; text-align: center; color: #333; font-size: 11px; }
  .ve-prop-actions { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .ve-prop-btn { padding: 4px 8px; border-radius: 3px; border: 1px solid #333; background: #222226; color: #888; font-size: 10px; cursor: pointer; transition: .1s; }
  .ve-prop-btn:hover { border-color: #6366f1; color: #fff; }
  .ve-prop-btn.danger { border-color: #3d1515; color: #f87171; }
  .ve-prop-btn.danger:hover { background: #1f0a0a; border-color: #f87171; }

  /* Scrollbar */
  .ve-media-list::-webkit-scrollbar,
  .ve-tracks-scroll::-webkit-scrollbar,
  .ve-properties::-webkit-scrollbar { width: 5px; }
  .ve-media-list::-webkit-scrollbar-track,
  .ve-tracks-scroll::-webkit-scrollbar-track,
  .ve-properties::-webkit-scrollbar-track { background: transparent; }
  .ve-media-list::-webkit-scrollbar-thumb,
  .ve-tracks-scroll::-webkit-scrollbar-thumb,
  .ve-properties::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  .export-btn { background: #6366f1 !important; border-color: #6366f1 !important; color: #fff !important; font-weight: 600; }
  .export-btn:hover { opacity: .85; }
  .export-btn:disabled { opacity: .4; cursor: not-allowed; }

  .ve-export-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  .ve-export-box { background: #1a1a1e; border: 1px solid #333; border-radius: 8px; padding: 20px; min-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
  .ve-export-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 12px; }
  .ve-export-bar-track { width: 100%; height: 6px; background: #2a2a2e; border-radius: 3px; overflow: hidden; }
  .ve-export-bar-fill { height: 100%; background: #6366f1; border-radius: 3px; transition: width .15s; }
  .ve-export-status { font-size: 11px; color: #666; margin-top: 8px; font-family: 'Geist Mono', monospace; }

  .ve-export-dialog { background: #1a1a1e; border: 1px solid #333; border-radius: 8px; padding: 16px; min-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
  .ve-export-dialog-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 12px; }
  .ve-export-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .ve-export-row label { font-size: 11px; color: #888; min-width: 60px; }
  .ve-export-row select,
  .ve-export-row input[type="number"] { flex: 1; background: #111114; border: 1px solid #333; border-radius: 4px; padding: 4px 8px; color: #ccc; font-size: 11px; font-family: 'Geist Mono', monospace; outline: none; }
  .ve-export-row select:focus,
  .ve-export-row input:focus { border-color: #6366f1; }
  .ve-export-row select { cursor: pointer; }
  .ve-export-info { font-size: 10px; color: #555; font-family: 'Geist Mono', monospace; margin: 8px 0; padding: 6px 8px; background: #111114; border-radius: 4px; }
  .ve-export-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
  .ve-export-cancel { padding: 6px 14px; border-radius: 4px; border: 1px solid #333; background: none; color: #888; font-size: 11px; cursor: pointer; }
  .ve-export-cancel:hover { border-color: #6366f1; color: #fff; }
  .ve-export-go { display: flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 4px; border: none; background: #6366f1; color: #fff; font-size: 11px; font-weight: 600; cursor: pointer; }
  .ve-export-go:hover { opacity: .85; }
</style>
