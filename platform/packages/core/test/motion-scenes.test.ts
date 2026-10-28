import { describe, expect, it } from "vitest";
import { validateScene } from "../src/content/motion-scenes";
import { parseLesson } from "../src/index";

const agreement = {
  tokens: ["Ele", "tenho", "café", "."],
  subject: 0,
  verb: 1,
  wrong: "tenho",
  correct: "tem",
  why: "«Ele» es tercera persona: tem, no tenho.",
  labels: { subject: "SUJETO", verb: "VERBO" },
};
const transform = {
  steps: [
    { tag: "AFIRMATIVA", tokens: ["Ela", "gosta", "de", "música", "."], hi: [] },
    { tag: "NEGATIVA", tokens: ["Ela", "não", "gosta", "de", "música", "."], hi: [1] },
  ],
};

describe("motion scenes (v1 app/motion/src/scenes/*.schema.json)", () => {
  it("accepts v1's examples", () => {
    expect(validateScene("agreement", agreement)).toEqual([]);
    expect(validateScene("transform", transform)).toEqual([]);
  });

  it("refuses an index outside the containing object's tokens", () => {
    expect(validateScene("agreement", { ...agreement, verb: 4 })).not.toEqual([]);
    const step = { tag: "X", tokens: ["a"], hi: [1] };
    expect(validateScene("transform", { steps: [step] })).not.toEqual([]);
  });

  it("refuses missing, extra and mistyped fields, and unknown scenes", () => {
    const { why: _why, ...missing } = agreement;
    expect(validateScene("agreement", missing)).not.toEqual([]);
    expect(validateScene("agreement", { ...agreement, extra: 1 })).not.toEqual([]);
    expect(validateScene("agreement", { ...agreement, tokens: ["solo"] })).not.toEqual([]);
    expect(validateScene("agreement", { ...agreement, subject: 0.5 })).not.toEqual([]);
    expect(validateScene("agreement", [])).not.toEqual([]);
    expect(validateScene("constructor", agreement)).not.toEqual([]);
  });

  it("parses a valid motion block, and falls back to a concept otherwise", () => {
    const json = JSON.stringify({ narration: "Mira el sujeto.", data: agreement });
    const [ok] = parseLesson(`## Motion: agreement\n${json}\n\nDespués.`, { locale: "es" });
    expect(ok).toMatchObject({
      type: "motion",
      scene: "agreement",
      narration: "Mira el sujeto.",
      aftermath: "Después.",
    });

    const bad = JSON.stringify({ narration: "Mira el sujeto.", data: { ...agreement, verb: 9 } });
    expect(parseLesson(`## Motion: agreement\n${bad}`, { locale: "es" })[0]).toEqual({
      type: "concept",
      title: null,
      body: "Mira el sujeto.",
    });
  });
});
