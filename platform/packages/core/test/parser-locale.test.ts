import { describe, expect, it } from "vitest";
import { parseLesson } from "../src/content/parser";
import type { Locale } from "../src/localized-text";

// ADR 0003, fix 6: the titles v1 gave untitled freeform sections, per locale.
// Answer 3 to platform#2 adds the default title of an untitled :::concept fence.
const LITERALS: Record<
  Locale,
  [intro: string, lesson: string, continuation: string, concept: string]
> = {
  es: ["Introducción", "Lección", "Continuación", "Concepto"],
  en: ["Introduction", "Lesson", "Continuation", "Concept"],
  pt: ["Introdução", "Lição", "Continuação", "Conceito"],
  fr: ["Introduction", "Leçon", "Suite", "Concept"],
  it: ["Introduzione", "Lezione", "Continuazione", "Concetto"],
};

const paragraphs = Array.from({ length: 7 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
const withHeading = "Opening words.\n\n## A real title\nThe body.";
// A :::concept fence takes its first line as the title, so only an empty one is untitled.
const untitledConcept = ":::concept\n:::\n\n## A real title\nThe body.";

function translate(value: unknown, from: string[], to: string[]): unknown {
  if (typeof value === "string") return from.includes(value) ? to[from.indexOf(value)] : value;
  if (Array.isArray(value)) return value.map((item) => translate(item, from, to));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, translate(v, from, to)]));
  }
  return value;
}

describe("parser titles per locale (ADR 0003, fix 6)", () => {
  it.each(Object.keys(LITERALS) as Locale[])(
    "%s: the same content, in the lesson's language",
    (locale) => {
      for (const body of [paragraphs, withHeading, untitledConcept, "Short."]) {
        const spanish = parseLesson(body, { locale: "es" });
        const expected = translate(spanish, LITERALS.es, LITERALS[locale]);
        expect(parseLesson(body, { locale })).toEqual(expected);
      }
    },
  );

  it("names English sections in English and leaves them out of the summary", () => {
    const sections = parseLesson(withHeading, { locale: "en" });
    expect(sections.map((s) => s.title)).toEqual(["Introduction", "A real title", null]);
    expect(sections.at(-1)).toMatchObject({ type: "summary", key_points: ["A real title"] });
  });

  it("titles an untitled :::concept fence in the lesson's language", () => {
    const sections = parseLesson(untitledConcept, { locale: "pt" });
    expect(sections.map((s) => s.title)).toEqual(["Conceito", "A real title", null]);
    expect(sections.at(-1)).toMatchObject({ type: "summary", key_points: ["A real title"] });
  });
});
