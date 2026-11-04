// The landing map's points and curves. Pure: no DOM, no three.js. Ported from v1's
// app/javascript/lib/landing_placement.js (STEP 41 §2). A curve walks by arc length, as
// three.js's does, so the page and its tests share one geometry.

export type Point = { x: number; y: number; z: number };

export type LandingCurve = {
  getPoint: (t: number) => Point;
  getPointAt: (u: number) => Point;
  getTangentAt: (u: number) => Point;
  getLength: () => number;
};

export const point = (x: number, y: number, z: number): Point => ({ x, y, z });
export const add = (a: Point, b: Point) => point(a.x + b.x, a.y + b.y, a.z + b.z);
export const subtract = (a: Point, b: Point) => point(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Point, k: number) => point(a.x * k, a.y * k, a.z * k);
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Point, b: Point) =>
  point(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const normalize = (a: Point) => scale(a, 1 / Math.hypot(a.x, a.y, a.z));
export const between = (a: Point, b: Point, t: number) =>
  point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const clamp = (x: number, low = 0, high = 1) => Math.min(high, Math.max(low, x));

// Arc length by 200 samples, as three.js's Curve does.
const DIVISIONS = 200;

function parameterAt(lengths: number[], u: number): number {
  const total = lengths[DIVISIONS] ?? 0;
  const target = clamp(u) * total;
  let low = 0;
  let high = DIVISIONS;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((lengths[middle] ?? 0) < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  if (low === 0) {
    return 0;
  }
  const before = lengths[low - 1] ?? 0;
  const segment = (lengths[low] ?? 0) - before;
  return (low - 1 + (segment === 0 ? 0 : (target - before) / segment)) / DIVISIONS;
}

function sampledLengths(getPoint: (t: number) => Point): number[] {
  const lengths = [0];
  let previous = getPoint(0);
  let sum = 0;
  for (let i = 1; i <= DIVISIONS; i++) {
    const next = getPoint(i / DIVISIONS);
    sum += Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z);
    lengths.push(sum);
    previous = next;
  }
  return lengths;
}

function curve(getPoint: (t: number) => Point): LandingCurve {
  let cached: number[] | null = null;
  const lengths = () => {
    cached ??= sampledLengths(getPoint);
    return cached;
  };
  const getPointAt = (u: number) => getPoint(parameterAt(lengths(), u));
  return {
    getPoint,
    getPointAt,
    getLength: () => lengths()[DIVISIONS] ?? 0,
    getTangentAt: (u) =>
      normalize(subtract(getPointAt(Math.min(1, u + 1e-4)), getPointAt(Math.max(0, u - 1e-4)))),
  };
}

export const line = (a: Point, b: Point) => curve((t) => between(a, b, t));

export const quadratic = (a: Point, b: Point, c: Point) =>
  curve((t) => {
    const s = 1 - t;
    return add(add(scale(a, s * s), scale(b, 2 * s * t)), scale(c, t * t));
  });

export const cubic = (a: Point, b: Point, c: Point, d: Point) =>
  curve((t) => {
    const s = 1 - t;
    return add(
      add(scale(a, s * s * s), scale(b, 3 * s * s * t)),
      add(scale(c, 3 * s * t * t), scale(d, t * t * t)),
    );
  });

/** A chain of curves walked by length, as three.js's CurvePath.getPoint. */
export function chain(parts: LandingCurve[]): LandingCurve {
  let cumulative: number[] | null = null;
  const totals = () => {
    let sum = 0;
    cumulative ??= parts.map((part) => {
      sum += part.getLength();
      return sum;
    });
    return cumulative;
  };
  return curve((t) => {
    const sums = totals();
    const distance = t * (sums[sums.length - 1] ?? 0);
    const found = sums.findIndex((sum) => sum >= distance);
    const index = found < 0 ? sums.length - 1 : found;
    const part = parts[index];
    if (!part) {
      throw new RangeError("landing map: an empty chain of curves");
    }
    const length = part.getLength();
    return part.getPointAt(length === 0 ? 0 : 1 - ((sums[index] ?? 0) - distance) / length);
  });
}
