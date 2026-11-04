import { describe, expect, it } from "vitest";
import { Block } from "../../src/blocks/schema";
import { importV1Lesson } from "../../src/v1-import/import";
import fixture from "../golden/lesson_parser.json" with { type: "json" };

const lessons = fixture.cases.map((c, i) => ({
  lessonId: `lesson-${i}`,
  sections: c.output as unknown[],
}));

describe("v1 → stored blocks", () => {
  it("turns every recorded parser section into a valid stored Block", async () => {
    for (const { lessonId, sections } of lessons) {
      const blocks = await importV1Lesson(sections, { routeId: "route-1", lessonId, locale: "es" });
      expect(blocks).toHaveLength(sections.length);
      for (const block of blocks) {
        expect(Block.safeParse(block).success).toBe(true);
      }
    }
  });

  it("gives the same ids on every import, and distinct ids within a route", async () => {
    const ids = new Set<string>();
    let count = 0;
    for (const { lessonId, sections } of lessons) {
      const first = await importV1Lesson(sections, { routeId: "route-1", lessonId, locale: "es" });
      const second = await importV1Lesson(sections, { routeId: "route-1", lessonId, locale: "es" });
      expect(second.map((b) => b.id)).toEqual(first.map((b) => b.id));
      for (const block of first) {
        ids.add(block.id);
      }
      count += first.length;
    }
    expect(ids.size).toBe(count);
  });

  it("gives another route's copy of a lesson other ids", async () => {
    const sections = lessons[0]?.sections ?? [];
    const a = await importV1Lesson(sections, { routeId: "route-1", lessonId: "l", locale: "es" });
    const b = await importV1Lesson(sections, { routeId: "route-2", lessonId: "l", locale: "es" });
    expect(a.map((block) => block.id)).not.toEqual(b.map((block) => block.id));
  });
});
