import {
  type CameraShot,
  isPhone,
  planeOf,
  type RestingCamera,
  restingCamera,
  shotFor,
  spotFor,
  stageCamera,
} from "./landing-cameras";
import type { Point } from "./landing-curves";
import type { LandingModel } from "./landing-model";
import {
  coversAnchor,
  obstaclesFor,
  projectedAnchor,
  type Stage,
  shapeHits,
  type TextShape,
} from "./landing-obstacles";

// STEP 41 §2.2, the owner's main point: each panel's text sits on a free spot of the map,
// never over a stop, a name, a leg, a sheet's edge or a control. Pure, ported from v1.

export type { TextShape } from "./landing-obstacles";

type Slot = { score: number; x: number; y: number; hits: number };
type TextBox = { w: number; h: number; shape: TextShape };

function slotRange({ panel, onPhone, width, height }: Stage, w: number, h: number) {
  const margin = onPhone ? 20 : 32;
  const top = panel === 0 || onPhone ? 20 : 80;
  const bottom = onPhone && panel ? 84 : 24;
  return {
    firstX: onPhone ? 20 : margin,
    lastX: onPhone ? 20 : width - margin - w,
    top,
    lastY: Math.max(top, height - bottom - h),
  };
}

/** The free slot nearest the designed one. */
function bestSlot(model: LandingModel, stage: Stage, { w, h, shape }: TextBox): Slot {
  const { panel, onPhone, width, height } = stage;
  const obstacles = obstaclesFor(model, stage);
  const { spot } = spotFor(panel, onPhone);
  const pad = onPhone ? 10 : 18;
  const designedX = onPhone ? 20 : spot[0] * width;
  const designedY = spot[1] * height;
  const anchor = projectedAnchor(model, stage);
  const slotAt = (x: number, y: number): Slot => {
    const covers = coversAnchor(anchor, x - pad, y - pad, x + w + pad, y + h + pad);
    const hits = shapeHits(obstacles, shape, x, y, pad) + (covers ? 20 : 0);
    const reach = anchor
      ? Math.max(0, Math.hypot(anchor.x - (x + w / 2), anchor.y - (y + h / 2)) - 300) * 0.3
      : 0;
    const distance = Math.hypot(x - designedX, (y - designedY) * 1.3) * 0.6;
    return { x, y, hits, score: hits * 1000 + distance + reach };
  };
  const { firstX, lastX, top, lastY } = slotRange(stage, w, h);
  let best: Slot = { score: Number.POSITIVE_INFINITY, x: designedX, y: designedY, hits: 0 };
  for (let x = firstX; x <= lastX; x += 12) {
    for (let y = top; y <= lastY; y += 8) {
      const slot = slotAt(x, y);
      if (slot.score < best.score) {
        best = slot;
      }
    }
  }
  return best;
}

const NUDGES = [
  [0, 0],
  [0, -24],
  [0, 24],
  [24, 0],
  [0, -48],
  [0, 48],
] as const;

/** How much the text would cover at, or just around, its designed spot. */
function hitsNear(model: LandingModel, stage: Stage, { w, h, shape }: TextBox): number {
  const { panel, onPhone, width, height } = stage;
  const obstacles = obstaclesFor(model, stage);
  const { spot } = spotFor(panel, onPhone);
  const pad = onPhone ? 10 : 18;
  const startX = onPhone ? 20 : spot[0] * width;
  const startY = spot[1] * height;
  const anchor = projectedAnchor(model, stage);
  let best = Number.POSITIVE_INFINITY;
  for (const [dx, dy] of NUDGES) {
    const x0 = startX + dx - pad;
    const y0 = Math.max(20, startY + dy) - pad;
    const x1 = x0 + w + 2 * pad;
    const y1 = y0 + h + 2 * pad;
    let hits = shapeHits(obstacles, shape, x0 + pad, y0 + pad, pad);
    if (y1 > height - (onPhone && panel ? 76 : 10) || x1 > width - 10) {
      hits += 50;
    }
    if (coversAnchor(anchor, x0, y0, x1, y1)) {
      hits += 20;
    }
    best = Math.min(best, hits);
  }
  return best;
}

/** The text's width on this stage; its height then comes from the page. */
export function textWidth(panel: number, stageWidth: number): number {
  const onPhone = isPhone(stageWidth);
  const { spot } = spotFor(panel, onPhone);
  return Math.round(onPhone ? stageWidth - 40 : Math.max(360, (spot[2] - spot[0]) * stageWidth));
}

const DESKTOP_SHIFTS = [
  [0, 0],
  [0.03, 0],
  [0.03, -0.05],
  [0.06, -0.06],
  [0, -0.08],
  [0.06, 0.04],
  [-0.04, 0],
  [-0.04, -0.06],
] as const;
// The last slide is v1's own: at 360 × 740 the hero's paragraph met the origin marker
// at every slide the reference tried.
const PHONE_SHIFTS = [
  [0, 0],
  [0, -0.05],
  [0, -0.1],
  [0, -0.15],
  [0, -0.2],
] as const;
const DISTANCES = [1, 1.08, 1.17, 1.28, 1.4, 1.55];

function clearestShot(
  model: LandingModel,
  panel: number,
  width: number,
  height: number,
  text: TextBox,
) {
  const onPhone = isPhone(width);
  const base = shotFor(panel, onPhone);
  let chosen: CameraShot = base;
  let fewest = Number.POSITIVE_INFINITY;
  for (const distance of DISTANCES) {
    const penalty = (distance - 1) * 4;
    for (const [ax, ay] of onPhone ? PHONE_SHIFTS : DESKTOP_SHIFTS) {
      const shot = { ...base, d: base.d * distance, sx: base.sx + ax, sy: base.sy + ay };
      const camera = stageCamera(restingCamera(shot, width / height), width, height);
      const hits = hitsNear(model, { panel, camera, onPhone, width, height }, text) + penalty;
      if (hits < fewest) {
        fewest = hits;
        chosen = shot;
      }
      if (hits < penalty + 0.5) {
        return { chosen, base };
      }
    }
  }
  return { chosen, base };
}

export type PanelLayout = {
  rest: RestingCamera;
  slot: { x: number; y: number; hits: number };
  anchor: Point;
  /** How far the camera pulled back, from 1 to 1.55. */
  pullBack: number;
};

/**
 * One panel on a stage: if the text's designed spot is not clear, the camera gives way
 * (pulls back and slides) until it is; the text then takes the nearest free slot.
 */
export function layoutPanel(
  model: LandingModel,
  panel: number,
  width: number,
  height: number,
  text: TextBox,
): PanelLayout {
  const { chosen, base } = clearestShot(model, panel, width, height, text);
  const rest = restingCamera(chosen, width / height);
  const camera = stageCamera(rest, width, height);
  const stage = { panel, camera, onPhone: isPhone(width), width, height };
  const slot = bestSlot(model, stage, text);
  return {
    rest,
    slot,
    anchor: camera.hitPlane(slot.x, slot.y, planeOf(model)),
    pullBack: chosen.d / base.d,
  };
}
