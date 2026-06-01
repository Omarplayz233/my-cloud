export type NoteEvent = {
  id: string;
  note: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
};

export type Pattern = {
  id: string;
  name: string;
  notes: NoteEvent[];
  lengthBeats: number;
};

export type TrackInstrument = "synth" | "sampler" | "drums" | "midi" | "audio";

export type TrackType = "pattern" | "audio";

export type AutomationPoint = {
  beat: number;
  value: number;
};

export type EffectType = "reverb" | "delay" | "eq" | "compressor" | "distortion" | "filter" | "chorus" | "limiter";

export type EffectNode = {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
};

export type MixerChannel = {
  id: string;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effects: EffectNode[];
};

export type Track = {
  id: string;
  name: string;
  instrument: TrackInstrument;
  type: TrackType;
  patterns: string[];
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  midiChannel: number;
  color: string;
};

export type SongState = {
  bpm: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  totalBeats: number;
  tracks: Track[];
  patterns: Pattern[];
  mixerChannels: MixerChannel[];
  songLengthBars: number;
};

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const MIN_NOTE = 21;
export const MAX_NOTE = 108;

export function noteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function noteName(note: number): string {
  const oct = Math.floor(note / 12) - 1;
  return NOTE_NAMES[note % 12] + oct;
}

export function freqToNote(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createDefaultSong(): SongState {
  const patternId = uid();
  return {
    bpm: 120,
    timeSignatureNum: 4,
    timeSignatureDen: 4,
    totalBeats: 64,
    tracks: [
      { id: uid(), name: "Synth 1", instrument: "synth", type: "pattern", patterns: [patternId], midiChannel: 0, color: "#6366f1" },
      { id: uid(), name: "Drums", instrument: "drums", type: "pattern", patterns: [], midiChannel: 9, color: "#10b981" },
      { id: uid(), name: "Bass", instrument: "synth", type: "pattern", patterns: [], midiChannel: 1, color: "#f59e0b" },
    ],
    patterns: [
      { id: patternId, name: "Pattern 1", notes: [], lengthBeats: 16 },
    ],
    mixerChannels: [
      { id: uid(), name: "Master", volume: 0.8, pan: 0, muted: false, solo: false, effects: [] },
      { id: uid(), name: "Synth 1", volume: 0.7, pan: 0, muted: false, solo: false, effects: [] },
      { id: uid(), name: "Drums", volume: 0.8, pan: 0, muted: false, solo: false, effects: [] },
      { id: uid(), name: "Bass", volume: 0.7, pan: 0, muted: false, solo: false, effects: [] },
    ],
    songLengthBars: 16,
  };
}
