import { expect, test } from "vitest";
import { contours as drawContours } from "../src/terrain";

// WP-37b §4.3. The faint contour lines behind the map are a pure module: seeded
// noise → marching squares → one path string per level. The test parses the strings.
const LEVELS = [-0.32, -0.16, 0, 0.16, 0.32];

type Rect = { x: number; y: number; w: number; h: number };

function contours(rect: Rect, { seed = 37, levels = LEVELS } = {}): string[] {
  return drawContours(rect, { seed, cell: 18, levels });
}

const PATTERN = /M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)L(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g;

// "Mx yLx y" pairs → [[[x, y], [x, y]], …]; anything else in the string fails.
function segments(d: string): [number, number][][] {
  expect(d.replace(PATTERN, ""), "unexpected text in a contour path").toBe("");
  return [...d.matchAll(PATTERN)].map((m) => [
    [Number(m[1]), Number(m[2])],
    [Number(m[3]), Number(m[4])],
  ]);
}

test("the same seed draws the same terrain; another seed draws another", () => {
  const rect = { x: -700, y: -700, w: 1600, h: 1200 };
  const a = contours(rect, { seed: 37 });
  expect(contours(rect, { seed: 37 })).toEqual(a);
  expect(contours(rect, { seed: 38 })).not.toEqual(a);
});

test("one path string per level, each with segments", () => {
  const paths = contours({ x: 0, y: 0, w: 1200, h: 900 }, { levels: LEVELS });
  expect(paths.length).toBe(LEVELS.length);
  for (const d of paths) {
    expect(segments(d).length).toBeGreaterThan(0);
  }
});

// The bounds of a layout are not whole numbers. A grid that overshoots the
// requested rectangle by up to a cell would draw past it.
for (const rect of [
  { x: 0, y: 0, w: 1200, h: 900 },
  { x: -97.3, y: 12.6, w: 1234.5, h: 777.7 },
]) {
  test(`every point lies inside the requested rectangle ${JSON.stringify(rect)}`, () => {
    for (const d of contours(rect)) {
      for (const [x, y] of segments(d).flat(1)) {
        expect(x).toBeGreaterThanOrEqual(rect.x);
        expect(x).toBeLessThanOrEqual(rect.x + rect.w);
        expect(y).toBeGreaterThanOrEqual(rect.y);
        expect(y).toBeLessThanOrEqual(rect.y + rect.h);
      }
    }
  });
}

test("a 3000 × 3000 field stays under 40,000 segments", () => {
  const count = contours({ x: 0, y: 0, w: 3000, h: 3000 }).reduce(
    (sum, d) => sum + segments(d).length,
    0,
  );
  expect(count).toBeLessThan(40_000);
});
