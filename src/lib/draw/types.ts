export type Tool =
  | "move" | "select" | "pen" | "pencil" | "brush" | "eraser" | "chalk"
  | "line" | "rect" | "ellipse" | "arrow" | "triangle"
  | "eyedropper" | "fill" | "text";

export type Point = {
  x: number;
  y: number;
  pressure: number;
  time: number;
};

export type Stroke = {
  id: string;
  tool: Tool;
  color: string;
  baseWidth: number;
  opacity: number;
  fill: boolean;
  d?: string;
  points: Point[];
  pencilPaths?: string[];
  shapeType?: string;
  sx?: number;
  sy?: number;
  ex?: number;
  ey?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  layerId: string;
  variableWidthPath?: string;
  brushAngle?: number;
};

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: Stroke[];
  blendMode?: BlendMode;
};

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

export type BrushPreset = {
  name: string;
  icon: string;
  category: "basic" | "paint" | "ink" | "sketch" | "special";
  size: number;
  hardness: number;
  opacity: number;
  smoothing: number;
  taper: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  brushAngle: number;
  spacing: number;
  scatter: number;
  minSize: number;
};

export type HistoryEntry = {
  action: "stroke" | "clear" | "layer-add" | "layer-remove" | "layer-opacity";
  layerId: string;
  strokes: Stroke[];
  prevLayerOpacity?: number;
};

export type CanvasSettings = {
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  showRulers: boolean;
  checkerBg: boolean;
  canvasRotation: number;
};
