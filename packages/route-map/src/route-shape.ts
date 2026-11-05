// A route's real shape (docs/design/VISION.md, "The line is the hero"): its modules and topics
// decide the stations, and a seed, its id, decides the meander. The line is sampled densely and
// stations sit at even lengths along it, so they never crowd on a bend. A module and the exam get
// more room than a topic. From reference/vision/pages.html.

const SAMPLES = 240;
/** A point every this many units is enough for the eye, at any width. */
const UNITS_PER_POINT = 5;
const MODULE_ROOM = 1.7;
const TOPIC_ROOM = 1;
const DEFAULT_PAD = 24;

export type StationKind = "module" | "topic";

export interface Station {
  kind: StationKind;
  x: number;
  y: number;
  /** How far along the line, from 0 to 1. */
  at: number;
  /** The module it belongs to. */
  module?: number;
  /** A topic's place in the whole route, from 0. */
  topic?: number;
}

export interface RouteShape {
  width: number;
  height: number;
  path: string;
  stations: Station[];
  /** The radii and track that fit this many stations on this much line. */
  topicRadius: number;
  moduleRadius: number;
  trackWidth: number;
}

export interface ShapeBox {
  width: number;
  height: number;
  /** Runs left to right, or top to bottom when false. */
  across?: boolean;
  pad?: number;
}

interface Point {
  x: number;
  y: number;
}

const rounded = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function seedOf(text: string): number {
  let hash = 2_166_136_261;
  for (const character of text) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number) {
  let state = (seed % 233_280) * 9301 + 49_297;
  return () => {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
}

function meander(seed: string, { width, height, across = true, pad = DEFAULT_PAD }: ShapeBox) {
  const random = randomFrom(seedOf(seed));
  const frequency = 0.65 + random() * 0.9;
  const phase = random() * Math.PI * 2;
  const amplitude = (across ? height : width) * (0.19 + random() * 0.07);
  const points: Point[] = [];
  for (let index = 0; index <= SAMPLES; index++) {
    const t = index / SAMPLES;
    const wobble =
      Math.sin(t * frequency * Math.PI * 2 + phase) * amplitude +
      Math.sin(t * 7.3 + phase) * amplitude * 0.1;
    points.push(
      across
        ? { x: pad + t * (width - pad * 2), y: height / 2 + wobble }
        : { x: width / 2 + wobble, y: pad + t * (height - pad * 2) },
    );
  }
  return points;
}

/** The running length of a line at each of its points. */
function lengthsOf(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    const [a, b] = [points[index - 1] as Point, points[index] as Point];
    lengths.push((lengths[index - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return lengths;
}

function pointAt(points: readonly Point[], lengths: readonly number[], length: number): Point {
  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((lengths[middle] as number) <= length) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const [a, b] = [points[low] as Point, points[high] as Point];
  const span = (lengths[high] as number) - (lengths[low] as number) || 1;
  const part = clamp((length - (lengths[low] as number)) / span, 0, 1);
  return { x: a.x + (b.x - a.x) * part, y: a.y + (b.y - a.y) * part };
}

function pathOf(points: readonly Point[], total: number): string {
  const wanted = clamp(Math.ceil(total / UNITS_PER_POINT), 2, SAMPLES);
  const step = Math.max(1, Math.floor(SAMPLES / wanted));
  const kept = points.filter((_, index) => index % step === 0 || index === SAMPLES);
  return kept
    .map((point, index) => `${index === 0 ? "M" : "L"}${rounded(point.x)} ${rounded(point.y)}`)
    .join("");
}

/** Places a route's stations along a line, and says how much line each one gets. */
function placed(lessonsPerModule: readonly number[], points: readonly Point[]) {
  const lengths = lengthsOf(points);
  const total = lengths.at(-1) as number;
  const rooms: { kind: StationKind; room: number; module?: number; topic?: number }[] = [];
  let topic = 0;
  lessonsPerModule.forEach((lessons, module) => {
    rooms.push({ kind: "module", room: MODULE_ROOM, module });
    for (let lesson = 0; lesson < lessons; lesson++) {
      rooms.push({ kind: "topic", room: TOPIC_ROOM, module, topic: topic++ });
    }
  });
  const gaps = rooms
    .slice(1)
    .map((room, index) => (room.room + (rooms[index] as { room: number }).room) / 2);
  const sum = gaps.reduce((all, gap) => all + gap, 0) || 1;
  let along = 0;
  const stations = rooms.map(({ room: _room, ...station }, index): Station => {
    if (index > 0) {
      along += gaps[index - 1] as number;
    }
    const at = along / sum;
    const point = pointAt(points, lengths, at * total);
    return { ...station, x: rounded(point.x), y: rounded(point.y), at };
  });
  return { stations, total, unit: total / sum };
}

/** A route's line and stations in a box. Pure and seeded: server and browser draw the same one. */
export function routeShape(
  lessonsPerModule: readonly number[],
  seed: string,
  box: ShapeBox,
): RouteShape {
  const points = meander(seed, box);
  const { stations, total, unit } = placed(lessonsPerModule, points);
  const topicRadius = rounded(clamp(unit * 0.2, 2, 4.2));
  return {
    width: box.width,
    height: box.height,
    path: pathOf(points, total),
    stations,
    topicRadius,
    moduleRadius: rounded(clamp(unit * 0.42, 5.5, 9)),
    trackWidth: rounded(clamp(topicRadius * 2.2, 4, 9)),
  };
}

const BRAID_SWAY = 62;
const BRAID_PAD = 46;
const BRAID_EDGE = 30;

/** A creator's portrait: their routes' lines, woven down one figure, with only rings and exams. */
export function braidShapes(
  routes: readonly { lessons: readonly number[]; seed: string }[],
  box: { width: number; height: number },
): Pick<RouteShape, "path" | "stations">[] {
  return routes.map(({ lessons, seed }, index) => {
    const raw = meander(`${seed}${index}`, { ...box, across: false, pad: BRAID_PAD });
    const points = raw.map((point, sample) => ({
      y: point.y,
      x: clamp(
        box.width / 2 +
          (point.x - box.width / 2) * (1.15 - index * 0.2) +
          Math.sin((sample / SAMPLES) * Math.PI * 2.2 + index * 2.1) * BRAID_SWAY,
        BRAID_EDGE,
        box.width - BRAID_EDGE,
      ),
    }));
    const { stations, total } = placed(lessons, points);
    return {
      path: pathOf(points, total),
      stations: stations.filter((station) => station.kind !== "topic"),
    };
  });
}
