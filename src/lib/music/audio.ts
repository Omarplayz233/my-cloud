import type { SongState, Track, Pattern, NoteEvent, MixerChannel, EffectNode } from "./engine";
import { noteToFreq, uid } from "./engine";

type SynthVoice = {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  note: number;
  startTime: number;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  masterCompressor: DynamicsCompressorNode | null = null;
  masterLimiter: DynamicsCompressorNode | null = null;

  private voices: Map<string, SynthVoice> = new Map();
  private sampleBuffers: Map<string, AudioBuffer> = new Map();
  private drumBuffers: Map<string, AudioBuffer> = new Map();
  private scheduledEvents: number[] = [];
  private analyser: AnalyserNode | null = null;
  private _isPlaying = false;
  private _currentBeat = 0;
  private _startCtxTime = 0;
  private _startBeat = 0;
  private animFrame = 0;
  private song: SongState | null = null;
  private onBeatChange: ((beat: number) => void) | null = null;
  private onEnd: (() => void) | null = null;

  get isPlaying() { return this._isPlaying; }
  get currentBeat() { return this._currentBeat; }

  get analyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  get timeDomainData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -12;
    this.masterCompressor.knee.value = 10;
    this.masterCompressor.ratio.value = 4;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.25;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -1;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.01;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    await this.loadDrumSamples();
  }

  private async loadDrumSamples() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const drums: Record<string, number[]> = {
      kick: [80, 0.5, 0.15],
      snare: [200, 0.3, 0.08],
      hihat: [800, 0.15, 0.03],
      openhat: [600, 0.2, 0.12],
      clap: [400, 0.25, 0.06],
      rim: [1200, 0.1, 0.02],
      tom: [150, 0.35, 0.1],
    };

    for (const [name, [freq, dur, attack]] of Object.entries(drums)) {
      const length = sampleRate * dur;
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = t < attack ? t / attack : Math.exp(-(t - attack) / (dur * 0.3));
        const noise = (Math.random() * 2 - 1) * 0.3;
        const tone = Math.sin(2 * Math.PI * freq * t * Math.exp(-t * 8));
        data[i] = (tone + noise) * env;
      }
      this.drumBuffers.set(name, buffer);
    }
  }

  setSong(song: SongState) {
    this.song = song;
  }

  onBeat(cb: (beat: number) => void) { this.onBeatChange = cb; }
  onSongEnd(cb: () => void) { this.onEnd = cb; }

  setMasterVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  playNote(note: number, velocity: number = 0.7, duration: number = 0.3, synthType: string = "sawtooth") {
    if (!this.ctx || !this.masterGain) return;
    const id = uid();
    const freq = noteToFreq(note);

    const osc = this.ctx.createOscillator();
    osc.type = synthType as OscillatorType;
    osc.frequency.value = freq;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * 4;
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(velocity * 0.3, this.ctx.currentTime + 0.01);
    gain.gain.setValueAtTime(velocity * 0.3, this.ctx.currentTime + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.01);

    this.voices.set(id, { osc, gain, filter, note, startTime: this.ctx.currentTime });
    osc.onended = () => {
      this.voices.delete(id);
      gain.disconnect();
      filter.disconnect();
    };
  }

  playDrum(name: string, velocity: number = 0.7) {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.drumBuffers.get(name);
    if (!buffer) {
      this.playNote(60 + Math.floor(Math.random() * 12), velocity, 0.1);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = velocity;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  stopAllNotes() {
    for (const [, voice] of this.voices) {
      try { voice.osc.stop(); } catch {}
    }
    this.voices.clear();
  }

  schedulePattern(pattern: Pattern, trackIdx: number, startBeat: number, bpm: number) {
    if (!this.ctx || !this.song) return;
    const beatsPerSec = bpm / 60;

    for (const note of pattern.notes) {
      const beatTime = startBeat + note.startBeat;
      const startTime = beatTime / beatsPerSec;
      const durTime = note.durationBeats / beatsPerSec;

      const track = this.song.tracks[trackIdx];
      const timeout = setTimeout(() => {
        if (!this._isPlaying) return;
        if (track.instrument === "drums") {
          this.playDrum(this.drumNameFromNote(note.note), note.velocity);
        } else {
          this.playNote(note.note, note.velocity, durTime, "sawtooth");
        }
      }, startTime * 1000);

      this.scheduledEvents.push(timeout);
    }
  }

  private drumNameFromNote(note: number): string {
    const drums = ["kick", "snare", "hihat", "openhat", "clap", "rim", "tom"];
    return drums[(note - 36) % drums.length] ?? "kick";
  }

  playSong(song: SongState, fromBeat: number = 0) {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    this.stopSong();
    this.song = song;
    this._isPlaying = true;
    this._startBeat = fromBeat;
    this._startCtxTime = this.ctx.currentTime;
    this._currentBeat = fromBeat;

    const beatsPerSec = song.bpm / 60;
    const totalDuration = song.totalBeats / beatsPerSec;

    for (let ti = 0; ti < song.tracks.length; ti++) {
      const track = song.tracks[ti];
      if (track.type !== "pattern") continue;
      for (const patId of track.patterns) {
        const pattern = song.patterns.find(p => p.id === patId);
        if (!pattern) continue;
        for (let bar = 0; bar < song.songLengthBars; bar++) {
          const startBeat = bar * song.timeSignatureNum;
          this.schedulePattern(pattern, ti, startBeat, song.bpm);
        }
      }
    }

    const tick = () => {
      if (!this._isPlaying || !this.ctx) return;
      const elapsed = this.ctx.currentTime - this._startCtxTime;
      this._currentBeat = this._startBeat + elapsed * beatsPerSec;

      if (this._currentBeat >= song.totalBeats) {
        this.stopSong();
        this.onEnd?.();
        return;
      }

      this.onBeatChange?.(this._currentBeat);
      this.animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stopSong() {
    this._isPlaying = false;
    cancelAnimationFrame(this.animFrame);
    for (const t of this.scheduledEvents) clearTimeout(t);
    this.scheduledEvents = [];
    this.stopAllNotes();
  }

  pauseSong() {
    this._isPlaying = false;
    cancelAnimationFrame(this.animFrame);
    for (const t of this.scheduledEvents) clearTimeout(t);
    this.scheduledEvents = [];
    this.stopAllNotes();
  }

  resumeSong(song: SongState) {
    if (!this.ctx) return;
    this.playSong(song, this._currentBeat);
  }

  beatToTime(beat: number, bpm: number): number {
    return beat / (bpm / 60);
  }

  timeToBeat(time: number, bpm: number): number {
    return time * (bpm / 60);
  }

  async renderOffline(song: SongState, progressCb?: (p: number) => void): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const duration = song.totalBeats / (song.bpm / 60);
    const totalSamples = Math.ceil(duration * sampleRate);
    const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

    const master = offline.createGain();
    master.gain.value = 0.8;
    master.connect(offline.destination);

    const beatsPerSec = song.bpm / 60;

    for (let ti = 0; ti < song.tracks.length; ti++) {
      const track = song.tracks[ti];
      if (track.type !== "pattern") continue;
      for (const patId of track.patterns) {
        const pattern = song.patterns.find(p => p.id === patId);
        if (!pattern) continue;
        for (let bar = 0; bar < song.songLengthBars; bar++) {
          for (const note of pattern.notes) {
            const beat = bar * song.timeSignatureNum + note.startBeat;
            const time = beat / beatsPerSec;
            const dur = note.durationBeats / beatsPerSec;

            const osc = offline.createOscillator();
            osc.type = track.instrument === "drums" ? "square" : "sawtooth";
            osc.frequency.value = noteToFreq(note.note);

            const gain = offline.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(note.velocity * 0.2, time + 0.01);
            gain.gain.setValueAtTime(note.velocity * 0.2, time + dur - 0.05);
            gain.gain.linearRampToValueAtTime(0, time + dur);

            osc.connect(gain);
            gain.connect(master);
            osc.start(time);
            osc.stop(time + dur + 0.01);
          }
        }
      }
    }

    progressCb?.(50);
    const rendered = await offline.startRendering();
    progressCb?.(100);
    return rendered;
  }

  destroy() {
    this.stopSong();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
