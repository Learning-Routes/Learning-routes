// STEP 41 §2 — the landing's map and where its text sits. Pure: no DOM, no three.js.
//
// The geometry is the approved reference's (tmp/redesign/mapa-anotado): WP-37b's
// map as a scale model, in world units, the sheets lying on the XZ plane. The
// landing's controller draws it with three.js from these same curves; this module
// answers the owner's main point (§2.2): each chapter's text sits on a free spot
// of the map, never over the map, its names or the controls.
//
// Points are plain { x, y, z }. A curve is { getPoint(t), getPointAt(u),
// getLength() }, with getPointAt walking it by arc length, as three.js does.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Curve {
  getPoint(t: number): Vec3;
  lengths(): number[];
  getLength(): number;
  getPointAt(u: number): Vec3;
  getTangentAt(u: number): Vec3;
}

interface ModDef {
  y: number;
  top: number;
  disc: number;
  rows: number[];
  n: number;
  fanAt?: number;
  bottom: number;
  locked?: boolean;
}

interface Fan {
  head: Vec3;
  kids: Vec3[];
  traces: Curve[];
}

// ── Geometry (the reference's constants) ───────────────────────────────
export const SX = [4.2, 8.4, 12.6, 16.8];
export const GUT = 19.4;
export const RB = 1.1;
export const WAVE = 0.8;
export const KT = 0.55;
export const T = 0.2;
export const SHEET_X = [-1.8, 21.2];
export const MODDEF: ModDef[] = [
  { y: 0, top: -3.8, disc: -2.4, rows: [0, 7.0], n: 6, fanAt: 2, bottom: 10.2 },
  { y: 0.9, top: 12.6, disc: 13.8, rows: [16.0, 20.6], n: 5, bottom: 23.0 },
  { y: 1.8, top: 25.4, disc: 26.6, rows: [28.8], n: 4, bottom: 31.8, locked: true },
];

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, k: number): Vec3 => v(a.x * k, a.y * k, a.z * k);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a.x, a.y, a.z));
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));

export { v as vec };

// Arc length by 200 samples, as three.js's Curve does.
const DIVISIONS = 200;
function curve(getPoint: (t: number) => Vec3): Curve {
  let lengths: number[] | null = null;
  const c = { getPoint } as Curve;
  c.lengths = () => {
    if (lengths) return lengths;
    lengths = [0];
    let prev = getPoint(0);
    for (let i = 1; i <= DIVISIONS; i++) {
      const p = getPoint(i / DIVISIONS);
      lengths.push(lengths[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      prev = p;
    }
    return lengths;
  };
  c.getLength = () => c.lengths()[DIVISIONS];
  c.getPointAt = (u: number) => getPoint(uToT(c.lengths(), u));
  c.getTangentAt = (u: number) => {
    const a = c.getPointAt(Math.max(0, u - 1e-4));
    const b = c.getPointAt(Math.min(1, u + 1e-4));
    return norm(sub(b, a));
  };
  return c;
}

function uToT(lengths: number[], u: number): number {
  const target = clamp(u) * lengths[DIVISIONS];
  let lo = 0;
  let hi = DIVISIONS;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const before = lengths[lo - 1];
  const seg = lengths[lo] - before;
  return (lo - 1 + (seg === 0 ? 0 : (target - before) / seg)) / DIVISIONS;
}

export const line = (a: Vec3, b: Vec3) =>
  Object.assign(
    curve((t) => lerp3(a, b, t)),
    { kind: "line", points: [a, b] },
  );
export const quad = (a: Vec3, b: Vec3, c: Vec3) =>
  Object.assign(
    curve((t) => {
      const s = 1 - t;
      return add(add(scale(a, s * s), scale(b, 2 * s * t)), scale(c, t * t));
    }),
    { kind: "quad", points: [a, b, c] },
  );
export const cubic = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
  Object.assign(
    curve((t) => {
      const s = 1 - t;
      return add(
        add(scale(a, s * s * s), scale(b, 3 * s * s * t)),
        add(scale(c, 3 * s * t * t), scale(d, t * t * t)),
      );
    }),
    { kind: "cubic", points: [a, b, c, d] },
  );

// A chain of curves walked by length, as three.js's CurvePath.getPoint.
export function path(parts: Curve[]) {
  let cum: number[] | null = null;
  const totals = () => {
    if (!cum) {
      let s = 0;
      cum = parts.map((p) => (s += p.getLength()));
    }
    return cum;
  };
  return Object.assign(
    curve((t) => {
      const c = totals();
      const d = t * c[c.length - 1];
      let i = c.findIndex((x) => x >= d);
      if (i < 0) i = c.length - 1;
      const len = parts[i].getLength();
      return parts[i].getPointAt(len === 0 ? 0 : 1 - (c[i] - d) / len);
    }),
    { kind: "path", parts },
  );
}

const bend = (a: Vec3, b: Vec3) => {
  const dx = b.x - a.x;
  return cubic(a, v(a.x + KT * dx, a.y, a.z), v(b.x - KT * dx, b.y, b.z), b);
};
function uturn(a: Vec3, b: Vec3) {
  const k = 0.5523 * RB;
  const p1 = v(GUT - RB, a.y, a.z);
  const p2 = v(GUT, a.y, a.z + RB);
  const p3 = v(GUT, b.y, b.z - RB);
  const p4 = v(GUT - RB, b.y, b.z);
  return path([
    line(a, p1),
    cubic(p1, v(p1.x + k, a.y, a.z), v(GUT, a.y, p2.z - k), p2),
    line(p2, p3),
    cubic(p3, v(GUT, b.y, p3.z + k), v(p4.x + k, b.y, b.z), p4),
    line(p4, b),
  ]);
}

// The map, once: modules (heads, disc, legs, fan), the origin, the spine, the
// pin's itinerary and every leg the route draws, in route order.
export function buildModel() {
  const mods = MODDEF.map((d, m) => {
    const top = d.y + T;
    const heads: Vec3[] = [];
    for (let i = 0; i < d.n; i++) {
      const r = Math.floor(i / 4);
      const j = i % 4;
      heads.push(v(r % 2 === 0 ? SX[j] : SX[3 - j], top, d.rows[r] + (j % 2 ? WAVE : 0)));
    }
    const disc = v(0, top, d.disc);
    const legs: Curve[] = [bend(disc, heads[0])];
    for (let i = 1; i < heads.length; i++) {
      legs.push(
        Math.floor(i / 4) === Math.floor((i - 1) / 4)
          ? bend(heads[i - 1], heads[i])
          : uturn(heads[i - 1], heads[i]),
      );
    }
    let fan: Fan | null = null;
    if (d.fanAt != null) {
      const h = heads[d.fanAt];
      const street = h.z + 2.1;
      const r2 = 0.38;
      const kids = [-2, 0, 2].map((dx) => v(h.x + dx, top, h.z + 3.4));
      const traces = kids.map((c) => {
        const a = v(h.x, top, h.z + 0.7);
        const end = v(c.x, top, c.z - 0.45);
        if (Math.abs(c.x - h.x) < 0.01) return path([line(a, end)]);
        const s = Math.sign(c.x - h.x);
        const b1 = v(h.x, top, street - r2);
        const b2 = v(h.x + s * r2, top, street);
        const b3 = v(c.x - s * r2, top, street);
        const b4 = v(c.x, top, street + r2);
        return path([
          line(a, b1),
          quad(b1, v(h.x, top, street), b2),
          line(b2, b3),
          quad(b3, v(c.x, top, street), b4),
          line(b4, end),
        ]);
      });
      fan = { head: h, kids, traces };
    }
    return { ...d, m, topY: top, heads, disc, legs, fan };
  });
  const [M1, M2, M3] = mods;
  const origin = v(0, M1.topY, -6.4);
  const spine = [
    line(origin, M1.disc),
    cubic(M1.disc, v(0, M1.topY, M1.disc.z + 9), v(0, M2.topY, M2.disc.z - 6), M2.disc),
    cubic(M2.disc, v(0, M2.topY, M2.disc.z + 7), v(0, M3.topY, M3.disc.z - 5), M3.disc),
  ];
  const t0 = (M1.fan as Fan).traces[0];
  const fanGo = path([
    line((M1.fan as Fan).head, t0.getPoint(0)),
    t0,
    line(t0.getPoint(1), (M1.fan as Fan).kids[0]),
  ]);
  const examPos = M1.heads[5];
  const jump = quad(
    examPos,
    v((examPos.x + M2.disc.x) / 2, M2.topY + 5.5, (examPos.z + M2.disc.z) / 2),
    M2.disc,
  );
  const back = { getPointAt: (u: number) => fanGo.getPointAt(1 - u) };
  const itinerary = [
    M1.legs[1],
    M1.legs[2],
    fanGo,
    back,
    M1.legs[3],
    M1.legs[4],
    M1.legs[5],
    jump,
    M2.legs[0],
  ];
  // Route order: spine leg, then that module's legs.
  const route: { curve: Curve; m: number; spine: boolean }[] = [];
  mods.forEach((md, m) => {
    route.push({ curve: spine[m], m, spine: true });
    md.legs.forEach((c) => {
      route.push({ curve: c, m, spine: false });
    });
  });
  return { mods, origin, spine, fanGo, examPos, jump, itinerary, route };
}

// ── The story's cameras ─────────────────────────────────────────────────
export const WEIGHTS = [1.1, 1.5, 1.6, 1.5, 1.8, 1.4];
export const CHAPTERS = 6;
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

// A chapter's camera, resolved: the subject as a point, the distance in world units.
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

type AnchorKey = "origin" | "token" | "fan" | "exam";

interface Lay {
  r: number[];
  a?: AnchorKey;
}

export interface Obstacle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  wt: number;
}

export interface Slot {
  sc: number;
  x: number;
  y: number;
  hits: number;
}

export type Model = ReturnType<typeof buildModel>;
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
// Where each chapter's text would like to sit: r = [left, top, right] as
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
export const layFor = (i: number, mobile: boolean): Lay => (mobile ? LAY.m : LAY.d)[i];

export function camFor(i: number, mobile: boolean): CamPose {
  const c = CAMS[i];
  const o = mobile ? { ...c, ...c.m } : c;
  return {
    sub: v(o.sub[0], o.sub[1], o.sub[2]),
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

export const planeOf = (model: Model): number => model.mods[0].topY + 0.012;

export function anchorOf(model: Model, key: AnchorKey, token?: Vec3): Vec3 {
  return {
    origin: model.origin,
    token: token || model.mods[0].heads[2],
    fan: (model.mods[0].fan as Fan).kids[0],
    exam: model.examPos,
  }[key];
}

// ── What the text must not cover, seen from chapter i's resting camera ──
// Weighted boxes in stage pixels: stops with the room for their names, the
// module discs and chips, the origin and the root title, samples along every leg
// and the fan, the sheets' edges, and the stage's controls.
export function obstaclesFor(
  model: Model,
  i: number,
  cam: StageCamera,
  mobile: boolean,
  Wd: number,
  H: number,
): Obstacle[] {
  const O: Obstacle[] = [];
  const P = cam.project;
  const radius = (p: Vec3, r: number): number => {
    const a = P(p);
    const b = P(v(p.x + r, p.y, p.z));
    const c = P(v(p.x, p.y, p.z + r));
    return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  };
  const box = (x: number, y: number, hw: number, hh: number, wt: number) =>
    O.push({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh, wt });
  const names = i >= 1 && i <= 4; // step names only show while travelling
  const named = (p: Vec3, r: number, wt: number): void => {
    const c = P(p);
    const rr = radius(p, r);
    box(c.x, c.y, rr + 4, rr + 4, wt);
    if (names) O.push({ x0: c.x - 66, y0: c.y + rr, x1: c.x + 66, y1: c.y + rr + 36, wt: 2 });
  };
  const [M1, M2, M3] = model.mods;
  [...M1.heads, ...M2.heads].forEach((p) => {
    named(p, 0.62, 3);
  });
  M3.heads.forEach((p) => {
    named(p, 0.5, 2);
  });
  model.mods.forEach((md) => {
    named(md.disc, 0.82, 3);
    const ch = P(v(-0.6, md.topY, md.top + 0.2));
    O.push({ x0: ch.x - 14, y0: ch.y - 16, x1: ch.x + 184, y1: ch.y + 16, wt: 2 });
  });
  {
    const c = P(model.origin);
    box(c.x, c.y, 18, 18, 3);
    if (i === 1 || i === 5)
      O.push({ x0: c.x - 50, y0: c.y - 72, x1: c.x + 240, y1: c.y - 8, wt: 2 });
  }
  model.route.forEach((r) => {
    const n = Math.max(4, Math.ceil(r.curve.getLength() * 1.4));
    for (let k = 0; k <= n; k++) {
      const c = P(r.curve.getPointAt(k / n));
      box(c.x, c.y, 7, 7, 1);
    }
  });
  if (i >= 3) {
    (M1.fan as Fan).traces.forEach((t) => {
      for (let k = 0; k <= 12; k++) {
        const c = P(t.getPointAt(k / 12));
        box(c.x, c.y, 7, 7, 1);
      }
    });
    (M1.fan as Fan).kids.forEach((p) => {
      named(p, 0.4, 3);
    });
  }
  model.mods.forEach((md) => {
    const [x0, x1] = SHEET_X;
    const y = md.topY;
    const corners = [v(x0, y, md.top), v(x1, y, md.top), v(x1, y, md.bottom), v(x0, y, md.bottom)];
    corners.forEach((a, k) => {
      const b = corners[(k + 1) % 4];
      for (let s = 0; s <= 28; s++) {
        const c = P(lerp3(a, b, s / 28));
        box(c.x, c.y, 5, 5, 1);
      }
    });
  });
  if (i >= 1) {
    if (mobile) O.push({ x0: 0, y0: H - 76, x1: Wd, y1: H, wt: 6 });
    else {
      O.push({ x0: 0, y0: 0, x1: Wd, y1: 68, wt: 6 });
      O.push({ x0: Wd - 50, y0: H / 2 - 110, x1: Wd, y1: H / 2 + 110, wt: 6 });
    }
  }
  return O;
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
  for (const [a, b, c, d] of shape) {
    const X0 = x + a - pad;
    const Y0 = y + b - pad;
    const X1 = x + c + pad;
    const Y1 = y + d + pad;
    for (const o of O) if (o.x1 > X0 && o.x0 < X1 && o.y1 > Y0 && o.y0 < Y1) hits += o.wt;
  }
  return hits;
}

const nearAnchor = (
  anc: { x: number; y: number } | null,
  X0: number,
  Y0: number,
  X1: number,
  Y1: number,
) => anc && anc.x > X0 - 30 && anc.x < X1 + 30 && anc.y > Y0 - 30 && anc.y < Y1 + 30;

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
  const m = mobile ? 20 : 32;
  const top = i === 0 || mobile ? 20 : 80;
  const bot = mobile && i ? 84 : 24;
  const pad = mobile ? 10 : 18;
  const dx = mobile ? 20 : L.r[0] * Wd;
  const dy = L.r[1] * H;
  const anc = L.a ? cam.project(anchorOf(model, L.a)) : null;
  const xs: number[] = [];
  if (mobile) xs.push(20);
  else for (let x = m; x <= Wd - m - w; x += 12) xs.push(x);
  let best: Slot | null = null;
  for (const x of xs) {
    for (let y = top; y <= Math.max(top, H - bot - h); y += 8) {
      let hits = shapeHits(O, shape, x, y, pad);
      if (nearAnchor(anc, x - pad, y - pad, x + w + pad, y + h + pad)) hits += 20;
      let sc = hits * 1000 + Math.hypot(x - dx, (y - dy) * 1.3) * 0.6;
      if (anc) sc += Math.max(0, Math.hypot(anc.x - (x + w / 2), anc.y - (y + h / 2)) - 300) * 0.3;
      if (!best || sc < best.sc) best = { sc, x, y, hits };
    }
  }
  return best;
}

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
  const x0 = mobile ? 20 : L.r[0] * Wd;
  const y0 = L.r[1] * H;
  const anc = L.a ? cam.project(anchorOf(model, L.a)) : null;
  let best = Infinity;
  for (const [dx, dy] of [
    [0, 0],
    [0, -24],
    [0, 24],
    [24, 0],
    [0, -48],
    [0, 48],
  ]) {
    const X0 = x0 + dx - pad;
    const Y0 = Math.max(20, y0 + dy) - pad;
    const X1 = X0 + w + 2 * pad;
    const Y1 = Y0 + h + 2 * pad;
    let hits = shapeHits(O, shape, X0 + pad, Y0 + pad, pad);
    if (Y1 > H - (mobile && i ? 76 : 10) || X1 > Wd - 10) hits += 50;
    if (nearAnchor(anc, X0, Y0, X1, Y1)) hits += 20;
    best = Math.min(best, hits);
  }
  return best;
}

// The text's width on this stage (its height then comes from the page).
export function textWidth(i: number, Wd: number): number {
  const mobile = isPhone(Wd);
  const L = layFor(i, mobile);
  return Math.round(mobile ? Wd - 40 : Math.max(360, (L.r[2] - L.r[0]) * Wd));
}

const SHIFTS = {
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

// Chapter i on a Wd × H stage with text w × h of this shape: if its designed spot
// is not clear, the camera gives way (pulls back ×1.0 to ×1.55 and slides) until
// it is; then the text takes the free slot nearest the designed one.
// → { params, rest: { pos, tgt }, slot, anchor, d }
export function layoutChapter(
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
  let chosen = base;
  let bestHits = Infinity;
  search: for (const dm of DISTANCES) {
    for (const [ax, ay] of SHIFTS[mobile ? "m" : "d"]) {
      const P = { ...base, d: base.d * dm, sx: base.sx + ax, sy: base.sy + ay };
      const r = restFor(P, Wd / H);
      const hits =
        hitsNear(model, i, camera(r.pos, r.tgt, Wd, H), mobile, Wd, H, w, h, shape) + (dm - 1) * 4;
      if (hits < bestHits) {
        bestHits = hits;
        chosen = P;
      }
      if (hits < (dm - 1) * 4 + 0.5) break search;
    }
  }
  const rest = restFor(chosen, Wd / H);
  const cam = camera(rest.pos, rest.tgt, Wd, H);
  const slot = bestSlot(model, i, cam, mobile, Wd, H, w, h, shape) as Slot;
  return {
    params: chosen,
    rest,
    slot,
    anchor: cam.hitPlane(slot.x, slot.y, planeOf(model)),
    d: chosen.d / base.d,
  };
}
