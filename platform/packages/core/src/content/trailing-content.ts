import { presence, strip } from "../v1-import/loose-json";
import { lines, WS } from "./ruby-text";

const CLOSING_FENCE = /^[ \t]*\n?```[ \t]*\n?/;

// Where a block ends. A body handed to a section parser never holds a `##` line,
// but it often holds sub-headings, fenced code, rules and trailing prose. From
// the first of those to the end is the block's TRAILING CONTENT: what the author
// put after the block, kept on the section so nothing is swallowed and the section
// count never changes. v1, its golden fixtures and the stored field call it
// `aftermath`; the field keeps that name.

export const SUB_HEADING = new RegExp(`^#{3,6}${WS}`);
export const FENCE = /^(?:```|~~~)/;
const HORIZONTAL_RULE = new RegExp(`^(?:-{3,}|\\*{3,}|_{3,})${WS}*$`);

export type Boundary = "heading" | "fence" | "rule";
const ALL: Boundary[] = ["heading", "fence", "rule"];

/** Whether a stripped line ends a block. Replaces v1 `LessonSectionParser#aftermath_boundary?`. */
export function isBoundary(stripped: string, rules: Boundary[]): boolean {
  if (stripped === "") return false;
  return (
    (rules.includes("heading") && SUB_HEADING.test(stripped)) ||
    (rules.includes("fence") && FENCE.test(stripped)) ||
    (rules.includes("rule") && HORIZONTAL_RULE.test(stripped))
  );
}

/** Splits a body at its first boundary into [content, aftermath or null]. Replaces v1 `LessonSectionParser#split_aftermath`. */
export function splitAftermath(body: string, rules: Boundary[] = ALL): [string, string | null] {
  const all = lines(body);
  const boundary = all.findIndex((line) => isBoundary(strip(line), rules));
  if (boundary === -1) return [body, null];
  return [all.slice(0, boundary).join(""), presence(strip(all.slice(boundary).join("")))];
}

/** Every [stripped line, index] outside fenced code; the fence lines themselves are skipped. */
export function* linesOutsideFences(all: string[]): Generator<[string, number]> {
  let inFence = false;
  for (const [index, line] of all.entries()) {
    const stripped = strip(line);
    if (FENCE.test(stripped)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) yield [stripped, index];
  }
}

/**
 * Finds the first balanced top-level `{...}` in a body. Returns [json, remainder];
 * json is null when there is none, and then the remainder is the whole body. The
 * remainder is raw: each caller tidies it the way it needs. Replaces v1
 * `LessonSectionParser.split_json_object`.
 */
export function splitJsonObject(body: string): [string | null, string] {
  const start = body.indexOf("{");
  const end = start === -1 ? -1 : closingBrace(body, start);
  if (end === -1) return [null, body];
  return [body.slice(start, end + 1), body.slice(end + 1)];
}

// Where the object opened at `start` closes, skipping braces inside strings; -1 if never.
function closingBrace(body: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      [inString, escaped] = stringStep(char, escaped);
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// One character inside a JSON string: [still in the string, the next one is escaped].
function stringStep(char: string | undefined, escaped: boolean): [boolean, boolean] {
  if (escaped) return [true, false];
  if (char === "\\") return [true, true];
  return [char !== '"', false];
}

/** The fenced form's closing ``` follows the JSON and is not content. Replaces v1 `LessonSectionParser#strip_closing_fence`. */
export function stripClosingFence(remainder: string): string {
  return remainder.replace(CLOSING_FENCE, "");
}

/** JSON.parse that answers null instead of throwing: model output is untrusted. Replaces v1 `LessonSectionParser#safe_parse_json`. */
export function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
