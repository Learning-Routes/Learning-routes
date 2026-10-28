import { presence, strip } from "../../coerce";
import { FENCE, isBoundary, splitAftermath } from "../aftermath";
import { lines, WS } from "../text";
import type { Section } from "./types";

const OPTION_LETTER = /^[A-D]$/;

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

// The scan of a heading check's body: the run of options, CORRECTA and EXPLICACIÓN.
interface Run {
  options: { label: string; correct: boolean }[];
  correctLetter: string | null;
  explanation: string | null;
  first: number | null;
  last: number | null;
  inFence: boolean;
  prevStructural: boolean;
  lastKind: Marker | null;
}

// Each step returns whether the run goes on after its line.
function step(run: Run, index: number, stripped: string): boolean {
  if (FENCE.test(stripped)) {
    // Before the first marker a fence belongs to the question; after it, it opens the aftermath.
    if (run.first !== null) return false;
    run.inFence = !run.inFence;
    run.prevStructural = false;
    return true;
  }
  if (run.inFence || stripped === "") {
    run.prevStructural = false;
    return true;
  }
  const kind = markerOf(stripped);
  return kind === null ? continuation(run, index, stripped) : marker(run, index, kind, stripped);
}

function continuation(run: Run, index: number, stripped: string): boolean {
  if (run.first === null) return true;
  // Only the wrapped rest of an option or an explanation continues the run.
  if (!(run.prevStructural && (run.lastKind === "option" || run.lastKind === "explanation"))) {
    return false;
  }
  if (isBoundary(stripped, ["heading", "rule"])) return false;
  const option = run.options.at(-1);
  if (run.lastKind === "option" && option) option.label = strip(`${option.label} ${stripped}`);
  if (run.lastKind === "explanation") run.explanation = strip(`${run.explanation} ${stripped}`);
  run.last = index;
  return true;
}

function expected(run: Run, kind: Marker): boolean {
  if (kind === "correct") return run.correctLetter === null;
  if (kind === "explanation") return run.explanation === null;
  return run.correctLetter === null && run.explanation === null;
}

function marker(run: Run, index: number, kind: Marker, stripped: string): boolean {
  if (!expected(run, kind)) return false;
  if (kind === "option")
    run.options.push({ label: stripped.replace(OPTION_PREFIX, ""), correct: false });
  if (kind === "correct") run.correctLetter = strip(stripped.replace(CORRECT, "")).toUpperCase();
  if (kind === "explanation") run.explanation = strip(stripped.replace(EXPLANATION, ""));
  run.lastKind = kind;
  run.first ??= index;
  run.last = index;
  run.prevStructural = true;
  return true;
}

/**
 * `## Pregunta:` / `## Question:`: the question, then a contiguous run of options,
 * one CORRECTA and one EXPLICACIÓN, then the aftermath. Markers count only outside
 * fenced code, and a line the run's grammar no longer expects ends it. Replaces v1
 * `LessonSectionParser#parse_heading_check`.
 */
export function headingCheck(questionFromHeading: string, body: string): Section {
  const all = lines(body);
  const run: Run = {
    options: [],
    correctLetter: null,
    explanation: null,
    first: null,
    last: null,
    inFence: false,
    prevStructural: false,
    lastKind: null,
  };
  for (const [index, line] of all.entries()) {
    if (!step(run, index, strip(line))) break;
  }
  const { options, correctLetter, explanation, first, last } = run;

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

  if (correctLetter !== null && OPTION_LETTER.test(correctLetter)) {
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
