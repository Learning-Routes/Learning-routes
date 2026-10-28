// The landing story's cameras: each panel's framing, its resting camera on a
// stage of a given aspect, and a perspective projection as three.js does it.
import { at } from "./at-index";
import { add, cross, dot, norm, scale, sub, type Vec3, v } from "./landing-curves";
import type { AnchorKey } from "./landing-model";

export const WEIGHTS = [1.1, 1.5, 1.6, 1.5, 1.8, 1.4];
export const PANELS = 6;
export const FOV = 22;
export const PHONE = 860;
const CENTER = [10, 0.9, 12.7];

interface CamParams {
  sub: number[];
  d: number;
  az: number;
  el: number;
  sx: number;
  sy: number;
}

// A panel's camera, resolved: the subject as a point, the distance in world units.
export interface CamPose {
  sub: Vec3;
  d: number;
  az: number;
  el: number;
  sx: number;
  sy: number;
}

export interface StageCamera {
  pos: Vec3;
  tgt: Vec3;
  project: (p: Vec3) => { x: number; y: number; vis: boolean };
  hitPlane: (x: number, y: number, planeY: number) => Vec3;
}

export interface Lay {
  r: number[];
  a?: AnchorKey;
}

// m: the phone framing. sx/sy shift the subject so the text has free paper to sit on.
export const CAMS: (CamParams & { m: Partial<CamParams> })[] = [
  {
    sub: CENTER,
    d: 66,
    az: -76,
    el: 54,
    sx: 0.3,
    sy: -0.24,
    m: { d: 132, az: 8, el: 60, sx: 0, sy: -0.28 },
  },
  {
    sub: CENTER,
    d: 64,
    az: -76,
    el: 48,
    sx: 0.14,
    sy: 0.1,
    m: { d: 124, az: 8, el: 58, sx: 0, sy: -0.24 },
  },
  {
    sub: [8.4, 0.2, 1.2],
    d: 21,
    az: 14,
    el: 52,
    sx: 0,
    sy: 0.14,
    m: { sub: [10, 0.2, 1.2], d: 36, az: 10, el: 56, sx: 0, sy: -0.24 },
  },
  {
    sub: [12.6, 0.25, 2.6],
    d: 19.5,
    az: 18,
    el: 52,
    sx: 0.22,
    sy: 0.06,
    m: { d: 29, az: 12, el: 56, sx: 0, sy: -0.24 },
  },
  {
    sub: [8.6, 0.6, 10.4],
    d: 37,
    az: 10,
    el: 52,
    sx: 0.22,
    sy: 0,
    m: { d: 84, az: 8, el: 58, sx: 0, sy: -0.24 },
  },
  {
    sub: CENTER,
    d: 68,
    az: -74,
    el: 52,
    sx: 0.28,
    sy: -0.2,
    m: { d: 132, az: 8, el: 60, sx: 0, sy: -0.28 },
  },
];
// Where each panel's text would like to sit: r = [left, top, right] as
// fractions of the stage; a = what its line points at.
export const LAY: { d: Lay[]; m: Lay[] } = {
  d: [
    { r: [0.055, 0.12, 0.5] },
    { r: [0.055, 0.62, 0.36], a: "origin" },
    { r: [0.06, 0.6, 0.42], a: "token" },
    { r: [0.05, 0.52, 0.36], a: "fan" },
    { r: [0.045, 0.38, 0.32], a: "exam" },
    { r: [0.055, 0.12, 0.46] },
  ],
  m: [
    { r: [0, 0.04, 1] },
    { r: [0, 0.04, 1], a: "origin" },
    { r: [0, 0.04, 1], a: "token" },
    { r: [0, 0.04, 1], a: "fan" },
    { r: [0, 0.04, 1], a: "exam" },
    { r: [0, 0.04, 1] },
  ],
};
// A longer lens (FOV 22) than the reference's first draft: DK keeps its framing.
const DK = Math.tan((14 * Math.PI) / 180) / Math.tan(((FOV / 2) * Math.PI) / 180);

export const isPhone = (width: number): boolean => width < PHONE;
export const layFor = (i: number, mobile: boolean): Lay => at(mobile ? LAY.m : LAY.d, i);

export function camFor(i: number, mobile: boolean): CamPose {
  const c = at(CAMS, i);
  const o = mobile ? { ...c, ...c.m } : c;
  return {
    sub: v(at(o.sub, 0), at(o.sub, 1), at(o.sub, 2)),
    d: o.d * DK,
    az: o.az,
    el: o.el,
    sx: o.sx,
    sy: o.sy,
  };
}

// The resting camera for P on a stage of this aspect: { pos, tgt }.
export function restFor(P: CamPose, aspect: number): { pos: Vec3; tgt: Vec3 } {
  const az = (P.az * Math.PI) / 180;
  const el = (P.el * Math.PI) / 180;
  const dir = v(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const right = norm(cross(v(0, 1, 0), dir));
  const up = cross(dir, right);
  const hh = P.d * Math.tan(((FOV / 2) * Math.PI) / 180);
  const hw = hh * aspect;
  const tgt = add(add(P.sub, scale(right, -P.sx * hw)), scale(up, -P.sy * hh));
  return { pos: add(tgt, scale(dir, P.d)), tgt };
}

// A perspective camera at pos looking at tgt (three.js's lookAt and projection,
// near .5, far 600) on a Wd × H stage.
export function camera(pos: Vec3, tgt: Vec3, Wd: number, H: number, fov = FOV): StageCamera {
  const zAxis = norm(sub(pos, tgt));
  const xAxis = norm(cross(v(0, 1, 0), zAxis));
  const yAxis = cross(zAxis, xAxis);
  const tan = Math.tan(((fov / 2) * Math.PI) / 180);
  const aspect = Wd / H;
  const near = 0.5;
  const far = 600;
  const project = (p: Vec3) => {
    const d = sub(p, pos);
    const xc = dot(d, xAxis);
    const yc = dot(d, yAxis);
    const zc = dot(d, zAxis);
    const nx = xc / (-zc * tan * aspect);
    const ny = yc / (-zc * tan);
    const nz = ((-(far + near) / (far - near)) * zc - (2 * far * near) / (far - near)) / -zc;
    return { x: ((nx + 1) / 2) * Wd, y: ((1 - ny) / 2) * H, vis: nz > -1 && nz < 1 };
  };
  // The point of the plane y = planeY under screen point (x, y).
  const hitPlane = (x: number, y: number, planeY: number): Vec3 => {
    const nx = (x / Wd) * 2 - 1;
    const ny = 1 - (y / H) * 2;
    const dir = norm(
      add(add(scale(xAxis, nx * tan * aspect), scale(yAxis, ny * tan)), scale(zAxis, -1)),
    );
    return add(pos, scale(dir, (planeY - pos.y) / dir.y));
  };
  return { pos, tgt, project, hitPlane };
}
