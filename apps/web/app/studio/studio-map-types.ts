import type { Vector2, Vector3 } from "three";
import type { Road } from "./studio-roads";

// The assistant map's shapes (Platform STEP 10): what the page hands the map, and its forks.

export interface MapStation {
  kind: "module" | "lesson";
  /** Shown beside a module, and beside a lesson only when it is new. */
  label: string;
  sublabel?: string;
  isNew: boolean;
}

export interface StudioMapOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  isReducedMotion: boolean;
  startLabel: string;
  /** Where the subtitles begin, in pixels from the top: labels below it are hidden. */
  floor: () => number;
  /** Where the page's header ends, in pixels from the top: labels above it are hidden. */
  ceiling: () => number;
  /** How much of the right side the route's list covers, in pixels: the map centres on the rest. */
  inset: () => number;
  onChoose: (branch: number) => void;
  onHot: (branch: number) => void;
}

export const PLAN_STEP = 6;
export const SPREADS: Record<number, number[]> = {
  1: [0],
  2: [-5, 5],
  3: [-8, 0, 8],
  4: [-11, -4, 4, 11],
};

export interface Branch {
  road: Road;
  chip: HTMLElement;
  end: Vector2;
  anchor: Vector3;
}
