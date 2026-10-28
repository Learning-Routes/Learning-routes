import { describe, expect, it } from "vitest";
import { Block, importV1Block, v1BlockId } from "../src/index";

const source = { routeId: "route-1", lessonId: "lesson-1", position: 0, locale: "es" } as const;

describe("v1 import", () => {
  it("turns v1's plain strings into the source locale's text", async () => {
    const block = await importV1Block(
      {
        type: "check",
        title: null,
        question: "¿Capital?",
        options: [{ label: "Lisboa", correct: true }],
        explanation: null,
      },
      source,
    );

    expect(block).toMatchObject({
      type: "check",
      question: { es: "¿Capital?" },
      options: [{ label: { es: "Lisboa" }, correct: true }],
    });
    expect(Block.parse(block)).toEqual(block);
  });

  it("normalises drag_drop pairs stored as arrays", async () => {
    const block = await importV1Block(
      { type: "drag_drop", title: "Match", pairs: [["bom dia", "buenos días"]] },
      source,
    );

    expect(block).toMatchObject({
      pairs: [{ term: { es: "bom dia" }, definition: { es: "buenos días" } }],
    });
  });

  it("gives a block the same id on every import, from its route, lesson and position", async () => {
    const id = await v1BlockId(source);

    expect(await v1BlockId({ ...source })).toBe(id);
    expect(await v1BlockId({ ...source, position: 1 })).not.toBe(id);
    expect(await v1BlockId({ ...source, lessonId: "lesson-2" })).not.toBe(id);
    expect((await importV1Block({ type: "tip", title: null, body: "x" }, source)).id).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("refuses a section v1 could not have produced", async () => {
    await expect(importV1Block({ type: "tap_pairs" }, source)).rejects.toThrow();
  });
});
