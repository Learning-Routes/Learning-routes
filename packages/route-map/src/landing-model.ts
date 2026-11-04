import { at } from "./at-index";
import {
  chain,
  cubic,
  type LandingCurve,
  line,
  type Point,
  point,
  quadratic,
} from "./landing-curves";

// The landing's map, as a scale model in world units with its sheets on the XZ plane:
// the approved STEP 41 reference, from v1's landing_placement.js. Its values are the
// reference's: change one and the placement tests say what moved.

const COLUMNS = [4.2, 8.4, 12.6, 16.8];
const GUTTER = 19.4;
const TURN_RADIUS = 1.1;
const WAVE = 0.8;
const BEND = 0.55;
export const SHEET_THICKNESS = 0.2;
export const SHEET_X: readonly [number, number] = [-1.8, 21.2];

type ModuleShape = {
  y: number;
  top: number;
  disc: number;
  rows: number[];
  stops: number;
  extraAt?: number;
  bottom: number;
  isLocked?: boolean;
};

const MODULE_SHAPES: ModuleShape[] = [
  { y: 0, top: -3.8, disc: -2.4, rows: [0, 7.0], stops: 6, extraAt: 2, bottom: 10.2 },
  { y: 0.9, top: 12.6, disc: 13.8, rows: [16.0, 20.6], stops: 5, bottom: 23.0 },
  { y: 1.8, top: 25.4, disc: 26.6, rows: [28.8], stops: 4, bottom: 31.8, isLocked: true },
];

export type ExtraPractice = { head: Point; stops: Point[]; traces: LandingCurve[] };

export type MapModule = {
  top: number;
  bottom: number;
  isLocked: boolean;
  surfaceY: number;
  heads: Point[];
  disc: Point;
  legs: LandingCurve[];
  extra: ExtraPractice | null;
};

export type RouteLeg = { curve: LandingCurve; moduleIndex: number; isSpine: boolean };

export type LandingModel = {
  modules: [MapModule, MapModule, MapModule];
  origin: Point;
  examPosition: Point;
  extra: ExtraPractice;
  itinerary: { getPointAt: (u: number) => Point }[];
  route: RouteLeg[];
};

function bend(a: Point, b: Point) {
  const dx = b.x - a.x;
  return cubic(a, point(a.x + BEND * dx, a.y, a.z), point(b.x - BEND * dx, b.y, b.z), b);
}

function uTurn(a: Point, b: Point) {
  const k = 0.5523 * TURN_RADIUS;
  const p1 = point(GUTTER - TURN_RADIUS, a.y, a.z);
  const p2 = point(GUTTER, a.y, a.z + TURN_RADIUS);
  const p3 = point(GUTTER, b.y, b.z - TURN_RADIUS);
  const p4 = point(GUTTER - TURN_RADIUS, b.y, b.z);
  return chain([
    line(a, p1),
    cubic(p1, point(p1.x + k, a.y, a.z), point(GUTTER, a.y, p2.z - k), p2),
    line(p2, p3),
    cubic(p3, point(GUTTER, b.y, p3.z + k), point(p4.x + k, b.y, b.z), p4),
    line(p4, b),
  ]);
}

function extraPractice(head: Point, top: number): ExtraPractice {
  const street = head.z + 2.1;
  const radius = 0.38;
  const stops = [-2, 0, 2].map((dx) => point(head.x + dx, top, head.z + 3.4));
  const traces = stops.map((stop) => {
    const start = point(head.x, top, head.z + 0.7);
    const end = point(stop.x, top, stop.z - 0.45);
    if (Math.abs(stop.x - head.x) < 0.01) {
      return chain([line(start, end)]);
    }
    const side = Math.sign(stop.x - head.x);
    const b1 = point(head.x, top, street - radius);
    const b2 = point(head.x + side * radius, top, street);
    const b3 = point(stop.x - side * radius, top, street);
    const b4 = point(stop.x, top, street + radius);
    return chain([
      line(start, b1),
      quadratic(b1, point(head.x, top, street), b2),
      line(b2, b3),
      quadratic(b3, point(stop.x, top, street), b4),
      line(b4, end),
    ]);
  });
  return { head, stops, traces };
}

function buildModule(shape: ModuleShape): MapModule {
  const top = shape.y + SHEET_THICKNESS;
  const heads: Point[] = [];
  for (let i = 0; i < shape.stops; i++) {
    const row = Math.floor(i / 4);
    const column = i % 4;
    const x = at(COLUMNS, row % 2 === 0 ? column : 3 - column);
    heads.push(point(x, top, at(shape.rows, row) + (column % 2 ? WAVE : 0)));
  }
  const disc = point(0, top, shape.disc);
  const legs = [bend(disc, at(heads, 0))];
  for (let i = 1; i < heads.length; i++) {
    const isSameRow = Math.floor(i / 4) === Math.floor((i - 1) / 4);
    legs.push((isSameRow ? bend : uTurn)(at(heads, i - 1), at(heads, i)));
  }
  return {
    top: shape.top,
    bottom: shape.bottom,
    isLocked: shape.isLocked ?? false,
    surfaceY: top,
    heads,
    disc,
    legs,
    extra: shape.extraAt === undefined ? null : extraPractice(at(heads, shape.extraAt), top),
  };
}

function buildSpine(origin: Point, first: MapModule, second: MapModule, third: MapModule) {
  return [
    line(origin, first.disc),
    cubic(
      first.disc,
      point(0, first.surfaceY, first.disc.z + 9),
      point(0, second.surfaceY, second.disc.z - 6),
      second.disc,
    ),
    cubic(
      second.disc,
      point(0, second.surfaceY, second.disc.z + 7),
      point(0, third.surfaceY, third.disc.z - 5),
      third.disc,
    ),
  ];
}

function buildItinerary(first: MapModule, second: MapModule, extra: ExtraPractice) {
  const firstTrace = at(extra.traces, 0);
  const toExtra = chain([
    line(extra.head, firstTrace.getPoint(0)),
    firstTrace,
    line(firstTrace.getPoint(1), at(extra.stops, 0)),
  ]);
  const exam = at(first.heads, 5);
  const jump = quadratic(
    exam,
    point((exam.x + second.disc.x) / 2, second.surfaceY + 5.5, (exam.z + second.disc.z) / 2),
    second.disc,
  );
  return [
    at(first.legs, 1),
    at(first.legs, 2),
    toExtra,
    { getPointAt: (u: number) => toExtra.getPointAt(1 - u) },
    at(first.legs, 3),
    at(first.legs, 4),
    at(first.legs, 5),
    jump,
    at(second.legs, 0),
  ];
}

/** The map, once: modules, the origin, the spine, the pin's itinerary and every leg. */
export function buildLandingModel(): LandingModel {
  const first = buildModule(at(MODULE_SHAPES, 0));
  const second = buildModule(at(MODULE_SHAPES, 1));
  const third = buildModule(at(MODULE_SHAPES, 2));
  if (!first.extra) {
    throw new RangeError("landing map: the first module has the extra practice");
  }
  const origin = point(0, first.surfaceY, -6.4);
  const spine = buildSpine(origin, first, second, third);
  const modules: LandingModel["modules"] = [first, second, third];
  return {
    modules,
    origin,
    examPosition: at(first.heads, 5),
    extra: first.extra,
    itinerary: buildItinerary(first, second, first.extra),
    // Route order: a spine leg, then that module's legs.
    route: modules.flatMap((module, moduleIndex) => [
      { curve: at(spine, moduleIndex), moduleIndex, isSpine: true },
      ...module.legs.map((curve) => ({ curve, moduleIndex, isSpine: false })),
    ]),
  };
}
