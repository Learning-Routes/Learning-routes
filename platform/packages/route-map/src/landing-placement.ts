// STEP 41 §2 — where each panel's text sits on the landing's map. Pure: no DOM,
// no three.js. The map is landing-model.ts, its cameras landing-camera.ts, what the
// text must not cover landing-obstacles.ts; this module picks the camera and the
// free slot for the text.
import { at } from "./at-index";
import {
  type CamPose,
  camera,
  camFor,
  isPhone,
  layFor,
  restFor,
  type StageCamera,
} from "./landing-camera";
import { anchorOf, type Model, planeOf } from "./landing-model";
import { obstaclesFor, shapeHits } from "./landing-obstacles";

export interface Slot {
  sc: number;
  x: number;
  y: number;
  hits: number;
}

const nearAnchor = (
  anc: { x: number; y: number } | null,
  X0: number,
  Y0: number,
  X1: number,
  Y1: number,
) => anc && anc.x > X0 - 30 && anc.x < X1 + 30 && anc.y > Y0 - 30 && anc.y < Y1 + 30;

// Where bestSlot looks: the margins, the padding, and the columns it tries.
function searchArea(i: number, mobile: boolean, Wd: number, w: number) {
  const m = mobile ? 20 : 32;
  const top = i === 0 || mobile ? 20 : 80;
  const bot = mobile && i ? 84 : 24;
  const pad = mobile ? 10 : 18;
  const xs: number[] = [];
  if (mobile) {
    xs.push(20);
  } else {
    for (let x = m; x <= Wd - m - w; x += 12) {
      xs.push(x);
    }
  }
  return { top, bot, pad, xs };
}

// The free slot nearest the designed one: { x, y, hits, sc }.
export function bestSlot(
  model: Model,
  i: number,
  cam: StageCamera,
  mobile: boolean,
  Wd: number,
  H: number,
  w: number,
  h: number,
  shape: number[][],
): Slot | null {
  const O = obstaclesFor(model, i, cam, mobile, Wd, H);
  const L = layFor(i, mobile);
  const { top, bot, pad, xs } = searchArea(i, mobile, Wd, w);
  const dx = mobile ? 20 : at(L.r, 0) * Wd;
  const dy = at(L.r, 1) * H;
  const anc = L.a ? cam.project(anchorOf(model, L.a)) : null;
  // A slot's score: what it covers, how far it drifts from the design, and how far
  // the text strays from its anchor.
  const slot = (x: number, y: number): Slot => {
    let hits = shapeHits(O, shape, x, y, pad);
    if (nearAnchor(anc, x - pad, y - pad, x + w + pad, y + h + pad)) {
      hits += 20;
    }
    let sc = hits * 1000 + Math.hypot(x - dx, (y - dy) * 1.3) * 0.6;
    if (anc) {
      sc += Math.max(0, Math.hypot(anc.x - (x + w / 2), anc.y - (y + h / 2)) - 300) * 0.3;
    }
    return { sc, x, y, hits };
  };
  let best: Slot | null = null;
  for (const x of xs) {
    for (let y = top; y <= Math.max(top, H - bot - h); y += 8) {
      const candidate = slot(x, y);
      if (!best || candidate.sc < best.sc) {
        best = candidate;
      }
    }
  }
  return best;
}

// The spots tried around the designed one, in stage pixels.
const NUDGES: [number, number][] = [
  [0, 0],
  [0, -24],
  [0, 24],
  [24, 0],
  [0, -48],
  [0, 48],
];

// How much the text would cover at (or just around) its designed spot.
export function hitsNear(
  model: Model,
  i: number,
  cam: StageCamera,
  mobile: boolean,
  Wd: number,
  H: number,
  w: number,
  h: number,
  shape: number[][],
): number {
  const O = obstaclesFor(model, i, cam, mobile, Wd, H);
  const L = layFor(i, mobile);
  const pad = mobile ? 10 : 18;
  const x0 = mobile ? 20 : at(L.r, 0) * Wd;
  const y0 = at(L.r, 1) * H;
  const anc = L.a ? cam.project(anchorOf(model, L.a)) : null;
  let best = Infinity;
  for (const [dx, dy] of NUDGES) {
    const X0 = x0 + dx - pad;
    const Y0 = Math.max(20, y0 + dy) - pad;
    const X1 = X0 + w + 2 * pad;
    const Y1 = Y0 + h + 2 * pad;
    let hits = shapeHits(O, shape, X0 + pad, Y0 + pad, pad);
    if (Y1 > H - (mobile && i ? 76 : 10) || X1 > Wd - 10) {
      hits += 50;
    }
    if (nearAnchor(anc, X0, Y0, X1, Y1)) {
      hits += 20;
    }
    best = Math.min(best, hits);
  }
  return best;
}

// The text's width on this stage (its height then comes from the page).
export function textWidth(i: number, Wd: number): number {
  const mobile = isPhone(Wd);
  const L = layFor(i, mobile);
  return Math.round(mobile ? Wd - 40 : Math.max(360, (at(L.r, 2) - at(L.r, 0)) * Wd));
}

const SHIFTS: { d: [number, number][]; m: [number, number][] } = {
  d: [
    [0, 0],
    [0.03, 0],
    [0.03, -0.05],
    [0.06, -0.06],
    [0, -0.08],
    [0.06, 0.04],
    [-0.04, 0],
    [-0.04, -0.06],
  ],
  // The last phone slide is new: at 360 × 740 the hero's paragraph met the
  // origin marker at every slide the reference tried (4 points, STEP 41 §2.2).
  m: [
    [0, 0],
    [0, -0.05],
    [0, -0.1],
    [0, -0.15],
    [0, -0.2],
  ],
};
const DISTANCES = [1, 1.08, 1.17, 1.28, 1.4, 1.55];

// The camera that clears the designed spot best: pulled back ×1.0 to ×1.55 and
// slid, stopping at the first that is clear enough.
function clearestCamera(
  model: Model,
  i: number,
  base: CamPose,
  mobile: boolean,
  frame: { Wd: number; H: number; w: number; h: number; shape: number[][] },
): CamPose {
  const { Wd, H, w, h, shape } = frame;
  let chosen = base;
  let bestHits = Infinity;
  for (const dm of DISTANCES) {
    for (const [ax, ay] of SHIFTS[mobile ? "m" : "d"]) {
      const P = { ...base, d: base.d * dm, sx: base.sx + ax, sy: base.sy + ay };
      const r = restFor(P, Wd / H);
      const hits =
        hitsNear(model, i, camera(r.pos, r.tgt, Wd, H), mobile, Wd, H, w, h, shape) + (dm - 1) * 4;
      if (hits < bestHits) {
        bestHits = hits;
        chosen = P;
      }
      if (hits < (dm - 1) * 4 + 0.5) {
        return chosen;
      }
    }
  }
  return chosen;
}

// Panel i on a Wd × H stage with text w × h of this shape: if its designed spot
// is not clear, the camera gives way (pulls back ×1.0 to ×1.55 and slides) until
// it is; then the text takes the free slot nearest the designed one.
// → { params, rest: { pos, tgt }, slot, anchor, d }
export function layoutPanel(
  model: Model,
  i: number,
  Wd: number,
  H: number,
  w: number,
  h: number,
  shape: number[][],
) {
  const mobile = isPhone(Wd);
  const base = camFor(i, mobile);
  const chosen = clearestCamera(model, i, base, mobile, { Wd, H, w, h, shape });
  const rest = restFor(chosen, Wd / H);
  const cam = camera(rest.pos, rest.tgt, Wd, H);
  const slot = bestSlot(model, i, cam, mobile, Wd, H, w, h, shape);
  if (!slot) {
    throw new Error(`landing map: no column for a ${w} px text on a ${Wd} px stage`);
  }
  return {
    params: chosen,
    rest,
    slot,
    anchor: cam.hitPlane(slot.x, slot.y, planeOf(model)),
    d: chosen.d / base.d,
  };
}
