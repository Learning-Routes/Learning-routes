import { asObject, isBlank } from "../v1-import/loose-json";
import type { Section } from "./sections/types";

// What the platform adds to a parsed lesson: knowledge checks from the lesson's
// metadata, its audio, and a closing summary.

const CONCEPTS_PER_CHECK = 3;

const isConcept = (section: Section) => section.type === "concept" || section.type === "visual";

function knowledgeCheck(raw: unknown): Section {
  const check = asObject(raw);
  const options = Array.isArray(check.options) ? check.options : [];
  return {
    type: "check",
    title: null,
    question: check.question ?? null,
    options: options.map((label, i) => ({ label, correct: i === check.correct_index })),
    explanation: check.explanation ?? null,
  };
}

/**
 * One check after every third concept, while the lesson has fewer than that; the
 * rest at the end. Replaces v1 `LessonSectionParser#inject_metadata_checks`.
 */
export function insertKnowledgeChecks(sections: Section[], knowledgeChecks: unknown): Section[] {
  if (!Array.isArray(knowledgeChecks) || knowledgeChecks.length === 0) {
    return sections;
  }
  const conceptCount = sections.filter(isConcept).length;
  const checkCount = sections.filter((section) => section.type === "check").length;
  if (conceptCount === 0 || checkCount * CONCEPTS_PER_CHECK >= conceptCount) {
    return sections;
  }

  const result: Section[] = [];
  let conceptsSeen = 0;
  let next = 0;
  for (const section of sections) {
    result.push(section);
    if (!isConcept(section)) {
      continue;
    }
    conceptsSeen += 1;
    if (conceptsSeen % CONCEPTS_PER_CHECK === 0 && next < knowledgeChecks.length) {
      result.push(knowledgeCheck(knowledgeChecks[next]));
      next += 1;
    }
  }
  for (; next < knowledgeChecks.length; next += 1) {
    result.push(knowledgeCheck(knowledgeChecks[next]));
  }
  return result;
}

/** The lesson's audio, after its first concept. Replaces v1 `LessonSectionParser#inject_audio_section`. */
export function insertAudio(sections: Section[], audioUrl: string | null | undefined): Section[] {
  if (isBlank(audioUrl)) {
    return sections;
  }
  const first = sections.findIndex(isConcept);
  if (first === -1) {
    return sections;
  }
  const audio: Section = { type: "audio", title: null, audio_url: audioUrl, transcript: null };
  return [...sections.slice(0, first + 1), audio, ...sections.slice(first + 1)];
}

/**
 * A lesson always ends with a summary, built from its concepts' own titles (not
 * the generated ones). Replaces v1 `LessonSectionParser#ensure_summary`.
 */
export function ensureSummary(sections: Section[], generatedTitles: Iterable<string>): Section[] {
  if (sections.some((section) => section.type === "summary")) {
    return sections;
  }
  const generated = new Set(generatedTitles);
  const keyPoints = sections
    .filter(isConcept)
    .map((section) => section.title)
    .filter(
      (title): title is string =>
        typeof title === "string" && !isBlank(title) && !generated.has(title),
    );
  return [...sections, { type: "summary", title: null, key_points: keyPoints, body: null }];
}
