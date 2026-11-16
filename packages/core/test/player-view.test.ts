import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  forLearner,
  fromLearner,
  gates,
  indexOfKey,
  itemKey,
  shuffled,
} from "../src/content/player-view";
import { fill } from "../src/copy/player";
import {
  detailOf,
  explanationOf,
  revealsSolution,
  solutionOf,
} from "../src/learning/player-feedback";

// What the player sends a learner and says back (Platform STEP 12): no answer before it is earned.

const ID = "0192d3a0-0000-7000-8000-0000000000e1";
const es = (text: string) => ({ es: text });

describe("forLearner", () => {
  it("takes the answer out of every kind that has one", () => {
    const cases: [string, Record<string, unknown>, string[]][] = [
      [
        "check",
        { question: es("¿?"), options: [{ label: es("A"), correct: true, why: es("w") }] },
        ['"correct"', '"why"'],
      ],
      ["fill_blank", { sentence: es("El ___"), blanks: [es("gato")] }, ["gato"]],
      ["true_false", { statements: [{ text: es("s"), answer: true, why: es("w") }] }, ["answer"]],
      ["estimate", { min: 0, max: 9, step: 1, answer_min: 3, answer_max: 4 }, ["answer_"]],
      ["hotspot", { spots: [{ x: 0, y: 0, label: es("p"), correct: true }] }, ["correct"]],
      ["open_answer", { prompt: es("p"), rubric: [], model_answer: es("secreto") }, ["secreto"]],
      [
        "sim",
        { sim: { kind: "chess_mate_in_one", fen: "8/8/8/8/8/8/8/8", solution: "a1a8" } },
        ["a1a8"],
      ],
      ["sim", { sim: { kind: "css_flex", target: { justify: "center" } } }, ["target"]],
      [
        "sim",
        {
          sim: {
            kind: "roleplay",
            turns: [
              { line: "Hi", choices: [{ text: "Yo", score: 2, note: es("bien"), reply: "Ok" }] },
            ],
          },
        },
        ["score", "bien"],
      ],
    ];
    for (const [kind, data, hidden] of cases) {
      const text = JSON.stringify(forLearner(ID, kind, data));
      for (const word of hidden) {
        expect(text, kind).not.toContain(word);
      }
    }
  });

  it("keeps what a learner needs to answer", () => {
    expect(forLearner(ID, "fill_blank", { blanks: [es("a"), es("b")] })).toEqual({ blankCount: 2 });
    expect(forLearner(ID, "cards", { cards: [] })).toEqual({ cards: [] });
    expect(forLearner(ID, "concept", { body: es("x"), explanation: es("y") })).toEqual({
      body: es("x"),
    });
    const sim = forLearner(ID, "sim", { sim: { kind: "ohm", target_amps: 2 } });
    expect(sim).toEqual({ sim: { kind: "ohm", target_amps: 2 } });
  });

  it("sends a match's definitions shuffled, under keys only the server reads", () => {
    const pairs = [0, 1, 2].map((i) => ({ term: es(`t${i}`), definition: es(`d${i}`) }));
    const view = forLearner(ID, "drag_drop", { pairs }) as {
      terms: { key: string }[];
      definitions: { key: string; text: unknown }[];
    };
    expect(view).not.toHaveProperty("pairs");
    expect(view.terms.map((t) => t.key)).toEqual([0, 1, 2].map((i) => itemKey(ID, i)));
    expect(view.definitions.map((d) => d.text)).not.toEqual(pairs.map((p) => p.definition));
    const matches = Object.fromEntries(
      [0, 1, 2].map((i) => [itemKey(ID, i), itemKey(ID, i + 1000)]),
    );
    expect(fromLearner(ID, "drag_drop", { pairs }, { matches })).toEqual({
      matches: { "0": "0", "1": "1", "2": "2" },
    });
    expect(fromLearner(ID, "drag_drop", { pairs }, { matches: { nope: "x" } })).toEqual({
      matches: {},
    });
  });

  it("passes other submissions through untouched", () => {
    expect(fromLearner(ID, "check", {}, { option_index: 1 })).toEqual({ option_index: 1 });
    expect(indexOfKey(ID, 3, "not a key")).toBe(-1);
  });
});

describe("shuffled", () => {
  it("is a permutation, the same every time, and never the identity", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 2, max: 12 }), (id, n) => {
        const order = shuffled(id, n);
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(shuffled(id, n)).toEqual(order);
        expect(order.every((value, i) => value === i)).toBe(false);
      }),
    );
  });
});

describe("the feedback", () => {
  const check = {
    options: [
      { label: es("A"), correct: false, why: es("por esto") },
      { label: es("B"), correct: true },
    ],
    explanation: es("general"),
  };

  it("explains a wrong option by its own why, and otherwise by the block's explanation", () => {
    expect(explanationOf("check", check, { option_index: 0 }, false)).toEqual(es("por esto"));
    expect(explanationOf("check", check, { option_index: 1 }, true)).toEqual(es("general"));
    expect(explanationOf("check", { options: [] }, { option_index: 0 }, false)).toBeNull();
  });

  it("shows the solution once passed, or after the second wrong try", () => {
    expect(revealsSolution(false, 1)).toBe(false);
    expect(revealsSolution(false, 2)).toBe(true);
    expect(revealsSolution(true, 1)).toBe(true);
    expect(solutionOf(ID, "check", check)).toEqual({ option_index: 1 });
    expect(solutionOf(ID, "order", { items: [1, 2] })).toEqual({
      order: [itemKey(ID, 0), itemKey(ID, 1)],
    });
    expect(solutionOf(ID, "fill_blank", { blanks: [es("a")] })).toEqual({ blanks: [es("a")] });
    expect(solutionOf(ID, "true_false", { statements: [{ answer: true }, {}] })).toEqual({
      answers: [true, false],
    });
    expect(solutionOf(ID, "estimate", { answer_min: 1, answer_max: 2 })).toEqual({
      min: 1,
      max: 2,
    });
    expect(solutionOf(ID, "hotspot", { spots: [{}, { correct: true }] })).toEqual({ spot: 1 });
    expect(solutionOf(ID, "drag_drop", { pairs: [{}] })).toEqual({
      matches: { [itemKey(ID, 0)]: itemKey(ID, 1000) },
    });
    expect(solutionOf(ID, "sim", { sim: { kind: "chess_mate_in_one", solution: "a1a8" } })).toEqual(
      { move: "a1a8" },
    );
    expect(solutionOf(ID, "sim", { sim: { kind: "piano_chord", target: [0] } })).toEqual({
      target: [0],
    });
    expect(solutionOf(ID, "sim", { sim: { kind: "ohm" } })).toBeNull();
    expect(solutionOf(ID, "concept", {})).toBeNull();
  });

  it("says which parts were wrong, in the learner's keys", () => {
    const statements = [{ answer: true, why: es("w") }, { answer: false }];
    expect(detailOf(ID, "true_false", { statements }, { answers: [true, true] }, null)).toEqual([
      { right: true, answer: true, why: es("w") },
      { right: false, answer: false, why: null },
    ]);
    expect(detailOf(ID, "order", {}, {}, [1, 2])).toEqual({ wrong: [1, 2] });
    const pairs = [{}, {}];
    expect(detailOf(ID, "drag_drop", { pairs }, { matches: { "0": "0", "1": "0" } }, null)).toEqual(
      {
        wrong: [itemKey(ID, 1)],
      },
    );
    const roleplay = {
      sim: {
        kind: "roleplay",
        turns: [
          {
            choices: [
              { score: 2, note: es("bien") },
              { score: 0, note: es("mal") },
            ],
          },
        ],
      },
    };
    expect(detailOf(ID, "sim", roleplay, { state: { picks: [1] } }, { points: 0 })).toEqual({
      points: 0,
      notes: [{ score: 0, note: es("mal") }],
    });
    expect(detailOf(ID, "sim", { sim: { kind: "ohm" } }, {}, { amps: 2 })).toEqual({ amps: 2 });
    expect(detailOf(ID, "sim", { sim: { kind: "ohm" } }, {}, undefined)).toBeNull();
    expect(detailOf(ID, "check", {}, {}, "x")).toBe("x");
  });
});

describe("gates and words", () => {
  it("gates questions, never practice", () => {
    expect(gates("check")).toBe(true);
    expect(gates("sim")).toBe(false);
    expect(gates("worked_example")).toBe(false);
  });

  it("fills a line's places", () => {
    expect(fill("{n} de {total}", { n: 2, total: 5 })).toBe("2 de 5");
  });
});
