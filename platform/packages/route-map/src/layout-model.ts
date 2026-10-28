// What a placed route map is made of, and the options that size it. layout.ts
// fills it; paths.ts and the camera read it.
import type { Stage, Topic } from "./route-tree";

export const DEFAULTS = Object.freeze({
  labelWidth: 168,
  labelFontPx: 13,
  labelLineHeight: 18,
  labelLines: 2,
  labelGap: 8,
  rootWidth: 360,
  rootHeight: 76,
  rootGap: 56,
  moduleDiameter: 56,
  stepDiameter: 44,
  reinforcementDiameter: 32,
  cellGap: 24,
  rowGap: 40,
  gutter: 32,
  moduleGap: 72,
  fanGutter: 24,
  fanGap: 16,
  fanRowGap: 20,
  rowSize: 4,
  fanRowSize: 3,
  // WP-37b. Each default reproduces WP-37's picture byte for byte (pinned by digest).
  // Consecutive cells in a row alternate between the row's top and 2·wave below it.
  wave: 0,
  // The module label's width; the spine column reserves it.
  moduleLabelWidth: 168,
  // The root box's left edge (WP-37 centred it on the spine: −rootWidth / 2).
  rootX: -180,
});

export type LayoutOptions = { [K in keyof typeof DEFAULTS]: number };

export type XY = [number, number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutNode extends Box {
  id: string;
  kind: "root" | "module" | "anchor" | "step" | "reinforcement";
  cx: number;
  cy: number;
  moduleId?: string;
  readable?: boolean;
  level?: string;
  stage?: Stage;
  topic?: Topic;
  ordinal?: number;
}

export type EdgeKind = "spine" | "module" | "route" | "fan";

export interface LayoutEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  points: XY[];
  locked: boolean;
}

export interface LayoutCell extends Box {
  id: string;
  children: number;
}

export interface LayoutRow {
  top: number;
  bottom: number;
  direction: "ltr" | "rtl";
  heads: string[];
}

export interface LayoutModule {
  id: string;
  moduleId: string | number;
  box: Box;
  spineHalf: number;
  gutters: { left: [number, number]; right: [number, number] };
  rows: LayoutRow[];
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  cells: LayoutCell[];
  modules: LayoutModule[];
  bounds: Box;
}

/** A layout while it is being placed: everything but its bounds. */
export type LayoutParts = Omit<Layout, "bounds">;
