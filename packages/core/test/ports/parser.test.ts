import { describe, expect, it } from "vitest";
import { parseLesson } from "../../src/content/parser";
import fixture from "../golden/lesson_parser.json" with { type: "json" };
import { runParser } from "../runners";

describe("parser (lesson_parser.json)", () => {
  it("has v1's 259 cases, and the 13 per-locale cases ADR 0003 added", () => {
    const recorded = fixture.cases.filter((c) => !("locale" in c.input));
    expect(recorded).toHaveLength(259);
    // 8 for the freeform titles, 5 for the :::concept title (answer 3 to platform#2).
    expect(fixture.cases.length - recorded.length).toBe(13);
  });

  it.each(fixture.cases)("case #%#", ({ input, output }) => {
    expect(runParser(input)).toEqual(output);
  });

  it("never throws on malformed markdown", () => {
    const inputs = [
      ":::",
      ":::check",
      "## Motion: agreement\n{",
      '## Video:\n{"video_url":',
      "```",
      "## Pregunta:\nA) \n```",
      "\u0000",
    ];
    for (const body of inputs) {
      expect(() => parseLesson(body, { locale: "es" })).not.toThrow();
    }
  });
});
