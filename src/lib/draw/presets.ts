import type { BrushPreset } from "./types";

export const BRUSH_PRESETS: BrushPreset[] = [
  // ── Basic ──────────────────────────────────────────────────
  {
    name: "Hard Round", icon: "●", category: "basic",
    size: 4, hardness: 100, opacity: 100, smoothing: 0.3, taper: 0,
    pressureSize: true, pressureOpacity: false, brushAngle: 0, spacing: 0, scatter: 0, minSize: 1,
  },
  {
    name: "Soft Round", icon: "◎", category: "basic",
    size: 20, hardness: 25, opacity: 80, smoothing: 0.5, taper: 0,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0, minSize: 2,
  },
  {
    name: "Soft Air", icon: "◌", category: "basic",
    size: 40, hardness: 5, opacity: 30, smoothing: 0.6, taper: 0,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0, minSize: 4,
  },

  // ── Paint ──────────────────────────────────────────────────
  {
    name: "Oil Paint", icon: "🖌", category: "paint",
    size: 12, hardness: 70, opacity: 90, smoothing: 0.4, taper: 0.2,
    pressureSize: true, pressureOpacity: true, brushAngle: -30, spacing: 0, scatter: 0, minSize: 2,
  },
  {
    name: "Watercolor", icon: "💧", category: "paint",
    size: 24, hardness: 20, opacity: 40, smoothing: 0.5, taper: 0.3,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0, minSize: 3,
  },
  {
    name: "Acrylic", icon: "🎨", category: "paint",
    size: 16, hardness: 80, opacity: 85, smoothing: 0.35, taper: 0.15,
    pressureSize: true, pressureOpacity: false, brushAngle: -45, spacing: 0, scatter: 0, minSize: 2,
  },

  // ── Ink ────────────────────────────────────────────────────
  {
    name: "Fine Liner", icon: "🖊", category: "ink",
    size: 2, hardness: 100, opacity: 100, smoothing: 0.6, taper: 0.5,
    pressureSize: true, pressureOpacity: false, brushAngle: 0, spacing: 0, scatter: 0, minSize: 0.5,
  },
  {
    name: "Inker", icon: "✒", category: "ink",
    size: 5, hardness: 100, opacity: 100, smoothing: 0.55, taper: 0.6,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0, minSize: 0.5,
  },
  {
    name: "Calligraphy", icon: "✎", category: "ink",
    size: 8, hardness: 90, opacity: 100, smoothing: 0.4, taper: 0.3,
    pressureSize: true, pressureOpacity: false, brushAngle: -45, spacing: 0, scatter: 0, minSize: 1,
  },
  {
    name: "Flat Pen", icon: "▬", category: "ink",
    size: 10, hardness: 100, opacity: 95, smoothing: 0.3, taper: 0.2,
    pressureSize: true, pressureOpacity: false, brushAngle: -60, spacing: 0, scatter: 0, minSize: 1,
  },

  // ── Sketch ─────────────────────────────────────────────────
  {
    name: "HB Pencil", icon: "✏", category: "sketch",
    size: 3, hardness: 60, opacity: 70, smoothing: 0.25, taper: 0.4,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0.3, minSize: 0.5,
  },
  {
    name: "2B Pencil", icon: "✎", category: "sketch",
    size: 5, hardness: 40, opacity: 80, smoothing: 0.2, taper: 0.3,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0.5, minSize: 1,
  },
  {
    name: "Charcoal", icon: "▓", category: "sketch",
    size: 20, hardness: 15, opacity: 50, smoothing: 0.3, taper: 0.2,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 1, minSize: 3,
  },
  {
    name: "Spray", icon: "⣿", category: "sketch",
    size: 30, hardness: 10, opacity: 40, smoothing: 0.3, taper: 0,
    pressureSize: false, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 2, minSize: 5,
  },

  // ── Special ────────────────────────────────────────────────
  {
    name: "Eraser Soft", icon: "◯", category: "special",
    size: 30, hardness: 20, opacity: 100, smoothing: 0.5, taper: 0,
    pressureSize: true, pressureOpacity: false, brushAngle: 0, spacing: 0, scatter: 0, minSize: 5,
  },
  {
    name: "Eraser Hard", icon: "○", category: "special",
    size: 10, hardness: 100, opacity: 100, smoothing: 0.3, taper: 0,
    pressureSize: true, pressureOpacity: false, brushAngle: 0, spacing: 0, scatter: 0, minSize: 1,
  },
  {
    name: "Mixer", icon: "≋", category: "special",
    size: 20, hardness: 30, opacity: 60, smoothing: 0.7, taper: 0,
    pressureSize: true, pressureOpacity: true, brushAngle: 0, spacing: 0, scatter: 0, minSize: 3,
  },
];
