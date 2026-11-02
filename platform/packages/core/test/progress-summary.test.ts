import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/content/snapshot";
import { progressSummary } from "../src/learning/progress";

const L1 = "0192d3a0-0000-7000-8000-000000000101";
const L2 = "0192d3a0-0000-7000-8000-000000000102";
const L3 = "0192d3a0-0000-7000-8000-000000000103";
const M = "0192d3a0-0000-7000-8000-000000000100";

const version = (lessons: string[]): Snapshot => ({
  route: {
    id: "0192d3a0-0000-7000-8000-000000000001",
    slug: "r",
    title: { en: "R" },
    description: null,
    sourceLocale: "en",
    access: "open",
    pricing: "free",
  },
  modules: [{ id: M, position: "V", title: { en: "M" } }],
  lessons: lessons.map((id, i) => ({ id, moduleId: M, position: `${i + 1}`, title: { en: id } })),
  prerequisites: [],
  blocks: [],
});

describe("progressSummary (Platform STEP 2 §2.12)", () => {
  it("counts only the lessons of the pinned version, and keeps the rest uncounted", () => {
    const records = [
      { lessonId: L1, status: "completed" as const },
      { lessonId: L2, status: "completed" as const },
    ];
    expect(progressSummary(version([L1, L2]), records)).toEqual({
      completed: 2,
      total: 2,
      uncounted: 0,
    });
    // Version 2 removed L2 and added L3: L2's progress is kept, not counted.
    expect(progressSummary(version([L1, L3]), records)).toEqual({
      completed: 1,
      total: 2,
      uncounted: 1,
    });
  });
});
