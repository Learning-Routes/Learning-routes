// The landing's map as flat shapes: the model of landing-model, seen through the
// panels' cameras of landing-camera, ready to draw as SVG on the server. No browser
// and no WebGL: the storefront ships no script (Platform STEP 3 §4).
import { at } from "./at-index";
import { camera, camFor, restFor, type StageCamera } from "./landing-camera";
import { type Curve, type Vec3, v } from "./landing-curves";
import { buildModel, fanOf, RB, SHEET_X, T } from "./landing-model";

const STOP_RADIUS = 0.55;
const DISC_RADIUS = 0.72;
const EXAM_RADIUS = 0.72;
const KAPPA = 0.5523;
const SAMPLES_PER_UNIT = 2.5;

export interface SceneOptions {
  /** Which panel's camera. */
  panel: number;
  mobile: boolean;
  width: number;
  height: number;
  /** Stops of the first module already done; the next one is "you are here". */
  done: number;
  /** Whether the remedial branch at the third stop is open. */
  fan?: boolean;
  /** Overrides the panel's framing: where its subject sits on the stage. */
  framing?: { sx?: number; sy?: number; d?: number };
}

export interface Stop {
  d: string;
  state: "done" | "here" | "ahead";
  exam: boolean;
  module: number;
  locked: boolean;
}

export interface Scene {
  width: number;
  height: number;
  sheets: { top: string; side: string; shade: string; locked: boolean }[];
  track: string[];
  route: string;
  branch: string[];
  stops: Stop[];
  branchStops: string[];
  discs: { d: string; module: number; label: { x: number; y: number } }[];
  origin: string;
}

const n = (value: number) => Math.round(value * 10) / 10;

function pen(cam: StageCamera) {
  const at2 = (p: Vec3) => {
    const { x, y } = cam.project(p);
    return `${n(x)} ${n(y)}`;
  };
  return {
    at: at2,
    polyline: (points: Vec3[]) => `M${points.map(at2).join("L")}`,
    /** A circle lying on the map, as four cubics: its projection stays smooth. */
    circle(c: Vec3, r: number) {
      const k = r * KAPPA;
      const p = (dx: number, dz: number) => at2(v(c.x + dx, c.y, c.z + dz));
      return `M${p(r, 0)}C${p(r, k)} ${p(k, r)} ${p(0, r)}C${p(-k, r)} ${p(-r, k)} ${p(-r, 0)}C${p(-r, -k)} ${p(-k, -r)} ${p(0, -r)}C${p(k, -r)} ${p(r, -k)} ${p(r, 0)}Z`;
    },
    /** A rounded sheet lying flat at height y. */
    sheet(x0: number, x1: number, z0: number, z1: number, y: number, dx = 0, dz = 0) {
      const p = (x: number, z: number) => at2(v(x + dx, y, z + dz));
      const r = RB;
      return `M${p(x0 + r, z0)}L${p(x1 - r, z0)}Q${p(x1, z0)} ${p(x1, z0 + r)}L${p(x1, z1 - r)}Q${p(x1, z1)} ${p(x1 - r, z1)}L${p(x0 + r, z1)}Q${p(x0, z1)} ${p(x0, z1 - r)}L${p(x0, z0 + r)}Q${p(x0, z0)} ${p(x0 + r, z0)}Z`;
    },
    diamond(c: Vec3, r: number) {
      return `M${[v(c.x, c.y, c.z - r), v(c.x + r, c.y, c.z), v(c.x, c.y, c.z + r), v(c.x - r, c.y, c.z)].map(at2).join("L")}Z`;
    },
  };
}

function samples(curve: Curve): Vec3[] {
  const count = Math.max(4, Math.ceil(curve.getLength() * SAMPLES_PER_UNIT));
  return Array.from({ length: count + 1 }, (_, i) => curve.getPointAt(i / count));
}

/** The whole map from one panel's camera, with the student at stop `done` of module 1. */
export function landingScene(options: SceneOptions): Scene {
  const { panel, mobile, width, height, done, fan = false, framing } = options;
  const model = buildModel();
  const rest = restFor({ ...camFor(panel, mobile), ...framing }, width / height);
  const cam = camera(rest.pos, rest.tgt, width, height);
  const draw = pen(cam);
  const [x0, x1] = SHEET_X as [number, number];
  const [first] = model.mods;
  if (!first) {
    throw new Error("landing map: no modules");
  }

  // Farthest first, so a nearer sheet covers what is behind it.
  const distance = (top: number, bottom: number) => {
    const c = v((x0 + x1) / 2, 0, (top + bottom) / 2);
    return Math.hypot(c.x - cam.pos.x, c.y - cam.pos.y, c.z - cam.pos.z);
  };
  const sheets = [...model.mods]
    .sort((a, b) => distance(b.top, b.bottom) - distance(a.top, a.bottom))
    .map((md) => ({
      top: draw.sheet(x0, x1, md.top, md.bottom, md.topY),
      side: draw.sheet(x0, x1, md.top, md.bottom, md.topY - T * 2),
      shade: draw.sheet(x0, x1, md.top, md.bottom, md.topY - T * 4, 0.5, 0.7),
      locked: md.locked === true,
    }));

  const here = done;
  const firstLegs = first.legs.slice(0, here + 1);
  const routeCurves: Curve[] = [at(model.spine, 0), ...firstLegs];
  const stops: Stop[] = model.mods.flatMap((md) =>
    md.heads.map((head, index) => {
      const exam = index === md.heads.length - 1;
      const inFirst = md.m === 0;
      return {
        d: exam ? draw.diamond(head, EXAM_RADIUS) : draw.circle(head, STOP_RADIUS),
        state: inFirst && index < here ? "done" : inFirst && index === here ? "here" : "ahead",
        exam,
        module: md.m,
        locked: md.locked === true,
      } satisfies Stop;
    }),
  );

  const opened = fan ? fanOf(first) : null;
  return {
    width,
    height,
    sheets,
    track: model.route.map(({ curve }) => draw.polyline(samples(curve))),
    route: draw.polyline(routeCurves.flatMap(samples)),
    branch: opened ? opened.traces.map((trace) => draw.polyline(samples(trace))) : [],
    stops,
    branchStops: opened ? opened.kids.map((kid) => draw.circle(kid, STOP_RADIUS * 0.72)) : [],
    discs: model.mods.map((md) => {
      const { x, y } = cam.project(v(md.disc.x + DISC_RADIUS * 1.3, md.disc.y, md.disc.z));
      return { d: draw.circle(md.disc, DISC_RADIUS), module: md.m, label: { x: n(x), y: n(y) } };
    }),
    origin: draw.diamond(model.origin, 0.42),
  };
}
