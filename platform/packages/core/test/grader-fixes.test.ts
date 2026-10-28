import { describe, expect, it } from "vitest";
import { answerable, Block, grade, importV1Block, normalize } from "../src/index";

const fillBlank = (blanks: string[]) => ({ type: "fill_blank", blanks });

describe("grader fixes (ADR 0003)", () => {
  it("grades fill_blank by position, skipping empty expected blanks", () => {
    const block = fillBlank(["", "gato", " "]);
    expect(grade(block, { answers: ["", "gato", ""] })).toMatchObject({
      correct: true,
      score: 100,
    });
    expect(grade(block, { answers: ["gato", "perro"] })).toMatchObject({
      correct: false,
      score: 0,
    });
    expect(grade(fillBlank(["el", "", "gato"]), { answers: ["el", "x", "perro"] })).toMatchObject({
      correct: false,
      score: 50,
    });
    expect(answerable(block)).toBe(true);
  });

  it("never gates a fill_blank whose expected blanks are all empty", () => {
    const block = fillBlank(["", "  "]);
    expect(answerable(block)).toBe(false);
    expect(grade(block, { answers: ["a"] }).gradable).toBe(false);
  });

  it("counts an option_index that is not an integer in range as wrong, never option 0", () => {
    const block = {
      type: "check",
      question: "¿Cuál?",
      options: [
        { label: "a", correct: true },
        { label: "b", correct: false },
      ],
    };
    for (const option_index of ["abc", "0abc", " 0", "", 0.5, "-0", 2, -1, true, [0]]) {
      expect(grade(block, { option_index }), JSON.stringify(option_index)).toMatchObject({
        correct: false,
        score: 0,
      });
    }
    expect(grade(block, { option_index: 0 }).correct).toBe(true);
    expect(grade(block, { option_index: "0" }).correct).toBe(true);
  });

  it("keeps symbols under match text, removing only punctuation", () => {
    const cpp = { type: "fill_blank", blanks: ["C++"] };
    for (const answer of ["c", "c+", "c#"]) {
      expect(grade(cpp, { answers: [answer] }).correct, answer).toBe(false);
    }
    expect(grade(cpp, { answers: [" c++ "] }).correct).toBe(true);
    expect(normalize("¡Hola, $5 + 3 = 8!")).toBe("hola $5 + 3 = 8");
  });

  it("compares trimmed and case-sensitive under match exact", () => {
    const cpp = { type: "fill_blank", blanks: ["C++"], match: "exact" };
    expect(grade(cpp, { answers: ["  C++ "] }).correct).toBe(true);
    for (const answer of ["c++", "C+", "C", "C ++"]) {
      expect(grade(cpp, { answers: [answer] }).correct, answer).toBe(false);
    }
  });

  it("fails open on a match it does not know", () => {
    const block = { type: "fill_blank", blanks: ["a"], match: "regex" };
    expect(grade(block, { answers: ["a"] }).gradable).toBe(false);
  });

  it("stores match, and the v1 import sets text", async () => {
    const id = "0190f3a0-0000-7000-8000-000000000000";
    const stored = { id, type: "fill_blank", blanks: [{ es: "C++" }], match: "exact" };
    expect(Block.parse(stored)).toEqual(stored);
    expect(Block.safeParse({ ...stored, match: "regex" }).success).toBe(false);
    const imported = await importV1Block(
      { type: "fill_blank", blanks: ["gato"] },
      { routeId: "r", lessonId: "l", position: 0, locale: "es" },
    );
    expect(imported).toMatchObject({ type: "fill_blank", match: "text" });
  });
});
