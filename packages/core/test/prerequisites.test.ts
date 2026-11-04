import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createsCycle, type Prerequisite } from "../src/content/prerequisites";

// A slow model to compare against: Floyd–Warshall reachability over lessons 0..n-1.
function reachable(n: number, edges: Prerequisite[]): boolean[][] {
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
  for (const { lessonId, requiresLessonId } of edges) {
    (reach[Number(lessonId)] as boolean[])[Number(requiresLessonId)] = true;
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (reach[i]?.[k] && reach[k]?.[j]) {
          (reach[i] as boolean[])[j] = true;
        }
      }
    }
  }
  return reach;
}

describe("prerequisites stay acyclic (Platform STEP 2 §2.8)", () => {
  it("refuses a lesson that requires itself", () => {
    expect(createsCycle([], { lessonId: "a", requiresLessonId: "a" })).toBe(true);
  });

  it("refuses a loop through others, and accepts a diamond", () => {
    const edges = [
      { lessonId: "c", requiresLessonId: "b" },
      { lessonId: "b", requiresLessonId: "a" },
    ];
    expect(createsCycle(edges, { lessonId: "a", requiresLessonId: "c" })).toBe(true);
    expect(createsCycle(edges, { lessonId: "c", requiresLessonId: "a" })).toBe(false);
  });

  it("agrees with a reachability model on random graphs", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 8 })
          .chain((n) =>
            fc.tuple(
              fc.constant(n),
              fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 20 }),
              fc.tuple(fc.nat(n - 1), fc.nat(n - 1)),
            ),
          ),
        ([n, pairs, [from, to]]) => {
          // Keep only the edges that leave the graph acyclic, in order, as core would.
          const edges: Prerequisite[] = [];
          for (const [a, b] of pairs) {
            const edge = { lessonId: String(a), requiresLessonId: String(b) };
            if (!createsCycle(edges, edge)) {
              edges.push(edge);
            }
          }
          const expected = from === to || (reachable(n, edges)[to]?.[from] ?? false);
          expect(
            createsCycle(edges, { lessonId: String(from), requiresLessonId: String(to) }),
          ).toBe(expected);
        },
      ),
    );
  });
});
