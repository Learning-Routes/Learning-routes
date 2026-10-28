import { isBlank, presence, strip } from "../../coerce";
import { linesOutsideFences, splitAftermath } from "../aftermath";
import { lines, round1, splitOnce, WS } from "../text";
import type { Section } from "./types";

const CODE_FENCE = /```(\w+)\n([\s\S]*?)```/;
const LABEL_SEPARATOR = /[:=]/;
const FORMULA_WORD = /formula|equation|f\(/i;

/**
 * `## Match:`: pairs written `term ==> definition`, as one contiguous run outside
 * fenced code. Prose before the first pair is the intro; after the last, the
 * aftermath. Replaces v1 `LessonSectionParser#parse_heading_drag_drop`.
 */
export function dragDrop(title: string, body: string): Section {
  const all = lines(body);
  const pairIndexes: number[] = [];
  for (const [stripped, i] of linesOutsideFences(all)) {
    if ((all[i] as string).includes("==>")) pairIndexes.push(i);
    else if (!isBlank(stripped) && pairIndexes.length > 0) break;
  }

  const pairs = pairIndexes.map((i) => {
    const [term, definition] = splitOnce(strip(all[i] as string), "==>");
    return { term: strip(term), definition: strip(definition ?? "") };
  });
  const intro = presence(strip(all.slice(0, pairIndexes[0] ?? all.length).join("")));
  const lastPair = pairIndexes.at(-1);
  const aftermath =
    lastPair !== undefined && lastPair + 1 < all.length
      ? presence(strip(all.slice(lastPair + 1).join("")))
      : null;

  return { type: "drag_drop", title: presence(title), intro, pairs, aftermath, body };
}

const BLANK = /BLANK--([^\n]+?)--BLANK/g;

/**
 * `## Complete:`: a sentence with `BLANK--word--BLANK` tokens, which become `___`.
 * Replaces v1 `LessonSectionParser#parse_heading_fill_blank`.
 */
export function fillBlank(title: string, body: string): Section {
  const [content, aftermath] = splitAftermath(strip(body));
  const text = strip(content);
  const blanks = [...text.matchAll(BLANK)].map((match) => match[1] as string);
  const sentence = text.replace(BLANK, "___");
  return { type: "fill_blank", title: presence(title), sentence, blanks, aftermath, body };
}

/**
 * `## Playground:`: a fenced code block; what follows it is the expected output,
 * up to the aftermath. Replaces v1 `LessonSectionParser#parse_heading_code_playground`.
 */
export function codePlayground(title: string, body: string): Section {
  const text = strip(body);
  const match = CODE_FENCE.exec(text);
  const language = match ? (match[1] as string) : "python";
  const code = match ? strip(match[2] as string) : text;
  // Split what follows the code: the block's own fence is not its terminator.
  const afterCode = match ? text.slice(match.index + match[0].length) : "";
  const [expectedText, aftermath] = splitAftermath(afterCode);
  return {
    type: "code_playground",
    title: presence(title),
    language,
    code,
    expected_output: presence(strip(expectedText)),
    aftermath,
    body,
  };
}

const VARIABLE = new RegExp(`^\\w+${WS}*[:=]`);
const RANGE = new RegExp(`(\\d+(?:\\.\\d+)?)${WS}*(?:to|-|\\.\\.)${WS}*(\\d+(?:\\.\\d+)?)`);

/**
 * `## Simulation:`: `name: min to max` variables and a formula line.
 * Replaces v1 `LessonSectionParser#parse_heading_simulation`.
 */
export function simulation(title: string, body: string): Section {
  const [content, aftermath] = splitAftermath(strip(body));
  const variables: { name: string; min: number; max: number; default: number }[] = [];
  let formula: string | null = null;

  for (const line of lines(content)) {
    const stripped = strip(line);
    if (VARIABLE.test(stripped)) {
      const at = stripped.search(LABEL_SEPARATOR);
      const range = RANGE.exec(stripped.slice(at + 1));
      if (range) {
        const min = Number.parseFloat(range[1] as string);
        const max = Number.parseFloat(range[2] as string);
        variables.push({
          name: strip(stripped.slice(0, at)),
          min,
          max,
          default: round1((min + max) / 2),
        });
      }
    } else if (FORMULA_WORD.test(stripped) || stripped.includes("=")) {
      formula ??= stripped;
    }
  }
  return { type: "simulation", title: presence(title), variables, formula, aftermath, body };
}

const OPTION = new RegExp(`^OPTION${WS}+[A-Z][:.]?${WS}*`, "i");

/**
 * `## Scenario:`: a situation, then `OPTION A:` lines, each followed by its
 * consequence. Replaces v1 `LessonSectionParser#parse_heading_scenario`.
 */
export function scenario(title: string, body: string): Section {
  const [content, aftermath] = splitAftermath(strip(body));
  const situation: string[] = [];
  const options: { label: string; lines: string[] }[] = [];

  for (const line of lines(content)) {
    const stripped = strip(line);
    const current = options.at(-1);
    if (OPTION.test(stripped))
      options.push({ label: strip(stripped.replace(OPTION, "")), lines: [] });
    // Blank lines are kept in a consequence: it renders as markdown paragraphs.
    else if (current) current.lines.push(stripped);
    else situation.push(stripped);
  }

  return {
    type: "scenario",
    title: presence(title),
    situation: strip(situation.join(" ")),
    options: options.map((option) => ({
      label: option.label,
      consequence: strip(option.lines.join("\n")),
    })),
    aftermath,
    body,
  };
}

const FRONT = new RegExp(`^FRONT[:.]?${WS}*`, "i");
const BACK = new RegExp(`^BACK[:.]?${WS}*`, "i");

const joinLine = (text: string | null, line: string) => (text === null ? line : `${text} ${line}`);

/**
 * `## Flashcards:`: FRONT / BACK pairs separated by `---`, which here belongs to
 * the block rather than ending it. Replaces v1 `LessonSectionParser#parse_heading_flashcards`.
 */
export function flashcards(title: string, body: string): Section {
  const [content, aftermath] = splitAftermath(body, ["heading", "fence"]);
  const cards: { front: string; back: string }[] = [];
  let front: string | null = null;
  let back: string | null = null;
  let side: "front" | "back" = "front";
  const finishCard = () => {
    if (front !== null && back !== null) cards.push({ front: strip(front), back: strip(back) });
  };

  for (const line of lines(content)) {
    const stripped = strip(line);
    if (stripped === "---") {
      finishCard();
      front = null;
      back = null;
      side = "front";
    } else if (FRONT.test(stripped)) {
      front = stripped.replace(FRONT, "");
      side = "front";
    } else if (BACK.test(stripped)) {
      back = stripped.replace(BACK, "");
      side = "back";
    } else if (side === "front") {
      front = joinLine(front, stripped);
    } else {
      back = joinLine(back, stripped);
    }
  }
  finishCard();

  return { type: "flashcards", title: presence(title), cards, aftermath, body };
}
