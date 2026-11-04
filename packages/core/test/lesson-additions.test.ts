import { describe, expect, it } from "vitest";
import { insertKnowledgeChecks } from "../src/content/lesson-additions";
import type { Section } from "../src/content/sections/types";

const concept = (title: string): Section => ({ type: "concept", title, body: "…" });
const tip: Section = { type: "tip", title: null, body: "…" };

describe("knowledge checks from a lesson's metadata", () => {
  it("adds nothing to a lesson with no concept", () => {
    expect(insertKnowledgeChecks([tip], [{ question: "¿?" }])).toEqual([tip]);
  });

  it("adds nothing when the lesson already has a check per three concepts", () => {
    const sections: Section[] = [
      concept("A"),
      concept("B"),
      concept("C"),
      { type: "check", title: null, question: "¿?", options: [], explanation: null },
    ];
    expect(insertKnowledgeChecks(sections, [{ question: "Otra" }])).toEqual(sections);
  });

  it("counts only concepts, and reads a malformed check as one with no options or question", () => {
    const sections = [concept("A"), tip, concept("B"), concept("C")];
    const result = insertKnowledgeChecks(sections, [{ options: "not a list" }]);

    expect(result).toEqual([
      ...sections,
      { type: "check", title: null, question: null, options: [], explanation: null },
    ]);
  });
});
