import { blockRole, isKnownBlockType } from "../blocks/types";
import { asArray, asObject, asText, isBlank, round2, strip, truthy } from "../v1-import/loose-json";

const INDEX_TEXT = /^(0|[1-9][0-9]*)$/;

// Grades a submission against the block the server holds, never against what the
// client claims (lesson 12).

export interface GradeResult {
  correct: boolean | null;
  score: number | null;
  gradable: boolean;
  reason: string | null;
}

const ungradable = (reason: string): GradeResult => ({
  correct: null,
  score: null,
  gradable: false,
  reason,
});
const graded = (correct: boolean, score: number): GradeResult => ({
  correct,
  score,
  gradable: true,
  reason: null,
});

/**
 * Replaces v1 `LearningRoutesEngine::BlockGrader#call`. A block it cannot grade
 * fails open: ungradable, so it records engagement and never traps a student.
 */
export function grade(block: unknown, submission: unknown): GradeResult {
  const section = asObject(block);
  const payload = asObject(submission);
  const type = asText(section.type);
  if (!isKnownBlockType(type)) {
    return ungradable(`unknown block type ${JSON.stringify(type)}`);
  }
  if (!blockRole(type).gradable) {
    return ungradable(`${type} is engagement-only`);
  }

  if (type === "check") {
    return gradeCheck(section, payload);
  }
  if (type === "drag_drop") {
    return gradeDragDrop(section, payload);
  }
  return gradeFillBlank(section, payload);
}

function gradeCheck(section: Record<string, unknown>, payload: Record<string, unknown>) {
  const options = asArray(section.options);
  if (options.length === 0) {
    return ungradable("check has no options");
  }
  const correctIndex = options.findIndex((option) => truthy(asObject(option).correct));
  if (correctIndex === -1) {
    return ungradable("check has no option marked correct");
  }

  const chosen = payload.option_index;
  if (chosen === null || chosen === undefined) {
    return graded(false, 0);
  }
  const hit = optionIndex(chosen) === correctIndex;
  return graded(hit, hit ? 100 : 0);
}

// Strict, unlike v1's to_i: anything but an integer or its plain digits is no
// option at all, never option 0 (ADR 0003).
function optionIndex(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && INDEX_TEXT.test(value)) {
    return Number(value);
  }
  return null;
}

// Term i pairs with definition i; the submission maps term index to definition index.
function gradeDragDrop(section: Record<string, unknown>, payload: Record<string, unknown>) {
  const pairs = asArray(section.pairs);
  if (pairs.length === 0) {
    return ungradable("drag_drop has no pairs");
  }
  const matches = asObject(payload.matches);
  if (Object.keys(matches).length === 0) {
    return graded(false, 0);
  }

  const hits = pairs.filter((_, i) => asText(matches[String(i)]) === String(i)).length;
  return graded(hits === pairs.length, round2((hits / pairs.length) * 100));
}

// Every graded blank must match, answer i against blank i. A blank whose expected
// value is empty is not graded and does not count (ADR 0003).
function gradeFillBlank(section: Record<string, unknown>, payload: Record<string, unknown>) {
  const blanks = asArray(section.blanks).map(asText);
  const positions = blanks.flatMap((blank, i) => (isBlank(blank) ? [] : [i]));
  if (positions.length === 0) {
    return ungradable("fill_blank has no blanks");
  }
  const match = section.match ?? "text";
  if (match !== "text" && match !== "exact") {
    return ungradable(`unknown match ${JSON.stringify(match)}`);
  }
  const same = match === "exact" ? sameExact : sameText;
  const answers = asArray(payload.answers).map(asText);
  if (answers.length === 0) {
    return graded(false, 0);
  }

  const hits = positions.filter((i) => same(answers[i] ?? "", blanks[i] as string)).length;
  return graded(hits === positions.length, round2((hits / positions.length) * 100));
}

const sameText = (answer: string, expected: string) => normalize(answer) === normalize(expected);
// For code, formulas and symbols: only the surrounding whitespace is forgiven.
const sameExact = (answer: string, expected: string) => strip(answer) === strip(expected);

/**
 * Accent- and case-insensitive, punctuation-free, whitespace-collapsed: v1's
 * `BlockGrader#normalize`, except that it removes only Unicode punctuation (\p{P}),
 * never symbols such as + or $, which v1's [[:punct:]] also removed (ADR 0003).
 * Its \s is ASCII whitespace only, as in v1.
 */
export function normalize(value: string): string {
  return strip(
    value
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/\p{P}/gu, "")
      .replace(/[\t\n\v\f\r ]+/g, " "),
  );
}

/**
 * Replaces v1 `BlockGrader.answerable?`: whether a student can answer the block
 * as rendered. A block that is not a gate is always answerable; a gate needs the
 * content to answer it (lesson 6).
 */
export function answerable(block: unknown): boolean {
  const section = asObject(block);
  const type = asText(section.type);
  if (!blockRole(type).gating) {
    return true;
  }

  switch (type) {
    case "check": {
      const options = asArray(section.options);
      if (strip(asText(section.question)) === "") {
        return false;
      }
      if (options.length === 0) {
        return false;
      }
      return options.some((option) => truthy(asObject(option).correct));
    }
    case "drag_drop":
      return asArray(section.pairs).some(truthy);
    case "fill_blank":
      return asArray(section.blanks).some((blank) => !isBlank(asText(blank)));
    case "cards":
      return asArray(section.cards).some(truthy);
    case "scenario":
      return asArray(section.options).some(truthy);
    default:
      return true;
  }
}
