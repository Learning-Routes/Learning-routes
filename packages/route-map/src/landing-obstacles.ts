import { at } from "./at-index";
import { anchorPoint, type Projected, type StageCamera, spotFor } from "./landing-cameras";
import { between, type Point, point } from "./landing-curves";
import { type LandingModel, SHEET_X } from "./landing-model";

// What a panel's text must not cover, seen from that panel's resting camera: weighted boxes
// in stage pixels (STEP 41 §2.2). Ported from v1's landing_placement.js.

export type Obstacle = { x0: number; y0: number; x1: number; y1: number; weight: number };
/** The text as a headline over a narrower body: [left, top, right, bottom] boxes. */
export type TextShape = readonly (readonly [number, number, number, number])[];
export type Stage = {
  panel: number;
  camera: StageCamera;
  onPhone: boolean;
  width: number;
  height: number;
};

function drawnRadius(camera: StageCamera, p: Point, radius: number): number {
  const center = camera.project(p);
  const b = camera.project(point(p.x + radius, p.y, p.z));
  const c = camera.project(point(p.x, p.y, p.z + radius));
  return Math.max(
    Math.hypot(b.x - center.x, b.y - center.y),
    Math.hypot(c.x - center.x, c.y - center.y),
  );
}

function box(p: Projected, halfWidth: number, halfHeight: number, weight: number): Obstacle {
  return {
    x0: p.x - halfWidth,
    y0: p.y - halfHeight,
    x1: p.x + halfWidth,
    y1: p.y + halfHeight,
    weight,
  };
}

function mapObstacles(model: LandingModel, { panel, camera }: Stage): Obstacle[] {
  const found: Obstacle[] = [];
  const showsNames = panel >= 1 && panel <= 4; // step names only show while travelling
  const named = (p: Point, radius: number, weight: number) => {
    const center = camera.project(p);
    const drawn = drawnRadius(camera, p, radius);
    found.push(box(center, drawn + 4, drawn + 4, weight));
    if (showsNames) {
      found.push({
        x0: center.x - 66,
        y0: center.y + drawn,
        x1: center.x + 66,
        y1: center.y + drawn + 36,
        weight: 2,
      });
    }
  };
  const [first, second, third] = model.modules;
  for (const head of [...first.heads, ...second.heads]) {
    named(head, 0.62, 3);
  }
  for (const head of third.heads) {
    named(head, 0.5, 2);
  }
  for (const module of model.modules) {
    named(module.disc, 0.82, 3);
    const chip = camera.project(point(-0.6, module.surfaceY, module.top + 0.2));
    found.push({ x0: chip.x - 14, y0: chip.y - 16, x1: chip.x + 184, y1: chip.y + 16, weight: 2 });
  }
  const origin = camera.project(model.origin);
  found.push(box(origin, 18, 18, 3));
  if (panel === 1 || panel === 5) {
    found.push({
      x0: origin.x - 50,
      y0: origin.y - 72,
      x1: origin.x + 240,
      y1: origin.y - 8,
      weight: 2,
    });
  }
  if (panel >= 3) {
    for (const stop of model.extra.stops) {
      named(stop, 0.4, 3);
    }
  }
  return found;
}

function lineObstacles(model: LandingModel, { panel, camera }: Stage): Obstacle[] {
  const found: Obstacle[] = [];
  const along = (curve: { getPointAt: (u: number) => Point }, samples: number) => {
    for (let k = 0; k <= samples; k++) {
      found.push(box(camera.project(curve.getPointAt(k / samples)), 7, 7, 1));
    }
  };
  for (const { curve } of model.route) {
    along(curve, Math.max(4, Math.ceil(curve.getLength() * 1.4)));
  }
  if (panel >= 3) {
    for (const trace of model.extra.traces) {
      along(trace, 12);
    }
  }
  const [left, right] = SHEET_X;
  for (const module of model.modules) {
    const y = module.surfaceY;
    const corners = [
      point(left, y, module.top),
      point(right, y, module.top),
      point(right, y, module.bottom),
      point(left, y, module.bottom),
    ];
    corners.forEach((corner, k) => {
      for (let s = 0; s <= 28; s++) {
        const edge = between(corner, at(corners, (k + 1) % 4), s / 28);
        found.push(box(camera.project(edge), 5, 5, 1));
      }
    });
  }
  return found;
}

function controlObstacles({ panel, onPhone, width, height }: Stage): Obstacle[] {
  if (panel < 1) {
    return [];
  }
  if (onPhone) {
    return [{ x0: 0, y0: height - 76, x1: width, y1: height, weight: 6 }];
  }
  return [
    { x0: 0, y0: 0, x1: width, y1: 68, weight: 6 },
    { x0: width - 50, y0: height / 2 - 110, x1: width, y1: height / 2 + 110, weight: 6 },
  ];
}

export const obstaclesFor = (model: LandingModel, stage: Stage) => [
  ...mapObstacles(model, stage),
  ...lineObstacles(model, stage),
  ...controlObstacles(stage),
];

export function shapeHits(
  obstacles: Obstacle[],
  shape: TextShape,
  x: number,
  y: number,
  pad: number,
) {
  let hits = 0;
  for (const [a, b, c, d] of shape) {
    const x0 = x + a - pad;
    const y0 = y + b - pad;
    const x1 = x + c + pad;
    const y1 = y + d + pad;
    for (const o of obstacles) {
      if (o.x1 > x0 && o.x0 < x1 && o.y1 > y0 && o.y0 < y1) {
        hits += o.weight;
      }
    }
  }
  return hits;
}

export function coversAnchor(
  anchor: Projected | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  return (
    anchor !== null &&
    anchor.x > x0 - 30 &&
    anchor.x < x1 + 30 &&
    anchor.y > y0 - 30 &&
    anchor.y < y1 + 30
  );
}

export function projectedAnchor(model: LandingModel, { panel, camera, onPhone }: Stage) {
  const { anchor } = spotFor(panel, onPhone);
  return anchor ? camera.project(anchorPoint(model, anchor)) : null;
}
