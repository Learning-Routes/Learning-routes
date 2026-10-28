import { presence, strip } from "../../coerce";
import { FENCE, isBoundary, splitAftermath } from "../aftermath";
import { lines, WS } from "../text";
import type { Section } from "./types";

const OPTION = new RegExp(`^[A-Da-d]\\)${WS}`);
const OPTION_PREFIX = new RegExp(`^[A-Da-d]\\)${WS}*`);
const CORRECT = new RegExp(`^(?:CORRECTA|CORRECT|ANSWER):${WS}*`, "iu");
const EXPLANATION = new RegExp(`^(?:EXPLICACI[OÓ]N|EXPLANATION):${WS}*`, "iu");
const NUMBERED = new RegExp(`^\\d+\\)${WS}`);
const CHECKBOX = new RegExp(`^-${WS}*\\[[ x]\\]`);
const CHECKBOX_PREFIX = new RegExp(`^-${WS}*\\[[ x]\\]${WS}*`);

type Marker = "option" | "correct" | "explanation" | "numbered";

function markerOf(stripped: string): Marker | null {
  if (OPTION.test(stripped)) return "option";
  if (CORRECT.test(stripped)) return "correct";
  if (EXPLANATION.test(stripped)) return "explanation";
  if (NUMBERED.test(stripped)) return "numbered";
  return null;
}

/**
 * `## Pregunta:` / `## Question:`: the question, then a contiguous run of options,
 * one CORRECTA and one EXPLICACIÓN, then the aftermath. Markers count only outside
 * fenced code, and a line the run's grammar no longer expects ends it. Replaces v1
 * `LessonSectionParser#parse_heading_check`.
 */
export function headingCheck(questionFromHeading: string, body: string): Section {
  const all = lines(body);
  const options: { label: string; correct: boolean }[] = [];
  let correctLetter: string | null = null;
  let explanation: string | null = null;
  let first: number | null = null;
  let last: number | null = null;
  let inFence = false;
  let prevStructural = false;
  let lastKind: Marker | null = null;

  for (const [index, line] of all.entries()) {
    const stripped = strip(line);

    if (FENCE.test(stripped)) {
      // Before the first marker a fence belongs to the question; after it, it opens the aftermath.
      if (first !== null) break;
      inFence = !inFence;
      prevStructural = false;
      continue;
    }
    if (inFence || stripped === "") {
      prevStructural = false;
      continue;
    }

    const kind = markerOf(stripped);
    if (kind === null) {
      if (first === null) continue;
      // Only the wrapped rest of an option or an explanation continues the run.
      if (!(prevStructural && (lastKind === "option" || lastKind === "explanation"))) break;
      if (isBoundary(stripped, ["heading", "rule"])) break;
      const option = options.at(-1);
      if (lastKind === "option" && option) option.label = strip(`${option.label} ${stripped}`);
      if (lastKind === "explanation") explanation = strip(`${explanation} ${stripped}`);
      last = index;
      continue;
    }

    const expected =
      kind === "correct"
        ? correctLetter === null
        : kind === "explanation"
          ? explanation === null
          : correctLetter === null && explanation === null;
    if (!expected) break;

    if (kind === "option")
      options.push({ label: stripped.replace(OPTION_PREFIX, ""), correct: false });
    if (kind === "correct") correctLetter = strip(stripped.replace(CORRECT, "")).toUpperCase();
    if (kind === "explanation") explanation = strip(stripped.replace(EXPLANATION, ""));

    lastKind = kind;
    first ??= index;
    last = index;
    prevStructural = true;
  }

  let bodyQuestion: string;
  let aftermath: string | null;
  if (first === null) {
    [bodyQuestion, aftermath] = splitAftermath(all.join(""));
  } else {
    bodyQuestion = all.slice(0, first).join("");
    aftermath = presence(strip(all.slice((last as number) + 1).join("")));
  }

  const question = [presence(questionFromHeading), presence(strip(bodyQuestion))]
    .filter((part) => part !== null)
    .join("\n\n");

  if (correctLetter !== null && /^[A-D]$/.test(correctLetter)) {
    const option = options[correctLetter.charCodeAt(0) - 65];
    if (option) option.correct = true;
  }

  return { type: "check", title: null, question, options, explanation, aftermath, xp: 15 };
}

/**
 * `:::check`: the first line is the question, then `- [x]` / `- [ ]` options.
 * Replaces v1 `LessonSectionParser#parse_check_block`.
 */
export function fencedCheck(titleLine: string, body: string): Section {
  const fullText = presence(titleLine) === null ? body : `${titleLine}\n${body}`;
  const all = lines(fullText).map(strip);
  const question = all.shift() ?? "";
  const options = all
    .filter((line) => CHECKBOX.test(line))
    .map((line) => ({
      label: strip(line.replace(CHECKBOX_PREFIX, "")),
      correct: line.includes("[x]"),
    }));
  return { type: "check", title: null, question, options, explanation: null };
}
