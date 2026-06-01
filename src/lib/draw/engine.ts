import type { Point, Stroke, BrushPreset } from "./types";

// ── Stabilizer (exponential weighted moving average) ───────────
export class Stabilizer {
  private buffer: Point[] = [];
  private maxSamples: number;
  private smoothing: number;

  constructor(maxSamples = 16, smoothing = 0.5) {
    this.maxSamples = maxSamples;
    this.smoothing = smoothing;
  }

  reset() { this.buffer = []; }

  add(pt: Point): Point {
    if (this.smoothing <= 0.01) return pt;

    this.buffer.push(pt);
    const maxBuf = Math.max(4, Math.round(this.maxSamples * this.smoothing));
    while (this.buffer.length > maxBuf) this.buffer.shift();
    if (this.buffer.length <= 2) return pt;

    // Exponential weighting: recent points get much more weight
    let wx = 0, wy = 0, wp = 0, totalW = 0;
    const len = this.buffer.length;
    for (let i = 0; i < len; i++) {
      // Exponential: weight = 2^(i/2) — last point gets ~4x the weight of first
      const weight = Math.pow(2, (i - len + 1) / 2);
      wx += this.buffer[i].x * weight;
      wy += this.buffer[i].y * weight;
      wp += this.buffer[i].pressure * weight;
      totalW += weight;
    }
    return {
      x: wx / totalW,
      y: wy / totalW,
      pressure: wp / totalW,
      time: pt.time,
    };
  }
}

// ── Minimum distance filter (skip micro-jitter) ───────────────
export function minDistFilter(pts: Point[], minDist = 1.0): Point[] {
  if (pts.length <= 2) return pts;
  const result: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const dx = pts[i].x - prev.x;
    const dy = pts[i].y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= minDist) {
      result.push(pts[i]);
    }
  }
  // Always include last point
  const last = pts[pts.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

// ── Pressure curve (adjust sensitivity) ──────────────────────
export function applyPressureCurve(pressure: number, curve: number = 1): number {
  return Math.pow(Math.max(0, Math.min(1, pressure)), curve);
}

// ── Taper factor (0 = no taper, 1 = full taper) ──────────────
export function taperFactor(index: number, total: number, taperAmount: number): number {
  if (taperAmount <= 0 || total < 4) return 1;
  const headLen = Math.min(total * 0.2, 25);
  const tailLen = Math.min(total * 0.2, 25);
  if (index < headLen) {
    const t = index / headLen;
    // Smooth ease-in curve (cubic)
    const eased = t * t * (3 - 2 * t);
    return 0.15 + 0.85 * eased * taperAmount + (1 - taperAmount);
  }
  if (index > total - tailLen) {
    const t = (total - index) / tailLen;
    const eased = t * t * (3 - 2 * t);
    return 0.15 + 0.85 * eased * taperAmount + (1 - taperAmount);
  }
  return 1;
}

// ── True Catmull-Rom spline ──────────────────────────────────
// Uses 4 control points for smooth tangent computation
export function smoothPath(pts: Point[], tension = 0.5): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  const alpha = 0.5; // Catmull-Rom uniform parameterization
  const t = tension;

  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Compute tangent vectors at p1 and p2 using Catmull-Rom
    let t1x = (p2.x - p0.x) * alpha * t;
    let t1y = (p2.y - p0.y) * alpha * t;
    let t2x = (p3.x - p1.x) * alpha * t;
    let t2y = (p3.y - p1.y) * alpha * t;

    // For the first segment, use a simpler tangent to avoid overshoot
    if (i === 0) {
      t1x = (p2.x - p1.x) * 0.3;
      t1y = (p2.y - p1.y) * 0.3;
    }
    // For the last segment, same
    if (i === pts.length - 2) {
      t2x = (p2.x - p1.x) * 0.3;
      t2y = (p2.y - p1.y) * 0.3;
    }

    // Convert to cubic bezier control points (Hermite → Bezier)
    const cp1x = p1.x + t1x / 3;
    const cp1y = p1.y + t1y / 3;
    const cp2x = p2.x - t2x / 3;
    const cp2y = p2.y - t2y / 3;

    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  return d;
}

// ── Chaikin corner-cutting subdivider ────────────────────────
// Great for smoothing jagged polygonal chains
export function chaikinSmooth(pts: Point[], iterations = 2): Point[] {
  let result = pts;
  for (let iter = 0; iter < iterations; iter++) {
    if (result.length < 3) break;
    const next: Point[] = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      const q: Point = {
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25,
        pressure: p0.pressure * 0.75 + p1.pressure * 0.25,
        time: p0.time,
      };
      const r: Point = {
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75,
        pressure: p0.pressure * 0.25 + p1.pressure * 0.75,
        time: p1.time,
      };
      next.push(q, r);
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

// ── Variable-width stroke (rendered as filled shape) ──────────
export function variableWidthPath(
  pts: Point[],
  baseWidth: number,
  preset: BrushPreset,
): string {
  if (pts.length < 2) return "";

  // Pre-filter and smooth the points
  const filtered = minDistFilter(pts, 1.5);
  const smoothed = chaikinSmooth(filtered, 1);

  const leftPoints: [number, number][] = [];
  const rightPoints: [number, number][] = [];

  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    const pressure = applyPressureCurve(p.pressure);
    const taper = taperFactor(i, smoothed.length, preset.taper);
    let width = baseWidth;

    if (preset.pressureSize) {
      width = preset.minSize + (baseWidth - preset.minSize) * pressure;
    }
    width *= taper;
    if (width < 0.2) width = 0.2;

    // Calculate normal direction (use local neighborhood for smoother normals)
    let nx: number, ny: number;
    const lookback = 3;
    const lookforward = 3;
    const i0 = Math.max(0, i - lookback);
    const i1 = Math.min(smoothed.length - 1, i + lookforward);
    const dx = smoothed[i1].x - smoothed[i0].x;
    const dy = smoothed[i1].y - smoothed[i0].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    nx = -dy / len;
    ny = dx / len;

    // Brush angle rotation
    if (preset.brushAngle !== 0) {
      const angle = (preset.brushAngle * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rx = nx * cos - ny * sin;
      const ry = nx * sin + ny * cos;
      nx = rx;
      ny = ry;
    }

    const halfW = width / 2;
    leftPoints.push([p.x + nx * halfW, p.y + ny * halfW]);
    rightPoints.push([p.x - nx * halfW, p.y - ny * halfW]);
  }

  // Build filled path using smooth curves instead of sharp lines
  let d = `M${leftPoints[0][0].toFixed(2)},${leftPoints[0][1].toFixed(2)}`;

  // Left side (forward)
  for (let i = 1; i < leftPoints.length - 1; i++) {
    const prev = leftPoints[i - 1];
    const curr = leftPoints[i];
    const next = leftPoints[i + 1];
    const cpx = curr[0];
    const cpy = curr[1];
    const ex = (curr[0] + next[0]) / 2;
    const ey = (curr[1] + next[1]) / 2;
    d += ` Q${cpx.toFixed(2)},${cpy.toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }
  const lastL = leftPoints[leftPoints.length - 1];
  d += ` L${lastL[0].toFixed(2)},${lastL[1].toFixed(2)}`;

  // End cap (smooth arc)
  const lastR = rightPoints[rightPoints.length - 1];
  d += ` Q${lastL[0].toFixed(2)},${lastL[1].toFixed(2)} ${lastR[0].toFixed(2)},${lastR[1].toFixed(2)}`;

  // Right side (backward)
  for (let i = rightPoints.length - 2; i > 0; i--) {
    const prev = rightPoints[i + 1];
    const curr = rightPoints[i];
    const next = rightPoints[Math.max(0, i - 1)];
    const cpx = curr[0];
    const cpy = curr[1];
    const ex = (curr[0] + next[0]) / 2;
    const ey = (curr[1] + next[1]) / 2;
    d += ` Q${cpx.toFixed(2)},${cpy.toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }

  // Start cap
  const firstR = rightPoints[0];
  d += ` Q${firstR[0].toFixed(2)},${firstR[1].toFixed(2)} ${leftPoints[0][0].toFixed(2)},${leftPoints[0][1].toFixed(2)}`;
  d += "Z";
  return d;
}

// ── Pencil paths (multi-stroke texture) ──────────────────────
export function generatePencilPaths(pts: Point[], hardness: number, scatter: number): string[] {
  const filtered = minDistFilter(pts, 1.0);
  const count = Math.max(2, Math.round(hardness / 12));
  const sc = Math.max(0.4, (100 - hardness) / 18) * (1 + scatter);
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const offsetPts = filtered.map(p => ({
      x: p.x + (Math.random() - 0.5) * sc,
      y: p.y + (Math.random() - 0.5) * sc,
      pressure: p.pressure,
      time: p.time,
    }));
    paths.push(smoothPath(offsetPts));
  }
  return paths;
}

// ── Compute variable-width SVG path data for a stroke ────────
export function computeVariableWidthStroke(stroke: Stroke, preset: BrushPreset): string {
  if (stroke.points.length < 2) return "";
  return variableWidthPath(stroke.points, stroke.baseWidth, preset);
}

// ── Shape attributes ─────────────────────────────────────────
export function shapeAttrs(s: Stroke) {
  if (s.sx == null || s.sy == null || s.ex == null || s.ey == null) return {};
  const x = Math.min(s.sx, s.ex);
  const y = Math.min(s.sy, s.ey);
  const sw = Math.abs(s.ex - s.sx);
  const sh = Math.abs(s.ey - s.sy);

  switch (s.shapeType) {
    case "line":
      return { x1: s.sx, y1: s.sy, x2: s.ex, y2: s.ey };
    case "rect":
      return { x, y, width: sw, height: sh };
    case "ellipse":
      return { cx: (s.sx + s.ex) / 2, cy: (s.sy + s.ey) / 2, rx: sw / 2, ry: sh / 2 };
    case "arrow": {
      const angle = Math.atan2(s.ey - s.sy, s.ex - s.sx);
      const len = Math.sqrt(Math.abs(s.ex - s.sx) ** 2 + Math.abs(s.ey - s.sy) ** 2);
      const headLen = Math.min(len * 0.35, sw * 4);
      const headW = headLen * 0.65;
      const a = Math.PI / 2;
      // Filled arrowhead
      const hx = s.ex - headLen * Math.cos(angle);
      const hy = s.ey - headLen * Math.sin(angle);
      const lx = hx - headW * Math.cos(angle - a);
      const ly = hy - headW * Math.sin(angle - a);
      const rx = hx - headW * Math.cos(angle + a);
      const ry = hy - headW * Math.sin(angle + a);
      return {
        x1: s.sx, y1: s.sy, x2: hx, y2: hy,
        tipX: s.ex, tipY: s.ey,
        headX1: lx, headY1: ly, headX2: rx, headY2: ry,
        headLen, headW,
      };
    }
    case "triangle": {
      const topX = (s.sx + s.ex) / 2;
      const topY = Math.min(s.sy, s.ey);
      const botY = Math.max(s.sy, s.ey);
      return { points: `${topX},${topY} ${Math.min(s.sx, s.ex)},${botY} ${Math.max(s.sx, s.ex)},${botY}` };
    }
    default:
      return {};
  }
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function attr(obj: any, ...keys: string[]): string {
  return keys.map(k => `${k}="${obj[k] ?? ""}"`).join(" ");
}
