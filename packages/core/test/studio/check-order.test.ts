import { describe, expect, it } from "vitest";
import { writtenByAgent } from "../../src/studio/check-order";

const check = (question: string, labels: string[]) => ({
  type: "check",
  question: { es: question },
  options: labels.map((label, index) => ({ label: { es: label }, correct: index === 0 })),
  explanation: { es: "Porque sí." },
});

const QUESTIONS = Array.from({ length: 8 }, (_, n) =>
  check(`¿Pregunta ${n}?`, [`Bien ${n}`, `Mal ${n}a`, `Mal ${n}b`, `Mal ${n}c`]),
);

const blocksOf = (input: unknown) => (input as { blocks: typeof QUESTIONS }).blocks;
const correctAt = (block: (typeof QUESTIONS)[number]) =>
  block.options.findIndex((option) => option.correct);

describe("the order of a check's options, as the assistant writes them", () => {
  it("does not leave the right answer first in every question", () => {
    const written = blocksOf(writtenByAgent("add_blocks", { lesson_id: "l", blocks: QUESTIONS }));
    expect(new Set(written.map(correctAt)).size).toBeGreaterThan(1);
  });

  it("keeps every option, with its words and its mark, and the rest of the block", () => {
    const [written] = blocksOf(writtenByAgent("add_blocks", { blocks: [QUESTIONS[0]] }));
    expect(written?.options).toHaveLength(4);
    expect(written?.options).toEqual(expect.arrayContaining(QUESTIONS[0]?.options ?? []));
    expect(written).toMatchObject({
      question: QUESTIONS[0]?.question,
      explanation: { es: "Porque sí." },
    });
  });

  it("gives the same question the same order every time", () => {
    const once = writtenByAgent("add_blocks", { blocks: QUESTIONS });
    expect(writtenByAgent("add_blocks", { blocks: QUESTIONS })).toEqual(once);
  });

  it("leaves other blocks, other tools and malformed input as they came", () => {
    const concept = { type: "concept", body: { es: "Texto" } };
    expect(blocksOf(writtenByAgent("add_blocks", { blocks: [concept] }))).toEqual([concept]);
    const imported = { document: { modules: [] }, blocks: QUESTIONS };
    expect(writtenByAgent("import_route", imported)).toBe(imported);
    expect(writtenByAgent("add_blocks", "not json")).toBe("not json");
    expect(writtenByAgent("add_blocks", { blocks: [{ type: "check", options: "x" }] })).toEqual({
      blocks: [{ type: "check", options: "x" }],
    });
  });
});
