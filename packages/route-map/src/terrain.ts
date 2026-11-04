// WP-37b §4.3 — the faint contour lines behind the route map. Pure: no DOM. Ported
// from v1's app/javascript/lib/journey_terrain.js; tested in test/terrain.test.ts.
//
// Seeded 2-D Perlin noise (three octaves), then marching squares at each level,
// so the same route always lies on the same terrain. Each level is ONE path
// string of "Mx yLx y" segments; the caller strokes it with a token colour.

import { at } from "./at-index";

export interface TerrainOptions {
  seed: number;
  cell: number;
  levels: number[];
}

export const TERRAIN_DEFAULTS: Readonly<TerrainOptions> = Object.freeze({
  seed: 37,
  cell: 18,
  levels: [-0.32, -0.16, 0, 0.16, 0.32],
});

// Perlin gradient noise over a permutation shuffled by a seeded LCG.
export function noise2D(seed: number): (x: number, y: number) => number {
  const p = [...Array(256).keys()];
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const pi = at(p, i);
    p[i] = at(p, j);
    p[j] = pi;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = at(p, i & 255);
  }
  const G: [number, number][] = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const grad = (h: number, x: number, y: number): number => {
    const [gxh, gyh] = at(G, h & 7);
    return gxh * x + gyh * y;
  };
  return (x: number, y: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = at(perm, X) + Y;
    const b = at(perm, X + 1) + Y;
    return lerp(
      lerp(grad(at(perm, a), x, y), grad(at(perm, b), x - 1, y), u),
      lerp(grad(at(perm, a + 1), x, y - 1), grad(at(perm, b + 1), x - 1, y - 1), u),
      v,
    );
  };
}

// Which cell edges a contour crosses, by the 4-bit corner code (a b c d =
// top-left, top-right, bottom-right, bottom-left above the level). The saddles
// (5, 10) give two segments.
type Edge = "T" | "R" | "B" | "L";

const EDGES: Record<number, Edge[]> = {
  1: ["L", "B"],
  2: ["B", "R"],
  3: ["L", "R"],
  4: ["T", "R"],
  5: ["T", "L", "B", "R"],
  6: ["T", "B"],
  7: ["T", "L"],
  8: ["T", "L"],
  9: ["T", "B"],
  10: ["T", "R", "B", "L"],
  11: ["T", "R"],
  12: ["L", "R"],
  13: ["B", "R"],
  14: ["L", "B"],
};

// The noise sampled at every grid point, and how grid indices map to coordinates.
interface Grid {
  values: Float64Array;
  cols: number;
  rows: number;
  gx: (i: number) => number;
  gy: (j: number) => number;
  fx: (v: number) => string;
  fy: (v: number) => string;
}

// One decimal, held inside the rectangle's own one-decimal bounds, so rounding
// cannot carry a point past an edge either.
function within(lo: number, hi: number): (v: number) => string {
  const min = Math.ceil(lo * 10) / 10;
  const max = Math.floor(hi * 10) / 10;
  return (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10)).toFixed(1);
}

function sampleGrid(
  rect: { x: number; y: number; w: number; h: number },
  cell: number,
  f: (x: number, y: number) => number,
): Grid {
  const x0 = rect.x;
  const y0 = rect.y;
  // The grid fits the rectangle exactly: whole cells no larger than `cell`, so no
  // segment is drawn past the rectangle's right or bottom edge.
  const nx = Math.max(1, Math.ceil(rect.w / cell));
  const ny = Math.max(1, Math.ceil(rect.h / cell));
  const cols = nx + 1;
  const rows = ny + 1;
  const gx = (i: number): number => (i === nx ? x0 + rect.w : x0 + (i * rect.w) / nx);
  const gy = (j: number): number => (j === ny ? y0 + rect.h : y0 + (j * rect.h) / ny);
  const values = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      values[j * cols + i] = f(gx(i), gy(j));
    }
  }
  return { values, cols, rows, gx, gy, fx: within(x0, x0 + rect.w), fy: within(y0, y0 + rect.h) };
}

// The contour segments of one grid cell (i, j) at one level (marching squares).
function cellSegments(grid: Grid, level: number, i: number, j: number, parts: string[]): void {
  const { values, cols, gx, gy, fx, fy } = grid;
  const cross = (
    xa: number,
    ya: number,
    va: number,
    xb: number,
    yb: number,
    vb: number,
  ): [number, number] => {
    const t = (level - va) / (vb - va);
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };
  const a = at(values, j * cols + i);
  const b = at(values, j * cols + i + 1);
  const c = at(values, (j + 1) * cols + i + 1);
  const d = at(values, (j + 1) * cols + i);
  const code =
    (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
  const edges = EDGES[code];
  if (!edges) {
    return;
  }
  const xl = gx(i);
  const xr = gx(i + 1);
  const yt = gy(j);
  const yb = gy(j + 1);
  const crossing: Record<Edge, () => [number, number]> = {
    T: () => cross(xl, yt, a, xr, yt, b),
    R: () => cross(xr, yt, b, xr, yb, c),
    B: () => cross(xl, yb, d, xr, yb, c),
    L: () => cross(xl, yt, a, xl, yb, d),
  };
  for (let k = 0; k + 1 < edges.length; k += 2) {
    const [px, py] = crossing[at(edges, k)]();
    const [qx, qy] = crossing[at(edges, k + 1)]();
    parts.push(`M${fx(px)} ${fy(py)}L${fx(qx)} ${fy(qy)}`);
  }
}

export function contours(
  rect: { x: number; y: number; w: number; h: number },
  opts: Partial<TerrainOptions> = {},
): string[] {
  const { seed, cell, levels } = { ...TERRAIN_DEFAULTS, ...opts };
  const n = noise2D(seed);
  const f = (x: number, y: number): number =>
    0.6 * n(x / 460, y / 460) +
    0.3 * n(x / 190 + 11.3, y / 190 + 4.7) +
    0.1 * n(x / 85 + 2.1, y / 85 + 9.9);
  const grid = sampleGrid(rect, cell, f);
  return levels.map((level) => {
    const parts: string[] = [];
    for (let j = 0; j + 1 < grid.rows; j++) {
      for (let i = 0; i + 1 < grid.cols; i++) {
        cellSegments(grid, level, i, j, parts);
      }
    }
    return parts.join("");
  });
}
