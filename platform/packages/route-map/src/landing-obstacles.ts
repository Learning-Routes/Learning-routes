// What a chapter's text must not cover, seen from its resting camera: weighted
// boxes in stage pixels. This answers the owner's main point (STEP 41 §2.2): the
// text sits on a free spot of the map, never over the map, its names or the controls.
import { at } from "./at-index";
import type { StageCamera } from "./landing-camera";
import { lerp3, type Vec3, v } from "./landing-curves";
import { fanOf, type Model, SHEET_X } from "./landing-model";

export interface Obstacle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  wt: number;
}

// Pushes obstacles in stage pixels for one camera.
interface Marker {
  O: Obstacle[];
  P: StageCamera["project"];
  box: (x: number, y: number, hw: number, hh: number, wt: number) => void;
  named: (p: Vec3, r: number, wt: number) => void;
}

function markerFor(cam: StageCamera, i: number): Marker {
  const O: Obstacle[] = [];
  const P = cam.project;
  const radius = (p: Vec3, r: number): number => {
    const a = P(p);
    const b = P(v(p.x + r, p.y, p.z));
    const c = P(v(p.x, p.y, p.z + r));
    return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  };
  const box = (x: number, y: number, hw: number, hh: number, wt: number): void => {
    O.push({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh, wt });
  };
  const names = i >= 1 && i <= 4; // step names only show while travelling
  const named = (p: Vec3, r: number, wt: number): void => {
    const c = P(p);
    const rr = radius(p, r);
    box(c.x, c.y, rr + 4, rr + 4, wt);
    if (names) {
      O.push({ x0: c.x - 66, y0: c.y + rr, x1: c.x + 66, y1: c.y + rr + 36, wt: 2 });
    }
  };
  return { O, P, box, named };
}

// Stops with the room for their names, the module discs and chips, the origin and
// the root title.
function markStops(model: Model, i: number, { O, P, box, named }: Marker): void {
  const M1 = at(model.mods, 0);
  const M2 = at(model.mods, 1);
  const M3 = at(model.mods, 2);
  for (const p of [...M1.heads, ...M2.heads]) {
    named(p, 0.62, 3);
  }
  for (const p of M3.heads) {
    named(p, 0.5, 2);
  }
  for (const md of model.mods) {
    named(md.disc, 0.82, 3);
    const ch = P(v(-0.6, md.topY, md.top + 0.2));
    O.push({ x0: ch.x - 14, y0: ch.y - 16, x1: ch.x + 184, y1: ch.y + 16, wt: 2 });
  }
  const c = P(model.origin);
  box(c.x, c.y, 18, 18, 3);
  if (i === 1 || i === 5) {
    O.push({ x0: c.x - 50, y0: c.y - 72, x1: c.x + 240, y1: c.y - 8, wt: 2 });
  }
}

// Samples along every leg, the fan once the story reaches it, and the sheets' edges.
function markLines(model: Model, i: number, { P, box, named }: Marker): void {
  for (const r of model.route) {
    const n = Math.max(4, Math.ceil(r.curve.getLength() * 1.4));
    for (let k = 0; k <= n; k++) {
      const c = P(r.curve.getPointAt(k / n));
      box(c.x, c.y, 7, 7, 1);
    }
  }
  if (i >= 3) {
    const fan = fanOf(at(model.mods, 0));
    for (const t of fan.traces) {
      for (let k = 0; k <= 12; k++) {
        const c = P(t.getPointAt(k / 12));
        box(c.x, c.y, 7, 7, 1);
      }
    }
    for (const p of fan.kids) {
      named(p, 0.4, 3);
    }
  }
  const [x0, x1] = [at(SHEET_X, 0), at(SHEET_X, 1)];
  for (const md of model.mods) {
    const y = md.topY;
    const corners = [v(x0, y, md.top), v(x1, y, md.top), v(x1, y, md.bottom), v(x0, y, md.bottom)];
    corners.forEach((a, k) => {
      const b = at(corners, (k + 1) % 4);
      for (let s = 0; s <= 28; s++) {
        const c = P(lerp3(a, b, s / 28));
        box(c.x, c.y, 5, 5, 1);
      }
    });
  }
}

// The stage's own controls: the bottom bar on a phone, the top bar and the side
// dots on a desktop.
function markControls(O: Obstacle[], i: number, mobile: boolean, Wd: number, H: number): void {
  if (i < 1) {
    return;
  }
  if (mobile) {
    O.push({ x0: 0, y0: H - 76, x1: Wd, y1: H, wt: 6 });
  } else {
    O.push({ x0: 0, y0: 0, x1: Wd, y1: 68, wt: 6 });
    O.push({ x0: Wd - 50, y0: H / 2 - 110, x1: Wd, y1: H / 2 + 110, wt: 6 });
  }
}

export function obstaclesFor(
  model: Model,
  i: number,
  cam: StageCamera,
  mobile: boolean,
  Wd: number,
  H: number,
): Obstacle[] {
  const marker = markerFor(cam, i);
  markStops(model, i, marker);
  markLines(model, i, marker);
  markControls(marker.O, i, mobile, Wd, H);
  return marker.O;
}

// The text is a headline over a narrower body: both boxes are tested, not one rectangle.
export function shapeHits(
  O: Obstacle[],
  shape: number[][],
  x: number,
  y: number,
  pad: number,
): number {
  let hits = 0;
  for (const row of shape) {
    // A shape row is a box: [left, top, right, bottom].
    const [a, b, c, d] = [at(row, 0), at(row, 1), at(row, 2), at(row, 3)];
    const X0 = x + a - pad;
    const Y0 = y + b - pad;
    const X1 = x + c + pad;
    const Y1 = y + d + pad;
    for (const o of O) {
      if (o.x1 > X0 && o.x0 < X1 && o.y1 > Y0 && o.y0 < Y1) {
        hits += o.wt;
      }
    }
  }
  return hits;
}
