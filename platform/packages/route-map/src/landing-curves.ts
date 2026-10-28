// Vectors and curves for the landing's map, as three.js has them: points are plain
// { x, y, z }; a curve is { getPoint(t), getPointAt(u), getLength() }, with
// getPointAt walking it by arc length. Pure: no DOM, no three.js.
import { at } from "./at-index";

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

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => v(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a.x, a.y, a.z));
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));

export { v as vec };

// Arc length by 200 samples, as three.js's Curve does.
const DIVISIONS = 200;

function uToT(lengths: number[], u: number): number {
  const target = clamp(u) * at(lengths, DIVISIONS);
  let lo = 0;
  let hi = DIVISIONS;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(lengths, mid) < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (lo === 0) {
    return 0;
  }
  const before = at(lengths, lo - 1);
  const seg = at(lengths, lo) - before;
  return (lo - 1 + (seg === 0 ? 0 : (target - before) / seg)) / DIVISIONS;
}

function curve(getPoint: (t: number) => Vec3): Curve {
  let cached: number[] | null = null;
  const lengths = (): number[] => {
    if (cached) {
      return cached;
    }
    const built = [0];
    let prev = getPoint(0);
    for (let i = 1; i <= DIVISIONS; i++) {
      const p = getPoint(i / DIVISIONS);
      built.push(at(built, i - 1) + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      prev = p;
    }
    cached = built;
    return built;
  };
  const getPointAt = (u: number): Vec3 => getPoint(uToT(lengths(), u));
  return {
    getPoint,
    lengths,
    getLength: () => at(lengths(), DIVISIONS),
    getPointAt,
    getTangentAt: (u: number) => {
      const a = getPointAt(Math.max(0, u - 1e-4));
      const b = getPointAt(Math.min(1, u + 1e-4));
      return norm(sub(b, a));
    },
  };
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
  const totals = (): number[] => {
    if (!cum) {
      let s = 0;
      cum = parts.map((p) => (s += p.getLength()));
    }
    return cum;
  };
  return Object.assign(
    curve((t) => {
      const c = totals();
      const d = t * at(c, c.length - 1);
      let i = c.findIndex((x) => x >= d);
      if (i < 0) {
        i = c.length - 1;
      }
      const part = at(parts, i);
      const len = part.getLength();
      return part.getPointAt(len === 0 ? 0 : 1 - (at(c, i) - d) / len);
    }),
    { kind: "path", parts },
  );
}
