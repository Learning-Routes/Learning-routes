import { at } from "./at-index";
import { add, cross, dot, normalize, type Point, point, scale, subtract } from "./landing-curves";
import type { LandingModel } from "./landing-model";

// Each panel's camera, and where its text would like to sit (STEP 41 §2.2).

/** How far the scroll stays on each panel. */
export const PANEL_WEIGHTS = [1.1, 1.5, 1.6, 1.5, 1.8, 1.4];
export const PANELS = 6;
export const FIELD_OF_VIEW = 22;
const PHONE_WIDTH = 860;
const CENTER: Triple = [10, 0.9, 12.7];

type Triple = [number, number, number];
type Framing = { subject?: Triple; d: number; az: number; el: number; sx: number; sy: number };

// `phone` is the phone framing. sx and sy shift the subject, leaving free paper for the text.
const FRAMINGS: (Framing & { subject: Triple; phone: Framing })[] = [
  {
    subject: CENTER,
    d: 66,
    az: -76,
    el: 54,
    sx: 0.3,
    sy: -0.24,
    phone: { d: 132, az: 8, el: 60, sx: 0, sy: -0.28 },
  },
  {
    subject: CENTER,
    d: 64,
    az: -76,
    el: 48,
    sx: 0.14,
    sy: 0.1,
    phone: { d: 124, az: 8, el: 58, sx: 0, sy: -0.24 },
  },
  {
    subject: [8.4, 0.2, 1.2],
    d: 21,
    az: 14,
    el: 52,
    sx: 0,
    sy: 0.14,
    phone: { subject: [10, 0.2, 1.2], d: 36, az: 10, el: 56, sx: 0, sy: -0.24 },
  },
  {
    subject: [12.6, 0.25, 2.6],
    d: 19.5,
    az: 18,
    el: 52,
    sx: 0.22,
    sy: 0.06,
    phone: { d: 29, az: 12, el: 56, sx: 0, sy: -0.24 },
  },
  {
    subject: [8.6, 0.6, 10.4],
    d: 37,
    az: 10,
    el: 52,
    sx: 0.22,
    sy: 0,
    phone: { d: 84, az: 8, el: 58, sx: 0, sy: -0.24 },
  },
  {
    subject: CENTER,
    d: 68,
    az: -74,
    el: 52,
    sx: 0.28,
    sy: -0.2,
    phone: { d: 132, az: 8, el: 60, sx: 0, sy: -0.28 },
  },
];

export type AnchorName = "origin" | "token" | "extra" | "exam";
/** `spot` is [left, top, right] as fractions of the stage; `anchor` is what its line points at. */
export type TextSpot = { spot: Triple; anchor?: AnchorName };

const PHONE_SPOT: Triple = [0, 0.04, 1];
const DESKTOP_SPOTS: TextSpot[] = [
  { spot: [0.055, 0.12, 0.5] },
  { spot: [0.055, 0.62, 0.36], anchor: "origin" },
  { spot: [0.06, 0.6, 0.42], anchor: "token" },
  { spot: [0.05, 0.52, 0.36], anchor: "extra" },
  { spot: [0.045, 0.38, 0.32], anchor: "exam" },
  { spot: [0.055, 0.12, 0.46] },
];
const ANCHORS: (AnchorName | undefined)[] = DESKTOP_SPOTS.map(({ anchor }) => anchor);

// A longer lens (22°) than the reference's first draft (28°): this keeps its framing.
const LENS = Math.tan((14 * Math.PI) / 180) / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);

export const isPhone = (width: number) => width < PHONE_WIDTH;

export function spotFor(panel: number, onPhone: boolean): TextSpot {
  const anchor = ANCHORS[panel];
  if (!onPhone) {
    return at(DESKTOP_SPOTS, panel);
  }
  return anchor ? { spot: PHONE_SPOT, anchor } : { spot: PHONE_SPOT };
}

export type CameraShot = {
  subject: Point;
  d: number;
  az: number;
  el: number;
  sx: number;
  sy: number;
};

export function shotFor(panel: number, onPhone: boolean): CameraShot {
  const framing = at(FRAMINGS, panel);
  const chosen = onPhone ? { ...framing, ...framing.phone } : framing;
  const [x, y, z] = chosen.subject;
  return {
    subject: point(x, y, z),
    d: chosen.d * LENS,
    az: chosen.az,
    el: chosen.el,
    sx: chosen.sx,
    sy: chosen.sy,
  };
}

export type RestingCamera = { position: Point; target: Point };

/** The resting camera for a shot on a stage of this aspect. */
export function restingCamera(shot: CameraShot, aspect: number): RestingCamera {
  const az = (shot.az * Math.PI) / 180;
  const el = (shot.el * Math.PI) / 180;
  const direction = point(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const right = normalize(cross(point(0, 1, 0), direction));
  const up = cross(direction, right);
  const halfHeight = shot.d * Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
  const halfWidth = halfHeight * aspect;
  const target = add(
    add(shot.subject, scale(right, -shot.sx * halfWidth)),
    scale(up, -shot.sy * halfHeight),
  );
  return { position: add(target, scale(direction, shot.d)), target };
}

export type Projected = { x: number; y: number; isVisible: boolean };
export type StageCamera = {
  project: (p: Point) => Projected;
  hitPlane: (x: number, y: number, planeY: number) => Point;
};

/** A perspective camera, as three.js's lookAt and projection (near .5, far 600). */
export function stageCamera(
  { position, target }: RestingCamera,
  width: number,
  height: number,
): StageCamera {
  const zAxis = normalize(subtract(position, target));
  const xAxis = normalize(cross(point(0, 1, 0), zAxis));
  const yAxis = cross(zAxis, xAxis);
  const tan = Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
  const aspect = width / height;
  const near = 0.5;
  const far = 600;
  return {
    project(p) {
      const d = subtract(p, position);
      const zc = dot(d, zAxis);
      const nx = dot(d, xAxis) / (-zc * tan * aspect);
      const ny = dot(d, yAxis) / (-zc * tan);
      const nz = ((-(far + near) / (far - near)) * zc - (2 * far * near) / (far - near)) / -zc;
      return {
        x: ((nx + 1) / 2) * width,
        y: ((1 - ny) / 2) * height,
        isVisible: nz > -1 && nz < 1,
      };
    },
    // The point of the plane y = planeY under a screen point.
    hitPlane(x, y, planeY) {
      const nx = (x / width) * 2 - 1;
      const ny = 1 - (y / height) * 2;
      const direction = normalize(
        add(add(scale(xAxis, nx * tan * aspect), scale(yAxis, ny * tan)), scale(zAxis, -1)),
      );
      return add(position, scale(direction, (planeY - position.y) / direction.y));
    },
  };
}

export const planeOf = (model: LandingModel) => model.modules[0].surfaceY + 0.012;

export function anchorPoint(model: LandingModel, name: AnchorName, token?: Point): Point {
  const anchors: Record<AnchorName, Point> = {
    origin: model.origin,
    token: token ?? at(model.modules[0].heads, 2),
    extra: at(model.extra.stops, 0),
    exam: model.examPosition,
  };
  return anchors[name];
}
