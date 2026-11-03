// A route's own line, for its card (Platform STEP 4 §3.2): one bend per module, as deep
// as the module has lessons, so a route's shape says something about it and no two
// cards look the same. The seed, its id, separates two routes of the same shape.

const WIDTH = 320;
const HEIGHT = 100;
const MARGIN = 14;
const MIDDLE = HEIGHT / 2;
const SHALLOWEST = 10;
const PER_LESSON = 3;
const DEEPEST = MIDDLE - MARGIN;

export interface RouteLine {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function hashOf(text: string): number {
  let hash = 2_166_136_261;
  for (const character of text) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
  }
  return hash >>> 0;
}

const rounded = (value: number) => Math.round(value * 10) / 10;

/** The line for a route with these lesson counts, one per module, in a 320 by 100 box. */
export function routeLine(lessonsPerModule: readonly number[], seed: string): RouteLine {
  const hash = hashOf(seed);
  const bends = lessonsPerModule.length === 0 ? [0] : lessonsPerModule;
  const stops = bends.length + 1;
  const firstUp = hash % 2 === 0;
  const nudge = ((hash >>> 8) % 13) - 6;
  const points = Array.from({ length: stops }, (_, index) => {
    const x = MARGIN + ((WIDTH - 2 * MARGIN) * index) / (stops - 1);
    const lessons = bends[Math.max(0, index - 1)] ?? 0;
    const depth = Math.min(DEEPEST, SHALLOWEST + lessons * PER_LESSON + Math.abs(nudge));
    const up = index % 2 === 0 ? firstUp : !firstUp;
    return { x: rounded(x), y: rounded(MIDDLE + (up ? -depth : depth)) };
  });
  const [first] = points as [{ x: number; y: number }];
  const end = points.at(-1) ?? first;
  const curves = points.slice(1).map((point, index) => {
    const before = points[index] ?? first;
    const middle = rounded((before.x + point.x) / 2);
    return `C ${middle} ${before.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  });
  return { path: `M ${first.x} ${first.y} ${curves.join(" ")}`, start: first, end };
}
