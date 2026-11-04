import { describe, expect, it } from "vitest";
import { Block } from "../src/blocks/schema";
import { parseLesson } from "../src/content/parser";
import { grade } from "../src/learning/grader";
import { importV1Block, importV1Lesson } from "../src/v1-import/import";

// FOUNDATIONS.md §4b: v1's names stay in v1's data; the v1 import maps them to the
// glossary's words, and nothing past the boundary uses v1's names.
const source = { routeId: "route-1", lessonId: "lesson-1", position: 0, locale: "es" } as const;
const v1Flashcards = {
  type: "flashcards",
  title: "Repaso",
  body: null,
  cards: [{ front: "hola", back: "hello" }],
  aftermath: "Más práctica mañana.",
};

describe("v1's vocabulary at the import boundary", () => {
  it("imports a flashcards section as a cards block, its aftermath as trailing content", async () => {
    const block = await importV1Block(v1Flashcards, source);

    expect(block.type).toBe("cards");
    expect(block).toMatchObject({ trailing_content: { es: "Más práctica mañana." } });
    expect(block).not.toHaveProperty("aftermath");
  });

  it("stores only the glossary's words", () => {
    const id = "0190f3a0-0000-7000-8000-000000000000";
    const cards = { es: "x" };
    expect(Block.safeParse({ id, type: "flashcards", cards: [] }).success).toBe(false);
    expect(Block.safeParse({ id, type: "tip", body: cards, aftermath: cards }).success).toBe(false);
  });

  it("takes a parsed v1 lesson through the import before any rule sees it", async () => {
    const sections = parseLesson("## Flashcards: Repaso\nFRONT: hola\nBACK: hello\n", {
      locale: "es",
    });
    expect(sections[0]).toMatchObject({ type: "flashcards" });

    const [block] = await importV1Lesson(sections, { routeId: "r", lessonId: "l", locale: "es" });
    expect(block?.type).toBe("cards");
    expect(grade(block, {}).reason).toBe("cards is engagement-only");
  });
});
