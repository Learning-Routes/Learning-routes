// Points along a path of the route map's own grammar (paths.ts), at most `step`
// px apart. GRAMMAR: absolute M L C Q A only, numbers separated by single spaces,
// one M per path. samplePath reads exactly this grammar and throws on anything else.
import type { XY } from "./layout-model";

const WHITESPACE = /\s+/;

function cubicAt(p0: XY, c1: XY, c2: XY, p1: XY, t: number): XY {
  const u = 1 - t;
  const along = (i: 0 | 1): number =>
    u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p1[i];
  return [along(0), along(1)];
}

function quadAt(p0: XY, c: XY, p1: XY, t: number): XY {
  const u = 1 - t;
  const along = (i: 0 | 1): number => u * u * p0[i] + 2 * u * t * c[i] + t * t * p1[i];
  return [along(0), along(1)];
}

function polylineLength(at: (t: number) => XY): number {
  let len = 0;
  let prev = at(0);
  for (let i = 1; i <= 64; i++) {
    const p = at(i / 64);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

function pushLine(points: XY[], from: XY, to: XY, step: number): void {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.max(1, Math.ceil(length / step - 1e-9));
  for (let i = 1; i < n; i++) {
    points.push([from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
  }
  points.push(to);
}

// A quarter circle of radius r from `from` to `to`, as a function of t in [0, 1].
function quarterArc(from: XY, to: XY, r: number, sweep: number, d: string): (t: number) => XY {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(Math.hypot(dx, dy) - r * Math.SQRT2) > 1e-6) {
    throw new Error(`samplePath: only quarter-circle arcs, in ${d}`);
  }
  // S − C = v; E − C is v turned 90° in the sweep's direction.
  const [vx, vy] = sweep === 1 ? [(dy - dx) / 2, -(dx + dy) / 2] : [-(dx + dy) / 2, (dx - dy) / 2];
  const centre: XY = [from[0] - vx, from[1] - vy];
  const a0 = Math.atan2(vy, vx);
  const turn = sweep === 1 ? Math.PI / 2 : -Math.PI / 2;
  return (t: number): XY => [
    centre[0] + r * Math.cos(a0 + turn * t),
    centre[1] + r * Math.sin(a0 + turn * t),
  ];
}

// One drawing command after M: the curve from `from` it describes, read from the tokens.
function readCommand(
  op: string | undefined,
  from: XY,
  num: () => number,
  d: string,
): { to: XY; line: true } | { to: XY; line: false; at: (t: number) => XY; length: number } {
  if (op === "L") {
    return { to: [num(), num()], line: true };
  }
  if (op === "C") {
    const c1: XY = [num(), num()];
    const c2: XY = [num(), num()];
    const to: XY = [num(), num()];
    const at = (t: number) => cubicAt(from, c1, c2, to, t);
    return { to, line: false, at, length: polylineLength(at) };
  }
  if (op === "Q") {
    const c: XY = [num(), num()];
    const to: XY = [num(), num()];
    const at = (t: number) => quadAt(from, c, to, t);
    return { to, line: false, at, length: polylineLength(at) };
  }
  if (op === "A") {
    const r = num();
    num();
    num();
    num(); // ry, rotation, large-arc: this grammar's arcs are quarter circles
    const sweep = num();
    const to: XY = [num(), num()];
    return { to, line: false, at: quarterArc(from, to, r, sweep, d), length: (r * Math.PI) / 2 };
  }
  throw new Error(`samplePath: unsupported command ${op} in ${d}`);
}

export function samplePath(d: string, step = 3): XY[] {
  const tokens = String(d).trim().split(WHITESPACE);
  const points: XY[] = [];
  let point: XY | null = null;
  const num = (): number => {
    const v = Number(tokens.shift());
    if (!Number.isFinite(v)) {
      throw new Error(`samplePath: bad number in ${d}`);
    }
    return v;
  };
  while (tokens.length) {
    const op = tokens.shift();
    if (op === "M") {
      point = [num(), num()];
      points.push(point);
      continue;
    }
    if (point === null) {
      throw new Error(`samplePath: ${op} before the path's M, in ${d}`);
    }
    const command = readCommand(op, point, num, d);
    if (command.line) {
      pushLine(points, point, command.to, step);
    } else {
      const n = Math.max(1, Math.ceil((2 * command.length) / step));
      for (let i = 1; i < n; i++) {
        points.push(command.at(i / n));
      }
      points.push(command.to);
    }
    point = command.to;
  }
  return points;
}
