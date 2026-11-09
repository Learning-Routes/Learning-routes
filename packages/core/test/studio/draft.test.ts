import { describe, expect, it } from "vitest";
import type { RouteDraft } from "../../src/repos/ports";
import { builtOf, lessonPreviewOf, plannedOf } from "../../src/studio/draft";

const ROUTE = "00000000-0000-7000-8000-000000000001";
const M1 = "00000000-0000-7000-8000-000000000011";
const M2 = "00000000-0000-7000-8000-000000000012";
const L1 = "00000000-0000-7000-8000-000000000021";
const L2 = "00000000-0000-7000-8000-000000000022";
const L3 = "00000000-0000-7000-8000-000000000023";

function draft(blocks: RouteDraft["blocks"]): RouteDraft {
  return {
    spaceId: "00000000-0000-7000-8000-000000000099",
    revision: 4,
    latestPublishedVersion: null,
    route: {
      id: ROUTE,
      slug: "fracciones",
      title: { es: "Fracciones", en: "Fractions" },
      description: { es: "Para colegio" },
      sourceLocale: "es",
      access: "public",
      pricing: "free",
      topic: "mathematics",
      level: "beginner",
      priceMinor: null,
      currency: null,
    },
    // Out of order on purpose: positions decide.
    modules: [
      { id: M2, position: "b", title: { es: "Problemas" } },
      { id: M1, position: "a", title: { es: "Lo básico" } },
    ],
    lessons: [
      { id: L3, moduleId: M2, position: "a", title: { es: "Edades" } },
      { id: L2, moduleId: M1, position: "b", title: { es: "Sumar" } },
      { id: L1, moduleId: M1, position: "a", title: { es: "¿Qué es?", en: "What is it?" } },
    ],
    prerequisites: [],
    blocks,
  } as unknown as RouteDraft;
}

const concept = (lessonId: string, position = "a") => ({
  id: `00000000-0000-7000-8000-0000000003${position === "a" ? "1" : "2"}${lessonId.at(-1)}`,
  lessonId,
  position,
  kind: "concept" as const,
  data: { type: "concept", body: { es: "Una fracción es una parte." } },
});

describe("plannedOf", () => {
  it("draws the real draft's modules and lessons, in order, in the creator's language", () => {
    const planned = plannedOf(draft([]), "en", null);
    expect(planned.title).toBe("Fractions");
    expect(planned.summary).toBe("Para colegio");
    expect(planned.modules).toEqual([
      { title: "Lo básico", lessons: [{ title: "What is it?" }, { title: "Sumar" }] },
      { title: "Problemas", lessons: [{ title: "Edades" }] },
    ]);
  });

  it("marks the lessons added after the plan was first shown", () => {
    const planned = plannedOf(draft([]), "es", new Set([L1, L3]));
    expect(planned.modules[0]?.lessons).toEqual([
      { title: "¿Qué es?" },
      { title: "Sumar", isNew: true },
    ]);
  });
});

describe("builtOf", () => {
  it("counts the stations built in order, and stops at the first lesson with nothing in it", () => {
    expect(builtOf(draft([]))).toBe(0);
    // Module 1 and its first lesson; the second lesson is empty, so module 2 does not count yet.
    expect(builtOf(draft([concept(L1), concept(L3)]))).toBe(2);
    expect(builtOf(draft([concept(L1), concept(L2), concept(L3)]))).toBe(5);
  });
});

describe("lessonPreviewOf", () => {
  it("shows a lesson as a student reads it, at its station, with its first question", () => {
    const check = {
      id: "00000000-0000-7000-8000-000000000041",
      lessonId: L2,
      position: "b",
      kind: "check" as const,
      data: {
        type: "check",
        question: { es: "¿1/2 + 1/2?" },
        options: [
          { label: { es: "1" }, correct: true },
          { label: { es: "2/4" }, correct: false },
        ],
      },
    };
    const names = { concept: "concepto", check: "pregunta" };
    const preview = lessonPreviewOf(
      draft([concept(L2), check, { ...check, id: `${check.id.slice(0, -1)}2`, position: "c" }]),
      L2,
      "es",
      "https://x/preview",
      names,
    );
    expect(preview).toEqual({
      station: 2,
      title: "Sumar",
      format: "concepto, pregunta",
      body: "Una fracción es una parte.",
      question: { prompt: "¿1/2 + 1/2?", options: ["1", "2/4"], answer: 0 },
      previewUrl: "https://x/preview",
    });
  });

  it("is nothing for a lesson that is not in the draft", () => {
    expect(lessonPreviewOf(draft([]), "nope", "es", "https://x", {})).toBeNull();
  });
});
