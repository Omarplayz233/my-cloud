<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    IconPlayerPlay, IconPlayerPause, IconPlayerStop,
    IconPlayerSkipBack, IconPlayerSkipForward,
    IconUpload, IconDownload, IconTrash, IconPlus,
    IconVolume, IconVolume3, IconMicrophone,
    IconSettings, IconMusic, IconPiano, IconMixer,
    IconHeadphones, IconMetronome, IconKeyboard,
    IconCloudUpload, IconPlug, IconWaveSine,
  } from "@tabler/icons-svelte";
  import {
    type SongState, type Track, type Pattern, type NoteEvent,
    type MixerChannel, type EffectNode, type EffectType,
    createDefaultSong, uid, noteToFreq, noteName, NOTE_NAMES,
    MIN_NOTE, MAX_NOTE,
  } from "./engine";
  import { AudioEngine } from "./audio";

  let { apiKey }: { apiKey: string } = $props();

  // ── Engine ────────────────────────────────────────────────────────────
  let engine = new AudioEngine();
  let song = $state<SongState>(createDefaultSong());
  let audioReady = $state(false);

  // ── UI State ──────────────────────────────────────────────────────────
  let view = $state<"timeline" | "pianoroll" | "mixer" | "plugins">("timeline");
  let selectedPatternId = $state<string | null>(song.patterns[0]?.id ?? null);
  let selectedTrackIdx = $state(0);
  let selectedNoteId = $state<string | null>(null);
  let scrollX = $state(0);
  let scrollY = $state(0);
  let zoom = $state(1);
  let pianoRollScroll = $state(0);
  let pianoRollZoom = $state(1);
  let showMixer = $state(false);
  let showPianoRoll = $state(false);
  let showSaveDialog = $state(false);
  let showPluginDialog = $state(false);
  let saveFileName = $state("project.json");
  let saveFolder = $state("");
  let recording = $state(false);
  let metronomeOn = $state(false);
  let snapToGrid = $state(true);
  let gridSize = $state(0.25);
  let hoveredBeat = $state(0);
  let hoveredNote = $state(0);

  const PIXELS_PER_BEAT = 40;
  const NOTE_HEIGHT = 14;
  const PIANO_WIDTH = 70;
  const BEATS_PER_BAR = 4;
  const TOTAL_NOTES = 60;
  const START_OCTAVE = 3;

  let analyserData = $state<Uint8Array | null>(null);
  let timeDomainData = $state<Uint8Array | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────
  let currentBeat = $derived(engine.currentBeat);
  let isPlaying = $derived(engine.isPlaying);
  let selectedPattern = $derived(song.patterns.find(p => p.id === selectedPatternId));
  let currentBar = $derived(Math.floor(currentBeat / BEATS_PER_BAR));
  let currentBeatInBar = $derived(currentBeat % BEATS_PER_BAR);

  // ── Init ──────────────────────────────────────────────────────────────
  async function initAudio() {
    await engine.init();
    engine.setSong(song);
    engine.onBeat((beat) => {
      currentBeat;
      analyserData = engine.analyserData;
      timeDomainData = engine.timeDomainData;
    });
    engine.onSongEnd(() => {
      analyserData = engine.analyserData;
    });
    audioReady = true;
  }

  function updateEngineSong() {
    engine.setSong(song);
  }

  // ── Transport ─────────────────────────────────────────────────────────
  async function play() {
    if (!audioReady) await initAudio();
    engine.playSong(song);
  }

  function pause() {
    engine.pauseSong();
  }

  function stop() {
    engine.stopSong();
  }

  function togglePlay() {
    if (isPlaying) pause(); else play();
  }

  function toggleRecord() {
    recording = !recording;
    if (recording && !isPlaying) play();
  }

  function setBeat(beat: number) {
    engine["_currentBeat"] = beat;
    engine["_startBeat"] = beat;
    if (engine.ctx) engine["_startCtxTime"] = engine.ctx.currentTime;
  }

  // ── Pattern operations ────────────────────────────────────────────────
  function addPattern() {
    const p: Pattern = {
      id: uid(),
      name: `Pattern ${song.patterns.length + 1}`,
      notes: [],
      lengthBeats: 16,
    };
    song.patterns = [...song.patterns, p];
    selectedPatternId = p.id;
    updateEngineSong();
  }

  function deletePattern(id: string) {
    song.patterns = song.patterns.filter(p => p.id !== id);
    for (const track of song.tracks) {
      track.patterns = track.patterns.filter(pid => pid !== id);
    }
    if (selectedPatternId === id) selectedPatternId = song.patterns[0]?.id ?? null;
    updateEngineSong();
  }

  function duplicatePattern(id: string) {
    const orig = song.patterns.find(p => p.id === id);
    if (!orig) return;
    const dup: Pattern = {
      id: uid(),
      name: orig.name + " copy",
      notes: orig.notes.map(n => ({ ...n, id: uid() })),
      lengthBeats: orig.lengthBeats,
    };
    song.patterns = [...song.patterns, dup];
    selectedPatternId = dup.id;
    updateEngineSong();
  }

  // ── Note operations ───────────────────────────────────────────────────
  function addNote(beat: number, note: number, velocity: number = 0.7, duration: number = 0.5) {
    if (!selectedPattern) return;
    const n: NoteEvent = {
      id: uid(),
      note,
      velocity,
      startBeat: snapToGrid ? Math.round(beat / gridSize) * gridSize : beat,
      durationBeats: duration,
    };
    selectedPattern.notes = [...selectedPattern.notes, n];
    updateEngineSong();
  }

  function deleteNote(noteId: string) {
    if (!selectedPattern) return;
    selectedPattern.notes = selectedPattern.notes.filter(n => n.id !== noteId);
    if (selectedNoteId === noteId) selectedNoteId = null;
    updateEngineSong();
  }

  function moveNote(noteId: string, newBeat: number, newNote: number) {
    if (!selectedPattern) return;
    const note = selectedPattern.notes.find(n => n.id === noteId);
    if (!note) return;
    note.startBeat = snapToGrid ? Math.round(newBeat / gridSize) * gridSize : newBeat;
    note.note = newNote;
    selectedPattern.notes = [...selectedPattern.notes];
    updateEngineSong();
  }

  function resizeNote(noteId: string, newDuration: number) {
    if (!selectedPattern) return;
    const note = selectedPattern.notes.find(n => n.id === noteId);
    if (!note) return;
    note.durationBeats = Math.max(gridSize, newDuration);
    selectedPattern.notes = [...selectedPattern.notes];
    updateEngineSong();
  }

  // ── Track operations ──────────────────────────────────────────────────
  function addTrack(instrument: "synth" | "drums" | "sampler" = "synth") {
    const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
    song.tracks = [...song.tracks, {
      id: uid(),
      name: `${instrument} ${song.tracks.length + 1}`,
      instrument,
      type: "pattern",
      patterns: [],
      midiChannel: song.tracks.length,
      color: colors[song.tracks.length % colors.length],
    }];
    song.mixerChannels = [...song.mixerChannels, {
      id: uid(),
      name: song.tracks[song.tracks.length - 1].name,
      volume: 0.7,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
    }];
    updateEngineSong();
  }

  function removeTrack(idx: number) {
    if (song.tracks.length <= 1) return;
    song.tracks.splice(idx, 1);
    song.mixerChannels.splice(idx + 1, 1);
    if (selectedTrackIdx >= song.tracks.length) selectedTrackIdx = song.tracks.length - 1;
    updateEngineSong();
  }

  function addEffect(channelIdx: number, type: EffectType) {
    const ch = song.mixerChannels[channelIdx];
    if (!ch) return;
    const defaults: Record<EffectType, Record<string, number>> = {
      reverb: { decay: 2, mix: 0.3 },
      delay: { time: 0.3, feedback: 0.4, mix: 0.3 },
      eq: { low: 0, mid: 0, high: 0 },
      compressor: { threshold: -20, ratio: 4, attack: 0.003, release: 0.25 },
      distortion: { amount: 0.5 },
      filter: { frequency: 1000, resonance: 1 },
      chorus: { rate: 1.5, depth: 0.002, mix: 0.3 },
      limiter: { threshold: -1, release: 0.01 },
    };
    ch.effects = [...ch.effects, {
      id: uid(),
      type,
      enabled: true,
      params: defaults[type],
    }];
    song.mixerChannels = [...song.mixerChannels];
  }

  function removeEffect(channelIdx: number, effectId: string) {
    const ch = song.mixerChannels[channelIdx];
    if (!ch) return;
    ch.effects = ch.effects.filter(e => e.id !== effectId);
    song.mixerChannels = [...song.mixerChannels];
  }

  function toggleMute(idx: number) {
    const ch = song.mixerChannels[idx];
    if (ch) { ch.muted = !ch.muted; song.mixerChannels = [...song.mixerChannels]; }
  }

  function toggleSolo(idx: number) {
    const ch = song.mixerChannels[idx];
    if (ch) { ch.solo = !ch.solo; song.mixerChannels = [...song.mixerChannels]; }
  }

  // ── Import audio ──────────────────────────────────────────────────────
  let fileInputEl: HTMLInputElement | null = null;
  let pluginFileInputEl: HTMLInputElement | null = null;

  function importAudio() { fileInputEl?.click(); }

  async function handleAudioFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    if (!audioReady) await initAudio();
    if (!engine.ctx) return;
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const id = uid();
    song.tracks.push({
      id,
      name: file.name,
      instrument: "sampler",
      type: "audio",
      patterns: [],
      audioUrl: URL.createObjectURL(file),
      audioBuffer,
      midiChannel: song.tracks.length,
      color: "#06b6d4",
    });
    song.mixerChannels.push({
      id: uid(),
      name: file.name,
      volume: 0.7,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
    });
    song.tracks = [...song.tracks];
    song.mixerChannels = [...song.mixerChannels];
    updateEngineSong();
  }

  // ── Export ────────────────────────────────────────────────────────────
  let exporting = $state(false);
  let exportProgress = $state(0);

  async function exportWav() {
    if (!audioReady) await initAudio();
    exporting = true;
    exportProgress = 0;
    try {
      const buffer = await engine.renderOffline(song, (p) => { exportProgress = p; });
      const wav = audioBufferToWav(buffer);
      const blob = new Blob([wav], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export.wav";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
    exporting = false;
    exportProgress = 0;
  }

  function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitsPerSample = 16;
    const dataLength = buffer.length * numChannels * (bitsPerSample / 8);
    const headerLength = 44;
    const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return arrayBuffer;
  }

  // ── Save/Load ─────────────────────────────────────────────────────────
  function saveToCloud() {
    showSaveDialog = true;
  }

  async function confirmSave() {
    showSaveDialog = false;
    const fullName = saveFolder ? `${saveFolder}/${saveFileName}` : saveFileName;
    const json = JSON.stringify(song);
    const blob = new Blob([json], { type: "application/json" });
    const fd = new FormData();
    fd.append("file", blob, fullName);
    const up = await fetch("/api/telegram/uploadFile", {
      method: "POST",
      body: fd,
      headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent(fullName) },
    });
    if (!up.ok) console.error("Upload failed");
  }

  function exportProject() {
    const json = JSON.stringify(song, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "project.json";
    a.click();
  }

  function importProject(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        song = JSON.parse(reader.result as string);
        updateEngineSong();
      } catch {}
    };
    reader.readAsText(file);
  }

  let importProjectEl: HTMLInputElement | null = null;

  // ── Plugin system ─────────────────────────────────────────────────────
  type Plugin = {
    id: string;
    name: string;
    type: "instrument" | "effect" | "midi";
    code: string;
    enabled: boolean;
  };
  let plugins = $state<Plugin[]>([]);
  let selectedPluginId = $state<string | null>(null);

  function importPlugin(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const code = reader.result as string;
      const name = file.name.replace(/\.\w+$/, "");
      const typeMatch = code.match(/@type\s+(instrument|effect|midi)/i);
      plugins = [...plugins, {
        id: uid(),
        name,
        type: (typeMatch?.[1] as any) ?? "effect",
        code,
        enabled: true,
      }];
    };
    reader.readAsText(file);
  }

  async function savePluginToCloud(plugin: Plugin) {
    const fullName = saveFolder ? `${saveFolder}/plugins/${plugin.name}.js` : `plugins/${plugin.name}.js`;
    const blob = new Blob([plugin.code], { type: "text/javascript" });
    const fd = new FormData();
    fd.append("file", blob, fullName);
    const up = await fetch("/api/telegram/uploadFile", {
      method: "POST",
      body: fd,
      headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent(fullName) },
    });
    if (!up.ok) console.error("Plugin upload failed");
  }

  function removePlugin(id: string) {
    plugins = plugins.filter(p => p.id !== id);
    if (selectedPluginId === id) selectedPluginId = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────
  let heldNotes = new Set<number>();

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) { toggleRecord(); }
    if (e.code === "Delete" || e.code === "Backspace") {
      if (selectedNoteId && selectedPattern) {
        deleteNote(selectedNoteId);
      }
    }

    const KEY_MAP: Record<string, number> = {
      "KeyA": 0, "KeyW": 1, "KeyS": 2, "KeyE": 3, "KeyD": 4,
      "KeyF": 5, "KeyT": 6, "KeyG": 7, "KeyY": 8, "KeyH": 9,
      "KeyU": 10, "KeyJ": 11, "KeyK": 12,
    };

    const offset = KEY_MAP[e.code];
    if (offset !== undefined && !e.repeat) {
      const note = (START_OCTAVE + 4) * 12 + offset;
      if (!heldNotes.has(note)) {
        heldNotes.add(note);
        if (!audioReady) initAudio();
        engine.playNote(note, 0.7, 0.5);
        if (recording && selectedPattern) {
          addNote(currentBeat - selectedPattern.startBeat, note, 0.7, gridSize);
        }
      }
    }
  }

  function onKeyup(e: KeyboardEvent) {
    const KEY_MAP: Record<string, number> = {
      "KeyA": 0, "KeyW": 1, "KeyS": 2, "KeyE": 3, "KeyD": 4,
      "KeyF": 5, "KeyT": 6, "KeyG": 7, "KeyY": 8, "KeyH": 9,
      "KeyU": 10, "KeyJ": 11, "KeyK": 12,
    };
    const offset = KEY_MAP[e.code];
    if (offset !== undefined) {
      const note = (START_OCTAVE + 4) * 12 + offset;
      heldNotes.delete(note);
    }
  }

  function formatTime(beat: number, bpm: number): string {
    const secs = beat / (bpm / 60);
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("keyup", onKeyup);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("keyup", onKeyup);
    engine.destroy();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="me-root">
  <!-- ═══ TOP BAR ═══ -->
  <div class="me-topbar">
    <span class="me-logo">Music Editor</span>

    <!-- Transport -->
    <div class="me-transport">
      <button class="me-t-btn" onclick={() => setBeat(0)}><IconPlayerSkipBack size={14}/></button>
      <button class="me-t-btn me-play-btn" class:active={isPlaying} onclick={togglePlay}>
        {#if isPlaying}<IconPlayerPause size={16}/>{:else}<IconPlayerPlay size={16}/>{/if}
      </button>
      <button class="me-t-btn" onclick={stop}><IconPlayerStop size={14}/></button>
      <button class="me-t-btn" class:recording={recording} onclick={toggleRecord}>
        <IconMicrophone size={14}/>
      </button>
      <button class="me-t-btn" class:active={metronomeOn} onclick={() => metronomeOn = !metronomeOn}>
        <IconMetronome size={14}/>
      </button>
    </div>

    <div class="me-bpm-ctrl">
      <span class="me-bpm-label">BPM</span>
      <input type="number" min="20" max="300" bind:value={song.bpm} class="me-bpm-input" onchange={updateEngineSong}/>
    </div>

    <div class="me-time-display">
      {formatTime(currentBeat, song.bpm)}
    </div>

    <div class="me-transport-spacer"></div>

    <!-- View tabs -->
    <div class="me-view-tabs">
      <button class="me-vtab" class:active={view === "timeline"} onclick={() => view = "timeline"}><IconMusic size={14}/> Timeline</button>
      <button class="me-vtab" class:active={view === "pianoroll"} onclick={() => view = "pianoroll"}><IconPiano size={14}/> Piano Roll</button>
      <button class="me-vtab" class:active={view === "mixer"} onclick={() => view = "mixer"}><IconMixer size={14}/> Mixer</button>
      <button class="me-vtab" class:active={view === "plugins"} onclick={() => view = "plugins"}><IconPlug size={14}/> Plugins</button>
    </div>

    <div class="me-transport-spacer"></div>

    <button class="me-tb-btn" onclick={importAudio}><IconUpload size={12}/> Audio</button>
    <button class="me-tb-btn" onclick={() => importProjectEl?.click()}><IconUpload size={12}/> Project</button>
    <button class="me-tb-btn" onclick={exportProject}><IconDownload size={12}/> JSON</button>
    <button class="me-tb-btn" onclick={exportWav} disabled={exporting}>
      {#if exporting}{exportProgress}%{:else}<IconDownload size={12}/> WAV{/if}
    </button>
    <button class="me-tb-btn primary" onclick={saveToCloud}><IconCloudUpload size={12}/> Save</button>
  </div>

  <div class="me-main">
    <!-- ═══ LEFT: TRACKS / PATTERNS ═══ -->
    <div class="me-sidebar">
      <div class="me-sidebar-section">
        <div class="me-sidebar-header">
          <span>Tracks</span>
          <button class="me-small-btn" onclick={() => addTrack("synth")} title="Add synth">+</button>
          <button class="me-small-btn" onclick={() => addTrack("drums")} title="Add drums">🥁</button>
        </div>
        {#each song.tracks as track, ti (track.id)}
          <div class="me-track-item" class:selected={selectedTrackIdx === ti} onclick={() => selectedTrackIdx = ti}>
            <div class="me-track-color" style="background:{track.color}"></div>
            <span class="me-track-name">{track.name}</span>
            <button class="me-track-del" onclick={(e) => { e.stopPropagation(); removeTrack(ti); }}>×</button>
          </div>
        {/each}
      </div>

      <div class="me-sidebar-section">
        <div class="me-sidebar-header">
          <span>Patterns</span>
          <button class="me-small-btn" onclick={addPattern}>+</button>
        </div>
        {#each song.patterns as pat (pat.id)}
          <div class="me-pattern-item" class:selected={selectedPatternId === pat.id} onclick={() => selectedPatternId = pat.id}>
            <span class="me-pat-name">{pat.name}</span>
            <span class="me-pat-info">{pat.notes.length}n · {pat.lengthBeats}b</span>
            <button class="me-pat-dup" onclick={(e) => { e.stopPropagation(); duplicatePattern(pat.id); }} title="Duplicate">⧉</button>
            <button class="me-track-del" onclick={(e) => { e.stopPropagation(); deletePattern(pat.id); }}>×</button>
          </div>
        {/each}
      </div>

      <div class="me-sidebar-section">
        <div class="me-sidebar-header"><span>Grid</span></div>
        <label class="me-check"><input type="checkbox" bind:checked={snapToGrid}/> Snap</label>
        <label class="me-check">Size
          <select bind:value={gridSize}>
            <option value={1}>1/1</option>
            <option value={0.5}>1/2</option>
            <option value={0.25}>1/4</option>
            <option value={0.125}>1/8</option>
            <option value={0.0625}>1/16</option>
          </select>
        </label>
      </div>
    </div>

    <!-- ═══ CENTER: MAIN VIEW ═══ -->
    <div class="me-center">
      {#if view === "timeline"}
        <!-- Timeline view -->
        <div class="me-timeline">
          <div class="me-tl-ruler">
            {#each Array(song.songLengthBars + 1) as _, i}
              <div class="me-tl-tick" style="left:{i * BEATS_PER_BAR * PIXELS_PER_BEAT * zoom - scrollX}px">
                <span class="me-tl-label">{i}</span>
              </div>
            {/each}
            <div class="me-tl-playhead" style="left:{currentBeat * PIXELS_PER_BEAT * zoom - scrollX}px"></div>
          </div>

          <div class="me-tl-tracks">
            {#each song.tracks as track, ti (track.id)}
              <div class="me-tl-track-row">
                <div class="me-tl-track-label" style="border-left:3px solid {track.color}">
                  {track.name}
                </div>
                <div class="me-tl-track-clips">
                  {#each track.patterns as patId}
                    {@const pat = song.patterns.find(p => p.id === patId)}
                    {#if pat}
                      {#each Array(song.songLengthBars) as _, bar}
                        <div class="me-tl-clip" style="left:{bar * BEATS_PER_BAR * PIXELS_PER_BEAT * zoom}px;width:{pat.lengthBeats * PIXELS_PER_BEAT * zoom}px;background:{track.color}22;border-color:{track.color}44;" onclick={() => { selectedPatternId = patId; selectedTrackIdx = ti; view = "pianoroll"; }}>
                          <span>{pat.name}</span>
                        </div>
                      {/each}
                    {/if}
                  {/each}
                  <div class="me-tl-playhead-track" style="left:{currentBeat * PIXELS_PER_BEAT * zoom - scrollX}px"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else if view === "pianoroll" && selectedPattern}
        <!-- Piano Roll -->
        <div class="me-pr-wrap">
          <div class="me-pr-piano">
            {#each Array(TOTAL_NOTES) as _, i}
              {@const noteNum = MAX_NOTE - i}
              {@const isBlack = [1, 3, 6, 8, 10].includes(noteNum % 12)}
              <div class="me-pr-key" class:black={isBlack} class:held={heldNotes.has(noteNum)}
                onmousedown={() => { if (!audioReady) initAudio(); engine.playNote(noteNum, 0.7, 0.5); if (recording) addNote(currentBeat, noteNum, 0.7, gridSize); }}
                onmouseup={() => {}}>
                <span>{noteName(noteNum)}</span>
              </div>
            {/each}
          </div>

          <div class="me-pr-grid"
            onmousedown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const beat = (e.clientX - rect.left + scrollX) / PIXELS_PER_BEAT / zoom;
              const noteIdx = Math.floor((e.clientY - rect.top) / NOTE_HEIGHT);
              const noteNum = MAX_NOTE - noteIdx;
              addNote(beat, noteNum, 0.7, gridSize);
            }}>
            <!-- Grid lines -->
            {#each Array(selectedPattern.lengthBeats * 4 + 1) as _, i}
              {@const beat = i / 4}
              {@const isBar = beat % BEATS_PER_BAR === 0}
              <div class="me-pr-gridline" class:bar={isBar} style="left:{beat * PIXELS_PER_BEAT * zoom}px"></div>
            {/each}

            <!-- Notes -->
            {#each selectedPattern.notes as note (note.id)}
              {@const x = note.startBeat * PIXELS_PER_BEAT * zoom}
              {@const y = (MAX_NOTE - note.note) * NOTE_HEIGHT}
              {@const w = note.durationBeats * PIXELS_PER_BEAT * zoom}
              <div
                class="me-pr-note"
                class:selected={selectedNoteId === note.id}
                style="left:{x}px;top:{y}px;width:{w}px;height:{NOTE_HEIGHT - 1}px;opacity:{note.velocity}"
                onmousedown={(e) => { e.stopPropagation(); selectedNoteId = note.id; }}
              >
                <span class="me-pr-note-label">{noteName(note.note)}</span>
                <div class="me-pr-note-resize" onmousedown={(e) => {
                  e.stopPropagation();
                  const startX = e.clientX;
                  const origDur = note.durationBeats;
                  const onMove = (me: MouseEvent) => {
                    const dx = me.clientX - startX;
                    const newDur = Math.max(gridSize, origDur + dx / PIXELS_PER_BEAT / zoom);
                    resizeNote(note.id, newDur);
                  };
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}></div>
              </div>
            {/each}

            <!-- Playhead -->
            <div class="me-pr-playhead" style="left:{currentBeat * PIXELS_PER_BEAT * zoom}px"></div>
          </div>
        </div>

      {:else if view === "mixer"}
        <!-- Mixer -->
        <div class="me-mixer">
          {#each song.mixerChannels as ch, i (ch.id)}
            <div class="me-mix-channel" class:muted={ch.muted} class:solo={ch.solo}>
              <div class="me-mix-name">{ch.name}</div>
              <div class="me-mix-fader-wrap">
                <input type="range" min="0" max="1" step="0.01" bind:value={ch.volume} class="me-mix-fader" orient="vertical"/>
                <span class="me-mix-vol">{Math.round(ch.volume * 100)}%</span>
              </div>
              <input type="range" min="-1" max="1" step="0.01" bind:value={ch.pan} class="me-mix-pan" title="Pan"/>
              <div class="me-mix-btns">
                <button class="me-mix-btn" class:active={ch.muted} onclick={() => toggleMute(i)}>M</button>
                <button class="me-mix-btn" class:active={ch.solo} onclick={() => toggleSolo(i)}>S</button>
              </div>
              <div class="me-mix-effects">
                {#each ch.effects as eff (eff.id)}
                  <div class="me-mix-eff">
                    <span class="me-mix-eff-name">{eff.type}</span>
                    <button class="me-mix-eff-del" onclick={() => removeEffect(i, eff.id)}>×</button>
                  </div>
                {/each}
                <div class="me-mix-add-eff">
                  {#each ["reverb", "delay", "eq", "compressor", "distortion", "filter"] as effType}
                    <button class="me-mix-add-eff-btn" onclick={() => addEffect(i, effType as EffectType)} title={effType}>+</button>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>

      {:else if view === "plugins"}
        <!-- Plugin Manager -->
        <div class="me-plugins">
          <div class="me-plugins-header">
            <h3>Plugins & Extensions</h3>
            <button class="me-small-btn" onclick={() => pluginFileInputEl?.click()}>Import Plugin</button>
          </div>
          <div class="me-plugins-info">
            Drop .js plugin files or click Import. Plugins use the Web Audio API AudioWorklet format.
            <br/>Tag your plugin file with <code>@type instrument|effect|midi</code> at the top.
          </div>
          {#if plugins.length === 0}
            <div class="me-plugins-empty">No plugins imported yet</div>
          {/if}
          {#each plugins as plugin (plugin.id)}
            <div class="me-plugin-item">
              <div class="me-plugin-info">
                <span class="me-plugin-name">{plugin.name}</span>
                <span class="me-plugin-type">{plugin.type}</span>
              </div>
              <div class="me-plugin-actions">
                <button class="me-plugin-btn" onclick={() => savePluginToCloud(plugin)}>☁ Save</button>
                <button class="me-plugin-btn danger" onclick={() => removePlugin(plugin.id)}>×</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Status bar -->
  <div class="me-statusbar">
    <span>BPM: {song.bpm}</span>
    <span class="me-sb-sep"></span>
    <span>Bar: {currentBar + 1}/{song.songLengthBars}</span>
    <span class="me-sb-sep"></span>
    <span>Beat: {currentBeatInBar.toFixed(1)}/{BEATS_PER_BAR}</span>
    <span class="me-sb-sep"></span>
    <span>Tracks: {song.tracks.length}</span>
    <span class="me-sb-sep"></span>
    <span>Patterns: {song.patterns.length}</span>
    {#if isPlaying}
      <span class="me-sb-sep"></span>
      <span class="me-sb-live">● LIVE</span>
    {/if}
    {#if recording}
      <span class="me-sb-sep"></span>
      <span class="me-sb-rec">● REC</span>
    {/if}
  </div>
</div>

<!-- Hidden file inputs -->
<input bind:this={fileInputEl} type="file" accept="audio/*" style="display:none" onchange={handleAudioFile}/>
<input bind:this={pluginFileInputEl} type="file" accept=".js,.ts,.mjs" style="display:none" onchange={importPlugin}/>
<input bind:this={importProjectEl} type="file" accept=".json" style="display:none" onchange={importProject}/>

<!-- Save dialog -->
{#if showSaveDialog}
  <div class="me-overlay" onclick={() => showSaveDialog = false}>
    <div class="me-dialog" onclick={(e) => e.stopPropagation()}>
      <div class="me-dialog-title">Save to Cloud</div>
      <div class="me-dialog-row"><label>Folder</label><input type="text" bind:value={saveFolder} placeholder="(root)"/></div>
      <div class="me-dialog-row"><label>Name</label><input type="text" bind:value={saveFileName}/></div>
      <div class="me-dialog-actions">
        <button class="me-dialog-btn" onclick={() => showSaveDialog = false}>Cancel</button>
        <button class="me-dialog-btn primary" onclick={confirmSave}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .me-root { display: flex; flex-direction: column; height: 100%; background: #0c0c10; color: #ccc; font-family: 'Inter', 'Segoe UI', sans-serif; overflow: hidden; }

  /* ── Top Bar ── */
  .me-topbar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: #141418; border-bottom: 1px solid #222; flex-shrink: 0; min-height: 34px; }
  .me-logo { font-size: 12px; font-weight: 800; color: #a78bfa; letter-spacing: .04em; margin-right: 8px; }
  .me-transport { display: flex; align-items: center; gap: 2px; }
  .me-t-btn { width: 26px; height: 26px; border-radius: 4px; border: none; background: none; color: #666; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .1s; }
  .me-t-btn:hover { background: #222; color: #ccc; }
  .me-t-btn.me-play-btn { color: #a78bfa; }
  .me-t-btn.me-play-btn.active { color: #22c55e; }
  .me-t-btn.recording { color: #ef4444; animation: pulse 1s infinite; }
  .me-t-btn.active { color: #a78bfa; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

  .me-bpm-ctrl { display: flex; align-items: center; gap: 3px; margin-left: 8px; }
  .me-bpm-label { font-size: 9px; font-weight: 700; color: #555; text-transform: uppercase; }
  .me-bpm-input { width: 42px; background: #0c0c10; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; color: #aaa; font-size: 11px; font-family: 'Geist Mono', monospace; text-align: center; outline: none; }
  .me-bpm-input:focus { border-color: #a78bfa; }

  .me-time-display { font-size: 12px; font-family: 'Geist Mono', monospace; color: #a78bfa; min-width: 80px; text-align: center; margin-left: 8px; }

  .me-transport-spacer { flex: 1; }
  .me-view-tabs { display: flex; gap: 2px; }
  .me-vtab { display: flex; align-items: center; gap: 3px; padding: 4px 8px; border-radius: 4px; border: 1px solid transparent; background: none; color: #666; font-size: 10px; font-weight: 600; cursor: pointer; transition: .1s; }
  .me-vtab:hover { color: #aaa; background: #1a1a1e; }
  .me-vtab.active { color: #fff; background: #a78bfa22; border-color: #a78bfa44; }

  .me-tb-btn { display: flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 3px; border: 1px solid #2a2a2e; background: #141418; color: #666; font-size: 10px; cursor: pointer; transition: .1s; }
  .me-tb-btn:hover { border-color: #a78bfa; color: #ccc; }
  .me-tb-btn.primary { background: #a78bfa; border-color: #a78bfa; color: #fff; font-weight: 600; }
  .me-tb-btn.primary:hover { opacity: .85; }
  .me-tb-btn:disabled { opacity: .4; cursor: not-allowed; }

  /* ── Main ── */
  .me-main { display: flex; flex: 1; overflow: hidden; }

  /* ── Sidebar ── */
  .me-sidebar { width: 180px; background: #111115; border-right: 1px solid #222; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; }
  .me-sidebar-section { border-bottom: 1px solid #1a1a1e; }
  .me-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: .06em; }
  .me-small-btn { width: 18px; height: 18px; border-radius: 3px; border: 1px solid #333; background: #1a1a1e; color: #666; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .me-small-btn:hover { border-color: #a78bfa; color: #fff; }

  .me-track-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; transition: .1s; }
  .me-track-item:hover { background: #1a1a1e; }
  .me-track-item.selected { background: #a78bfa11; }
  .me-track-color { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .me-track-name { flex: 1; font-size: 10px; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .me-track-del { background: none; border: none; color: #444; cursor: pointer; font-size: 12px; padding: 0 2px; }
  .me-track-del:hover { color: #ef4444; }

  .me-pattern-item { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; transition: .1s; }
  .me-pattern-item:hover { background: #1a1a1e; }
  .me-pattern-item.selected { background: #a78bfa11; }
  .me-pat-name { font-size: 10px; color: #aaa; flex: 1; }
  .me-pat-info { font-size: 8px; color: #444; font-family: 'Geist Mono', monospace; }
  .me-pat-dup { background: none; border: none; color: #444; cursor: pointer; font-size: 10px; padding: 0 2px; }
  .me-pat-dup:hover { color: #a78bfa; }

  .me-check { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #666; padding: 3px 8px; cursor: pointer; }
  .me-check input, .me-check select { accent-color: #a78bfa; background: #0c0c10; border: 1px solid #333; border-radius: 3px; color: #aaa; font-size: 10px; padding: 1px 3px; }

  /* ── Center ── */
  .me-center { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  /* Timeline */
  .me-timeline { flex: 1; overflow: auto; }
  .me-tl-ruler { position: relative; height: 24px; background: #141418; border-bottom: 1px solid #222; min-width: 100%; }
  .me-tl-tick { position: absolute; top: 0; height: 100%; border-left: 1px solid #222; }
  .me-tl-label { font-size: 8px; color: #555; font-family: 'Geist Mono', monospace; padding-left: 3px; }
  .me-tl-playhead { position: absolute; top: 0; width: 2px; height: 100%; background: #ef4444; z-index: 5; pointer-events: none; }

  .me-tl-tracks { position: relative; }
  .me-tl-track-row { display: flex; height: 48px; border-bottom: 1px solid #1a1a1e; }
  .me-tl-track-label { width: 100px; padding: 0 8px; font-size: 10px; color: #888; background: #111115; border-right: 1px solid #222; display: flex; align-items: center; flex-shrink: 0; }
  .me-tl-track-clips { flex: 1; position: relative; }
  .me-tl-clip { position: absolute; top: 4px; height: 40px; border-radius: 3px; border: 1px solid; cursor: pointer; display: flex; align-items: center; padding: 0 6px; font-size: 9px; color: rgba(255,255,255,.6); }
  .me-tl-clip:hover { opacity: .8; }
  .me-tl-playhead-track { position: absolute; top: 0; width: 2px; height: 100%; background: #ef4444; z-index: 4; pointer-events: none; }

  /* Piano Roll */
  .me-pr-wrap { flex: 1; display: flex; overflow: hidden; }
  .me-pr-piano { width: 60px; flex-shrink: 0; overflow-y: auto; background: #111115; border-right: 1px solid #222; }
  .me-pr-key { height: 14px; display: flex; align-items: center; padding-left: 4px; font-size: 7px; color: #555; cursor: pointer; border-bottom: 1px solid #1a1a1e; }
  .me-pr-key.black { background: #0a0a0e; color: #444; }
  .me-pr-key:hover { background: #a78bfa22; }
  .me-pr-key.held { background: #a78bfa44; color: #fff; }

  .me-pr-grid { flex: 1; position: relative; overflow: auto; background: #0c0c10; cursor: crosshair; }
  .me-pr-gridline { position: absolute; top: 0; height: 100%; width: 1px; background: #1a1a1e; pointer-events: none; }
  .me-pr-gridline.bar { background: #2a2a2e; }

  .me-pr-note { position: absolute; background: #a78bfa; border-radius: 2px; cursor: pointer; display: flex; align-items: center; overflow: hidden; transition: box-shadow .05s; }
  .me-pr-note:hover { box-shadow: 0 0 0 1px rgba(255,255,255,.3); }
  .me-pr-note.selected { box-shadow: 0 0 0 2px #fff; }
  .me-pr-note-label { font-size: 7px; color: rgba(255,255,255,.7); padding-left: 3px; pointer-events: none; white-space: nowrap; }
  .me-pr-note-resize { position: absolute; right: 0; top: 0; width: 6px; height: 100%; cursor: ew-resize; }

  .me-pr-playhead { position: absolute; top: 0; width: 2px; height: 100%; background: #ef4444; z-index: 10; pointer-events: none; }

  /* Mixer */
  .me-mixer { flex: 1; display: flex; gap: 2px; padding: 8px; overflow-x: auto; align-items: flex-end; }
  .me-mix-channel { width: 80px; background: #141418; border: 1px solid #222; border-radius: 4px; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
  .me-mix-channel.muted { opacity: .4; }
  .me-mix-channel.solo { border-color: #a78bfa; }
  .me-mix-name { font-size: 9px; color: #888; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
  .me-mix-fader-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .me-mix-fader { writing-mode: vertical-lr; direction: rtl; width: 20px; height: 120px; accent-color: #a78bfa; }
  .me-mix-vol { font-size: 8px; color: #555; font-family: 'Geist Mono', monospace; }
  .me-mix-pan { width: 60px; height: 3px; accent-color: #a78bfa; }
  .me-mix-btns { display: flex; gap: 2px; }
  .me-mix-btn { width: 20px; height: 16px; border-radius: 2px; border: 1px solid #333; background: none; color: #555; font-size: 8px; font-weight: 700; cursor: pointer; }
  .me-mix-btn.active { background: #a78bfa; border-color: #a78bfa; color: #fff; }
  .me-mix-effects { width: 100%; margin-top: 4px; }
  .me-mix-eff { display: flex; align-items: center; justify-content: space-between; padding: 1px 3px; font-size: 7px; color: #666; background: #0c0c10; border-radius: 2px; margin-bottom: 1px; }
  .me-mix-eff-del { background: none; border: none; color: #444; cursor: pointer; font-size: 8px; }
  .me-mix-eff-del:hover { color: #ef4444; }
  .me-mix-add-eff { display: flex; flex-wrap: wrap; gap: 1px; margin-top: 2px; }
  .me-mix-add-eff-btn { width: 14px; height: 14px; border-radius: 2px; border: 1px solid #2a2a2e; background: none; color: #444; font-size: 8px; cursor: pointer; }
  .me-mix-add-eff-btn:hover { border-color: #a78bfa; color: #a78bfa; }

  /* Plugins */
  .me-plugins { flex: 1; padding: 16px; overflow-y: auto; }
  .me-plugins-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .me-plugins-header h3 { font-size: 14px; font-weight: 700; color: #fff; margin: 0; }
  .me-plugins-info { font-size: 11px; color: #555; margin-bottom: 12px; line-height: 1.5; }
  .me-plugins-info code { background: #1a1a1e; padding: 1px 4px; border-radius: 2px; color: #a78bfa; font-size: 10px; }
  .me-plugins-empty { padding: 20px; text-align: center; color: #333; font-size: 11px; }
  .me-plugin-item { display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #141418; border: 1px solid #222; border-radius: 4px; margin-bottom: 4px; }
  .me-plugin-info { display: flex; flex-direction: column; gap: 2px; }
  .me-plugin-name { font-size: 12px; color: #ccc; font-weight: 600; }
  .me-plugin-type { font-size: 9px; color: #555; text-transform: uppercase; }
  .me-plugin-actions { display: flex; gap: 4px; }
  .me-plugin-btn { padding: 3px 8px; border-radius: 3px; border: 1px solid #333; background: none; color: #888; font-size: 10px; cursor: pointer; }
  .me-plugin-btn:hover { border-color: #a78bfa; color: #fff; }
  .me-plugin-btn.danger { border-color: #3d1515; color: #f87171; }
  .me-plugin-btn.danger:hover { background: #1f0a0a; }

  /* Status bar */
  .me-statusbar { display: flex; align-items: center; gap: 5px; padding: 2px 10px; background: #141418; border-top: 1px solid #222; font-size: 9px; color: #444; font-family: 'Geist Mono', monospace; flex-shrink: 0; }
  .me-sb-sep { width: 1px; height: 8px; background: #2a2a2e; }
  .me-sb-live { color: #22c55e; }
  .me-sb-rec { color: #ef4444; animation: pulse 1s infinite; }

  /* Dialogs */
  .me-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  .me-dialog { background: #1a1a1e; border: 1px solid #333; border-radius: 6px; padding: 14px; min-width: 280px; }
  .me-dialog-title { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 10px; }
  .me-dialog-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .me-dialog-row label { font-size: 11px; color: #888; min-width: 50px; }
  .me-dialog-row input { flex: 1; background: #0c0c10; border: 1px solid #333; border-radius: 3px; padding: 4px 8px; color: #ccc; font-size: 11px; outline: none; }
  .me-dialog-row input:focus { border-color: #a78bfa; }
  .me-dialog-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
  .me-dialog-btn { padding: 5px 12px; border-radius: 3px; border: 1px solid #333; background: none; color: #888; font-size: 11px; cursor: pointer; }
  .me-dialog-btn:hover { border-color: #a78bfa; color: #fff; }
  .me-dialog-btn.primary { background: #a78bfa; border-color: #a78bfa; color: #fff; font-weight: 600; }

  .me-sidebar::-webkit-scrollbar,
  .me-pr-piano::-webkit-scrollbar,
  .me-pr-grid::-webkit-scrollbar { width: 4px; }
  .me-sidebar::-webkit-scrollbar-thumb,
  .me-pr-piano::-webkit-scrollbar-thumb,
  .me-pr-grid::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
</style>
