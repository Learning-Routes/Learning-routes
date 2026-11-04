import { fenceTypes, headingMap } from "../blocks/types";
import type { Locale } from "../localized-text";
import { isBlank, presence, strip } from "../v1-import/loose-json";
import { ensureSummary, insertAudio, insertKnowledgeChecks } from "./lesson-additions";
import { LINE_START, lines, WS } from "./ruby-text";
import { fencedCheck, headingCheck } from "./sections/check";
import {
  codePlayground,
  dragDrop,
  fillBlank,
  flashcards,
  scenario,
  simulation,
} from "./sections/interactive";
import { conceptOrVisual, motion, video, visual } from "./sections/media";
import { fencedConcept, fencedProse, fencedSummary, headingSummary } from "./sections/prose";
import type { Section } from "./sections/types";

const PARAGRAPH_BREAK = /\n{2,}/;

export type { Section } from "./sections/types";

export interface ParseOptions {
  /** The lesson's language: it names the sections the author left untitled. */
  locale: Locale;
  /** v1 step metadata `knowledge_checks`, inserted as checks when a lesson has too few. */
  knowledgeChecks?: unknown;
  /** The lesson's narration, inserted as an audio section after the first concept. */
  audioUrl?: string | null;
}

const PARAGRAPHS_PER_SECTION = 3;
type Titles = { intro: string; lesson: string; continuation: string; concept: string };

// Names for freeform sections and :::concept fences the author left untitled. v1
// used the Spanish set in every language; the lesson's locale chooses it now (ADR 0003).
const TITLES: Record<Locale, Titles> = {
  es: {
    intro: "Introducción",
    lesson: "Lección",
    continuation: "Continuación",
    concept: "Concepto",
  },
  en: { intro: "Introduction", lesson: "Lesson", continuation: "Continuation", concept: "Concept" },
  pt: { intro: "Introdução", lesson: "Lição", continuation: "Continuação", concept: "Conceito" },
  fr: { intro: "Introduction", lesson: "Leçon", continuation: "Suite", concept: "Concept" },
  it: {
    intro: "Introduzione",
    lesson: "Lezione",
    continuation: "Continuazione",
    concept: "Concetto",
  },
};

/**
 * Parses v1 lesson markdown into v1 sections, exactly as v1 did. It never throws
 * on malformed markdown: model output is untrusted input (lesson 18). Replaces v1
 * `ContentEngine::LessonSectionParser`.
 */
export function parseLesson(body: string | null | undefined, options: ParseOptions): Section[] {
  const titles = TITLES[options.locale];
  const text = body ?? "";
  if (isBlank(text)) {
    return [
      { type: "concept", title: null, body: "" },
      { type: "summary", title: null, key_points: [], body: null },
    ];
  }
  const sections = splitAroundFences(text, titles).flatMap((segment) =>
    typeof segment === "string" ? parseFreeform(segment, titles) : [segment],
  );
  return ensureSummary(
    insertAudio(insertKnowledgeChecks(sections, options.knowledgeChecks), options.audioUrl),
    Object.values(titles),
  );
}

// ── ::: fences ─────────────────────────────────────────────────────

const FENCED_BLOCK = new RegExp(
  `${LINE_START}:::(\\w+)${WS}*([\\s\\S]*?)\\n([\\s\\S]*?)${LINE_START}:::`,
);

/** The body as text segments and parsed `:::` blocks. A fence nobody declared is dropped. */
function splitAroundFences(body: string, titles: Titles): (string | Section)[] {
  const segments: (string | Section)[] = [];
  const fences = fenceTypes();
  let remaining = body;
  for (let match = FENCED_BLOCK.exec(remaining); match; match = FENCED_BLOCK.exec(remaining)) {
    const before = remaining.slice(0, match.index);
    if (!isBlank(before)) {
      segments.push(before);
    }
    const type = (match[1] as string).toLowerCase();
    if (fences.includes(type)) {
      segments.push(parseFence(type, strip(match[2] as string), strip(match[3] as string), titles));
    }
    remaining = remaining.slice(match.index + match[0].length);
  }
  if (!isBlank(remaining)) {
    segments.push(remaining);
  }
  return segments;
}

function parseFence(type: string, titleLine: string, body: string, titles: Titles): Section {
  switch (type) {
    case "check":
      return fencedCheck(titleLine, body);
    case "concept":
      return fencedConcept(titleLine, body, titles.concept);
    case "example":
    case "tip":
      return fencedProse(type, titleLine, body);
    case "summary":
      return fencedSummary(titleLine, body);
    case "drag_drop":
      return dragDrop(titleLine, body);
    case "fill_blank":
      return fillBlank(titleLine, body);
    case "code_playground":
      return codePlayground(titleLine, body);
    case "simulation":
      return simulation(titleLine, body);
    case "scenario":
      return scenario(titleLine, body);
    default:
      return flashcards(titleLine, body);
  }
}

// ── Freeform text: ## headings, or paragraphs ──────────────────────

function parseFreeform(text: string, titles: Titles): Section[] {
  const stripped = strip(text);
  if (stripped === "") {
    return [];
  }
  const sections = splitByHeadings(stripped, titles);
  return sections.length > 0 ? sections : splitByParagraphs(stripped, titles);
}

const HEADING_LINE = new RegExp(`${LINE_START}##${WS}`);
const HEADING_SPLIT = new RegExp(`${LINE_START}(?=##${WS})`);
const HEADING_START = new RegExp(`^##${WS}`);
const HEADING_PREFIX = new RegExp(`${LINE_START}##${WS}+`);

function splitByHeadings(text: string, titles: Titles): Section[] {
  if (!HEADING_LINE.test(text)) {
    return [];
  }
  const sections: Section[] = [];
  for (const rawPart of text.split(HEADING_SPLIT)) {
    const part = strip(rawPart);
    if (part === "") {
      continue;
    }
    if (!HEADING_START.test(part)) {
      // Content before the first heading.
      sections.push(conceptOrVisual(titles.intro, part));
      continue;
    }
    const [headingLine = "", ...rest] = lines(part);
    const rawTitle = strip(headingLine).replace(HEADING_PREFIX, "");
    sections.push(headingSection(rawTitle, strip(rest.join(""))));
  }
  return sections;
}

/** "## Pregunta: What is X?" is a check titled "What is X?"; an untyped heading is a concept. */
function headingSection(rawTitle: string, body: string): Section {
  const map = headingMap();
  const prefix = Object.keys(map).find((candidate) => rawTitle.startsWith(`${candidate}:`));
  if (prefix === undefined) {
    return conceptOrVisual(rawTitle, body);
  }
  const title = rawTitle.slice(prefix.length + 1).replace(new RegExp(`^${WS}*`), "");

  switch (map[prefix]) {
    case "check":
      return headingCheck(title, body);
    case "visual":
      return visual(title, body);
    case "motion":
      return motion(title, body);
    case "example":
    case "tip":
      return { type: map[prefix], title: presence(title), body };
    case "summary":
      return headingSummary(title, body);
    case "concept":
      return conceptOrVisual(presence(title), body);
    case "drag_drop":
      return dragDrop(title, body);
    case "fill_blank":
      return fillBlank(title, body);
    case "code_playground":
      return codePlayground(title, body);
    case "simulation":
      return simulation(title, body);
    case "scenario":
      return scenario(title, body);
    case "cards":
      return flashcards(title, body);
    case "video":
      return video(title, body);
    default:
      return conceptOrVisual(rawTitle, body);
  }
}

function splitByParagraphs(text: string, titles: Titles): Section[] {
  const paragraphs = text
    .split(PARAGRAPH_BREAK)
    .map(strip)
    .filter((paragraph) => paragraph !== "");
  if (paragraphs.length <= PARAGRAPHS_PER_SECTION) {
    return [conceptOrVisual(titles.lesson, strip(text))];
  }

  const sections: Section[] = [];
  for (let i = 0; i < paragraphs.length; i += PARAGRAPHS_PER_SECTION) {
    const title = i === 0 ? titles.lesson : titles.continuation;
    sections.push(
      conceptOrVisual(title, paragraphs.slice(i, i + PARAGRAPHS_PER_SECTION).join("\n\n")),
    );
  }
  return sections;
}
