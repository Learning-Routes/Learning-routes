// STEP 41 §2 — the landing's map as a model. The geometry is the approved
// reference's (tmp/redesign/mapa-anotado): WP-37b's map as a scale model, in world
// units, the sheets lying on the XZ plane. The landing's controller draws it with
// three.js from these same curves.
import { at } from "./at-index";
import { type Curve, cubic, line, path, quad, type Vec3, v } from "./landing-curves";

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

// Reinforcement under head h: three kids and the rounded traces to them.
function buildFan(h: Vec3, top: number): Fan {
  const street = h.z + 2.1;
  const r2 = 0.38;
  const kids = [-2, 0, 2].map((dx) => v(h.x + dx, top, h.z + 3.4));
  const traces = kids.map((c) => {
    const a = v(h.x, top, h.z + 0.7);
    const end = v(c.x, top, c.z - 0.45);
    if (Math.abs(c.x - h.x) < 0.01) {
      return path([line(a, end)]);
    }
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
  return { head: h, kids, traces };
}

// One module: its heads in snake order, its disc, the legs between them, its fan.
function buildModule(d: ModDef, m: number) {
  const top = d.y + T;
  const heads: Vec3[] = [];
  for (let i = 0; i < d.n; i++) {
    const r = Math.floor(i / 4);
    const j = i % 4;
    heads.push(v(r % 2 === 0 ? at(SX, j) : at(SX, 3 - j), top, at(d.rows, r) + (j % 2 ? WAVE : 0)));
  }
  const disc = v(0, top, d.disc);
  const legs: Curve[] = [bend(disc, at(heads, 0))];
  for (let i = 1; i < heads.length; i++) {
    const a = at(heads, i - 1);
    const b = at(heads, i);
    legs.push(Math.floor(i / 4) === Math.floor((i - 1) / 4) ? bend(a, b) : uturn(a, b));
  }
  const fan = d.fanAt != null ? buildFan(at(heads, d.fanAt), top) : null;
  return { ...d, m, topY: top, heads, disc, legs, fan };
}

type MapModule = ReturnType<typeof buildModule>;

// The first module's fan: the model always has one (MODDEF's fanAt).
export function fanOf(mod: MapModule): Fan {
  if (!mod.fan) {
    throw new Error(`landing map: module ${mod.m} has no fan`);
  }
  return mod.fan;
}

// The map, once: modules (heads, disc, legs, fan), the origin, the spine, the
// pin's itinerary and every leg the route draws, in route order.
export function buildModel() {
  const mods = MODDEF.map(buildModule);
  const M1 = at(mods, 0);
  const M2 = at(mods, 1);
  const M3 = at(mods, 2);
  const origin = v(0, M1.topY, -6.4);
  const spine = [
    line(origin, M1.disc),
    cubic(M1.disc, v(0, M1.topY, M1.disc.z + 9), v(0, M2.topY, M2.disc.z - 6), M2.disc),
    cubic(M2.disc, v(0, M2.topY, M2.disc.z + 7), v(0, M3.topY, M3.disc.z - 5), M3.disc),
  ];
  const fan = fanOf(M1);
  const t0 = at(fan.traces, 0);
  const fanGo = path([line(fan.head, t0.getPoint(0)), t0, line(t0.getPoint(1), at(fan.kids, 0))]);
  const examPos = at(M1.heads, 5);
  const jump = quad(
    examPos,
    v((examPos.x + M2.disc.x) / 2, M2.topY + 5.5, (examPos.z + M2.disc.z) / 2),
    M2.disc,
  );
  const back = { getPointAt: (u: number) => fanGo.getPointAt(1 - u) };
  const itinerary = [
    at(M1.legs, 1),
    at(M1.legs, 2),
    fanGo,
    back,
    at(M1.legs, 3),
    at(M1.legs, 4),
    at(M1.legs, 5),
    jump,
    at(M2.legs, 0),
  ];
  // Route order: spine leg, then that module's legs.
  const route: { curve: Curve; m: number; spine: boolean }[] = [];
  mods.forEach((md, m) => {
    route.push({ curve: at(spine, m), m, spine: true });
    md.legs.forEach((c) => {
      route.push({ curve: c, m, spine: false });
    });
  });
  return { mods, origin, spine, fanGo, examPos, jump, itinerary, route };
}

export type Model = ReturnType<typeof buildModel>;

export type AnchorKey = "origin" | "token" | "fan" | "exam";

export const planeOf = (model: Model): number => at(model.mods, 0).topY + 0.012;

export function anchorOf(model: Model, key: AnchorKey, token?: Vec3): Vec3 {
  const first = at(model.mods, 0);
  return {
    origin: model.origin,
    token: token || at(first.heads, 2),
    fan: at(fanOf(first).kids, 0),
    exam: model.examPos,
  }[key];
}
