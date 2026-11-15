import { describe, expect, it } from "vitest";
import { Block } from "../src/blocks/schema";
import { blockRole } from "../src/blocks/types";
import { answerable } from "../src/learning/grader";
import { importV1Block } from "../src/v1-import/import";

// Platform STEP 12 PR 1: the player's vocabulary. Every schema is strict, text is localized, and
// each sim kind carries its own params and nothing else.

const id = "01932c07-0000-7000-8000-000000000001";
const t = (es: string) => ({ es });
const parses = (block: Record<string, unknown>) => Block.safeParse({ id, ...block }).success;

const VALID: Record<string, Record<string, unknown>> = {
  order: {
    type: "order",
    prompt: t("Ordena"),
    items: [t("Uno"), t("Dos")],
    explanation: t("Así."),
  },
  true_false: {
    type: "true_false",
    statements: [
      { text: t("A"), answer: true },
      { text: t("B"), answer: false, why: t("Porque no.") },
    ],
  },
  estimate: {
    type: "estimate",
    prompt: t("¿pH?"),
    min: 0,
    max: 14,
    step: 0.1,
    unit: t("pH"),
    answer_min: 2.4,
    answer_max: 3.4,
    anchors: [{ value: 7, label: t("Agua") }],
  },
  hotspot: {
    type: "hotspot",
    prompt: t("¿Cuál?"),
    diagram: "brake",
    spots: [
      { x: 0.2, y: 0.5, label: t("Disco"), correct: false },
      { x: 0.6, y: 0.4, label: t("Pastilla"), correct: true },
    ],
  },
  worked_example: {
    type: "worked_example",
    problem: t("Resuelve 2x + 7 = 19"),
    steps: [{ label: t("Quita 7"), work: "2x = 12", why: t("De los dos lados.") }],
  },
  speak: {
    type: "speak",
    phrase: "Could we push the deadline?",
    lang: "en-US",
    translation: t("¿Podemos mover la entrega?"),
  },
  code_check: {
    type: "code_check",
    language: "javascript",
    starter: "function average(xs) {}",
    tests: [{ call: "average([8, 10])", expected: "9" }],
    hint: t("¿Y si está vacía?"),
  },
  open_answer: {
    type: "open_answer",
    prompt: t("¿Por qué?"),
    rubric: [t("Nombra un imprevisto")],
    model_answer: t("Porque…"),
  },
  sim: {
    type: "sim",
    prompt: t("Acomoda"),
    setup: { kind: "css_flex", target: { justify: "between", align: "center" } },
  },
};

describe("the new block types", () => {
  it.each(Object.keys(VALID))("%s parses with its fields", (type) => {
    expect(parses(VALID[type] as Record<string, unknown>)).toBe(true);
  });

  it.each(Object.keys(VALID))("%s refuses a field nobody declared", (type) => {
    expect(parses({ ...VALID[type], surprise: 1 })).toBe(false);
  });

  it("holds the sizes the player was designed for", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => t(String(i)));
    expect(parses({ ...VALID.order, items: items(1) })).toBe(false);
    expect(parses({ ...VALID.order, items: items(9) })).toBe(false);
    expect(parses({ ...VALID.true_false, statements: [{ text: t("A"), answer: true }] })).toBe(
      false,
    );
    expect(parses({ ...VALID.open_answer, rubric: items(6) })).toBe(false);
    expect(parses({ ...VALID.code_check, tests: [] })).toBe(false);
    expect(parses({ ...VALID.worked_example, steps: [] })).toBe(false);
  });

  it("checks what the grader needs before it is stored", () => {
    expect(parses({ ...VALID.estimate, answer_min: 3, answer_max: 2 })).toBe(false);
    expect(parses({ ...VALID.estimate, answer_max: 15 })).toBe(false);
    expect(parses({ ...VALID.estimate, step: 0 })).toBe(false);
    expect(parses({ ...VALID.hotspot, image_url: "https://example.com/a.png" })).toBe(false);
    const { diagram: _, ...noPicture } = VALID.hotspot as Record<string, unknown>;
    expect(parses(noPicture)).toBe(false);
    expect(parses({ ...noPicture, image_url: "https://example.com/a.png" })).toBe(true);
    expect(parses({ ...noPicture, image_url: "http://example.com/a.png" })).toBe(false);
    expect(
      parses({
        ...VALID.hotspot,
        spots: [
          { x: 0.2, y: 0.5, label: t("A"), correct: false },
          { x: 1.2, y: 0, label: t("B"), correct: true },
        ],
      }),
    ).toBe(false);
    expect(
      parses({
        ...VALID.hotspot,
        spots: [
          { x: 0.2, y: 0.5, label: t("A"), correct: false },
          { x: 0.3, y: 0, label: t("B"), correct: false },
        ],
      }),
    ).toBe(false);
    expect(parses({ ...VALID.code_check, language: "python" })).toBe(false);
    expect(parses({ ...VALID.speak, lang: "not a language" })).toBe(false);
  });

  it("adds the new fields to the types that exist", () => {
    expect(
      parses({
        type: "check",
        question: t("¿Cuál?"),
        options: [
          { label: t("A"), correct: true },
          { label: t("B"), correct: false, why: t("B es otra cosa.") },
        ],
      }),
    ).toBe(true);
    expect(
      parses({
        type: "drag_drop",
        pairs: [{ term: t("A"), definition: t("1") }],
        left_label: t("Momento"),
        right_label: t("Lo que dices"),
      }),
    ).toBe(true);
    expect(
      parses({
        type: "fill_blank",
        sentence: t("Hi ___"),
        blanks: [t("Laura")],
        choices: [t("Laura"), t("Ana")],
      }),
    ).toBe(true);
    expect(
      parses({
        type: "video",
        video_url: "https://example.com/v.mp4",
        chapters: [
          { at: 0, title: t("Inicio") },
          { at: 50, title: t("Exportar") },
        ],
      }),
    ).toBe(true);
    expect(
      parses({
        type: "video",
        video_url: "https://example.com/v.mp4",
        chapters: [{ at: -1, title: t("Antes") }],
      }),
    ).toBe(false);
  });
});

describe("the sim kinds", () => {
  const kind = (k: string, params: Record<string, unknown>) => ({
    type: "sim",
    prompt: t("Inténtalo"),
    setup: { kind: k, ...params },
  });
  const VALID_SIMS: [string, Record<string, unknown>][] = [
    ["piano_chord", { target: [0, 4, 7], low: 60, high: 76 }],
    ["guitar_chord", { target: { "5": 2, "4": 2 } }],
    ["camera_exposure", { scene_ev: 13, min_shutter_denominator: 250 }],
    ["compound_interest", { rate: 6, years: 10, goal: 20_000, min: 50, max: 300, step: 10 }],
    ["css_flex", { target: { justify: "between", align: "center" } }],
    ["fraction_pie", { parts: 8, target: 3 }],
    ["ohm", { target_amps: 2, v: [0, 12], r: [1, 12], tolerance: 0.05 }],
    [
      "equation_balance",
      {
        terms: [
          { formula: "H2", atoms: { H: 2 }, side: "left" },
          { formula: "O2", atoms: { O: 2 }, side: "left" },
          { formula: "H2O", atoms: { H: 2, O: 1 }, side: "right" },
        ],
        max: 6,
      },
    ],
    ["chess_mate_in_one", { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", solution: "a1a8" }],
    ["color_wheel", { base: 8, relation: "complement" }],
    [
      "roleplay",
      {
        lang: "en",
        turns: [
          {
            line: "Tell me about yourself.",
            choices: [
              { text: "I build APIs.", score: 2, note: t("Natural"), reply: "Nice." },
              { text: "Yes.", score: 0, note: t("Muy corto"), reply: "OK…" },
            ],
          },
        ],
      },
    ],
    ["cpr_rhythm", { min_bpm: 100, max_bpm: 120, count: 15 }],
    [
      "step_sequencer",
      { bpm: 90, rows: [{ name: t("Bombo"), steps: [0, 8] }], challenge: t("Mueve el hi-hat") },
    ],
  ];

  it.each(VALID_SIMS)("%s parses with its own params", (k, params) => {
    expect(parses(kind(k, params))).toBe(true);
  });

  it("refuses an unknown kind, another kind's params, and a goal that cannot be reached", () => {
    expect(parses(kind("theremin", {}))).toBe(false);
    expect(parses(kind("ohm", { target: { justify: "start", align: "start" } }))).toBe(false);
    expect(parses(kind("piano_chord", { target: [0, 4, 7], low: 60, high: 62 }))).toBe(false);
    expect(parses(kind("piano_chord", { target: [0, 12], low: 60, high: 76 }))).toBe(false);
    expect(parses(kind("fraction_pie", { parts: 8, target: 9 }))).toBe(false);
    expect(parses(kind("ohm", { target_amps: 50, v: [0, 12], r: [1, 12], tolerance: 0.05 }))).toBe(
      false,
    );
    expect(
      parses(
        kind("compound_interest", {
          rate: 6,
          years: 10,
          goal: 1_000_000,
          min: 50,
          max: 300,
          step: 10,
        }),
      ),
    ).toBe(false);
    expect(parses(kind("camera_exposure", { scene_ev: 40 }))).toBe(false);
    // The solution must be a move of the side to play; a7 is no mate but is still a legal move.
    expect(
      parses(
        kind("chess_mate_in_one", {
          fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
          solution: "a1b2",
        }),
      ),
    ).toBe(false);
    expect(parses(kind("chess_mate_in_one", { fen: "not a fen", solution: "a1a8" }))).toBe(false);
    // H2 + O2 → H2O2 balances, but H2 + O2 → O3 never can.
    expect(
      parses(
        kind("equation_balance", {
          terms: [
            { formula: "H2", atoms: { H: 2 }, side: "left" },
            { formula: "O3", atoms: { O: 3 }, side: "right" },
          ],
          max: 6,
        }),
      ),
    ).toBe(false);
  });
});

describe("the v1 import builder", () => {
  it("brings the new types in with their plain strings localized", async () => {
    const block = await importV1Block(
      { type: "order", prompt: "Order these", items: ["One", "Two"], explanation: "Like so." },
      { routeId: "r", lessonId: "l", position: 0, locale: "en" },
    );
    expect(block).toMatchObject({
      type: "order",
      prompt: { en: "Order these" },
      items: [{ en: "One" }, { en: "Two" }],
    });
    const sim = await importV1Block(
      { type: "sim", prompt: "Colorea 3/8", setup: { kind: "fraction_pie", parts: 8, target: 3 } },
      { routeId: "r", lessonId: "l", position: 1, locale: "es" },
    );
    expect(sim).toMatchObject({
      type: "sim",
      prompt: { es: "Colorea 3/8" },
      setup: { kind: "fraction_pie", parts: 8, target: 3 },
    });
    // The setup's own text is localized too.
    const sequencer = await importV1Block(
      {
        type: "sim",
        prompt: "Toca",
        setup: { kind: "step_sequencer", bpm: 90, rows: [{ name: "Bombo", steps: [0] }] },
      },
      { routeId: "r", lessonId: "l", position: 2, locale: "es" },
    );
    expect(sequencer).toMatchObject({ setup: { rows: [{ name: { es: "Bombo" } }] } });
  });
});

describe("gating", () => {
  it("gates every gradable new type, and never a type the server cannot grade", () => {
    for (const type of ["order", "true_false", "estimate", "hotspot", "sim"]) {
      expect(blockRole(type)).toMatchObject({ gradable: true, gating: true });
    }
    for (const type of ["worked_example", "speak", "code_check", "open_answer"]) {
      expect(blockRole(type).gating).toBe(false);
    }
    expect(blockRole("open_answer").gradable).toBe(true);
    expect(blockRole("sim", "cpr_rhythm")).toMatchObject({ gradable: false, gating: false });
    expect(blockRole("sim", "step_sequencer")).toMatchObject({ gradable: false, gating: false });
    expect(blockRole("sim", "ohm")).toMatchObject({ gradable: true, gating: true });
  });

  it("answers whether a student can answer each gating type as stored", () => {
    for (const type of ["order", "true_false", "estimate", "hotspot", "sim"]) {
      expect(answerable(VALID[type])).toBe(true);
    }
    expect(answerable({ type: "order", items: [t("solo")] })).toBe(false);
    expect(answerable({ type: "true_false", statements: [] })).toBe(false);
    expect(answerable({ ...VALID.estimate, answer_min: 20 })).toBe(false);
    expect(answerable({ ...VALID.hotspot, spots: [] })).toBe(false);
    expect(
      answerable({ type: "sim", prompt: t("x"), setup: { kind: "ohm", target_amps: 2 } }),
    ).toBe(false);
    expect(answerable({ type: "sim", setup: { kind: "cpr_rhythm" } })).toBe(true);
    expect(answerable({ type: "sim", setup: { kind: "theremin" } })).toBe(false);
    expect(answerable(VALID.open_answer)).toBe(true);
  });
});
