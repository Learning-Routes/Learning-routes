import type { Section } from "./types";

// The player's fences (Platform STEP 12), in the words authors write: each key in English or in
// Spanish, the line after `:::type` as the prompt. They give v1-shaped sections of plain strings;
// the v1 import localizes them and the block schema judges them. Nothing here throws.

const LINE_BREAK = /\r?\n/;
const LIST_ITEM = /^(?:\d+[.)]|[-*])\s+/;
const CODE = /```(\w*)\n([\s\S]*?)```/;
const RANGE = /^(-?[\d.,]+)\s*(?:\s(?:to|a|-|–)\s|\.\.)\s*(-?[\d.,]+)$/i;
const SPOT = /^[-*]\s*\[( |x|X)\]\s*(.+?)\s*@\s*(\d+(?:[.,]\d+)?)%\s+(\d+(?:[.,]\d+)?)%$/;
const ANCHOR = /^(-?[\d.,]+)\s*=\s*(.+)$/;
const TEST = /^(.+?)\s*=>\s*(.*)$/;
const TRAILING_NEWLINE = /\n$/;

const KEYS = {
  explanation: /^(?:explanation|explicaci[oó]n):\s*/i,
  true: /^(?:true|cierto|verdadero):\s*/i,
  false: /^(?:false|falso):\s*/i,
  why: /^(?:why|por qu[eé]):\s*/i,
  scale: /^(?:scale|escala):\s*/i,
  step: /^(?:step|paso):\s*/i,
  unit: /^(?:unit|unidad):\s*/i,
  answer: /^(?:answer|respuesta):\s*/i,
  anchor: /^(?:anchor|referencia):\s*/i,
  image: /^(?:image|imagen):\s*/i,
  diagram: /^(?:diagram|diagrama):\s*/i,
  language: /^(?:language|lang|idioma):\s*/i,
  translation: /^(?:translation|traducci[oó]n):\s*/i,
  test: /^(?:test|prueba):\s*/i,
  hint: /^(?:hint|pista):\s*/i,
  model: /^(?:model answer|respuesta modelo):\s*/i,
  kind: /^(?:kind|tipo):\s*/i,
} as const;

type Key = keyof typeof KEYS;

const linesOf = (body: string) =>
  body
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** The text after the first line that starts with this key, or undefined. */
function fieldOf(lines: string[], key: Key): string | undefined {
  const line = lines.find((each) => KEYS[key].test(each));
  return line?.replace(KEYS[key], "").trim();
}

const valuesOf = (lines: string[], key: Key) =>
  lines.filter((line) => KEYS[key].test(line)).map((line) => line.replace(KEYS[key], "").trim());

/** A number written with a decimal point or a decimal comma; NaN when it is not one. */
function numberOf(text: string | undefined): number {
  const value = (text ?? "").trim();
  return Number(value.includes(".") ? value : value.replace(",", "."));
}

function rangeOf(text: string | undefined): [number, number] {
  const match = RANGE.exec((text ?? "").trim());
  return match ? [numberOf(match[1]), numberOf(match[2])] : [Number.NaN, Number.NaN];
}

const listItems = (lines: string[]) =>
  lines.filter((line) => LIST_ITEM.test(line)).map((line) => line.replace(LIST_ITEM, "").trim());

const optional = (field: string, value: unknown) => (value === undefined ? {} : { [field]: value });

export function order(prompt: string, body: string): Section {
  const lines = linesOf(body);
  return {
    type: "order",
    prompt,
    items: listItems(lines),
    ...optional("explanation", fieldOf(lines, "explanation")),
  };
}

// An untitled fence's first line arrives as its title line: a fence with no prompt reads it too.
const whole = (firstLine: string, body: string) => `${firstLine}\n${body}`;

export function trueFalse(firstLine: string, body: string): Section {
  const statements: Record<string, unknown>[] = [];
  for (const line of linesOf(whole(firstLine, body))) {
    const answer = KEYS.true.test(line) ? true : KEYS.false.test(line) ? false : null;
    if (answer !== null) {
      statements.push({ text: line.replace(answer ? KEYS.true : KEYS.false, "").trim(), answer });
    } else if (KEYS.why.test(line) && statements.length > 0) {
      (statements.at(-1) as Record<string, unknown>).why = line.replace(KEYS.why, "").trim();
    }
  }
  return { type: "true_false", statements };
}

export function estimate(prompt: string, body: string): Section {
  const lines = linesOf(body);
  const [min, max] = rangeOf(fieldOf(lines, "scale"));
  const [answerMin, answerMax] = rangeOf(fieldOf(lines, "answer"));
  const anchors = valuesOf(lines, "anchor").flatMap((text) => {
    const match = ANCHOR.exec(text);
    return match ? [{ value: numberOf(match[1]), label: (match[2] as string).trim() }] : [];
  });
  return {
    type: "estimate",
    prompt,
    min,
    max,
    step: numberOf(fieldOf(lines, "step") ?? "1"),
    answer_min: answerMin,
    answer_max: answerMax,
    ...optional("unit", fieldOf(lines, "unit")),
    ...(anchors.length > 0 ? { anchors } : {}),
    ...optional("explanation", fieldOf(lines, "explanation")),
  };
}

export function hotspot(prompt: string, body: string): Section {
  const lines = linesOf(body);
  const spots = lines.flatMap((line) => {
    const match = SPOT.exec(line);
    if (!match) {
      return [];
    }
    const [, tick, label, x, y] = match;
    return [{ x: numberOf(x) / 100, y: numberOf(y) / 100, label, correct: tick !== " " }];
  });
  return {
    type: "hotspot",
    prompt,
    ...optional("image_url", fieldOf(lines, "image")),
    ...optional("diagram", fieldOf(lines, "diagram")),
    spots,
    ...optional("explanation", fieldOf(lines, "explanation")),
  };
}

export function workedExample(problem: string, body: string): Section {
  const steps = listItems(linesOf(body)).map((item) => {
    const [label = "", work = "", why = ""] = item.split("|").map((part) => part.trim());
    return { label, work, why };
  });
  return { type: "worked_example", problem, steps };
}

export function speak(phrase: string, body: string): Section {
  const lines = linesOf(body);
  return {
    type: "speak",
    phrase,
    lang: fieldOf(lines, "language") ?? "",
    ...optional("translation", fieldOf(lines, "translation")),
  };
}

export function codeCheck(firstLine: string, afterIt: string): Section {
  const body = whole(firstLine, afterIt);
  const code = CODE.exec(body);
  const named = (code?.[1] ?? "").toLowerCase();
  const rest = linesOf(code ? body.replace(code[0], "") : body);
  const tests = valuesOf(rest, "test").map((text) => {
    const match = TEST.exec(text);
    return { call: (match?.[1] ?? text).trim(), expected: (match?.[2] ?? "").trim() };
  });
  return {
    type: "code_check",
    // ```js is JavaScript too; anything else is refused by the schema.
    language: named === "js" ? "javascript" : named,
    starter: (code?.[2] ?? "").replace(TRAILING_NEWLINE, ""),
    tests,
    ...optional("hint", fieldOf(rest, "hint")),
  };
}

export function openAnswer(prompt: string, body: string): Section {
  const lines = linesOf(body);
  return {
    type: "open_answer",
    prompt,
    rubric: listItems(lines),
    ...optional("model_answer", fieldOf(lines, "model")),
  };
}

export function sim(prompt: string, body: string): Section {
  const code = CODE.exec(body);
  const lines = linesOf(code ? body.replace(code[0], "") : body);
  let params: unknown = {};
  try {
    params = JSON.parse(code?.[2] ?? "{}");
  } catch {
    // Not JSON: the setup keeps only its kind, and the schema refuses the block.
  }
  const own = params !== null && typeof params === "object" && !Array.isArray(params) ? params : {};
  return {
    type: "sim",
    prompt,
    ...optional("explanation", fieldOf(lines, "explanation")),
    setup: { ...own, kind: fieldOf(lines, "kind") ?? "" },
  };
}
