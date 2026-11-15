import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Block } from "../src/blocks/schema";
import { answerable, grade } from "../src/learning/grader";
import { futureValue } from "../src/learning/player-grade";

const t = (es: string) => ({ es });
const id = "0190f0a0-0000-7000-8000-000000000001";

const order = { type: "order", prompt: t("Ordena"), items: [t("a"), t("b"), t("c")] };
const trueFalse = {
  type: "true_false",
  statements: [
    { text: t("uno"), answer: true },
    { text: t("dos"), answer: false },
  ],
};
const estimate = {
  type: "estimate",
  prompt: t("pH"),
  min: 0,
  max: 14,
  step: 0.1,
  answer_min: 2.4,
  answer_max: 3.4,
};
const hotspot = {
  type: "hotspot",
  prompt: t("Toca"),
  diagram: "disc_brake",
  spots: [
    { x: 0.2, y: 0.6, label: t("Disco"), correct: false },
    { x: 0.7, y: 0.5, label: t("Pastilla"), correct: true },
  ],
};
const sim = (params: Record<string, unknown>) => ({ type: "sim", prompt: t("Haz"), sim: params });

const SIMS = {
  piano: sim({ kind: "piano_chord", target: [0, 4, 7] }),
  guitar: sim({ kind: "guitar_chord", target: { "5": 2, "4": 2 } }),
  camera: sim({ kind: "camera_exposure", scene_ev: 13, min_shutter: 250 }),
  interest: sim({
    kind: "compound_interest",
    rate: 0.06,
    years: 10,
    goal: 20000,
    min: 50,
    max: 300,
    step: 5,
  }),
  flex: sim({ kind: "css_flex", target: { justify: "space-between", align: "center" } }),
  pie: sim({ kind: "fraction_pie", parts: 8, target: 3 }),
  ohm: sim({ kind: "ohm", target_amps: 2, v: [1, 12], r: [1, 12] }),
  water: sim({
    kind: "equation_balance",
    terms: [
      { formula: "H2", side: "left", atoms: { H: 2 } },
      { formula: "O2", side: "left", atoms: { O: 2 } },
      { formula: "H2O", side: "right", atoms: { H: 2, O: 1 } },
    ],
  }),
  chess: sim({
    kind: "chess_mate_in_one",
    fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1",
    solution: "a1a8",
    movable: ["a1"],
  }),
  wheel: sim({ kind: "color_wheel", base: 8, relation: "complement" }),
  roleplay: sim({
    kind: "roleplay",
    lang: "en-US",
    turns: [
      {
        line: "Tell me about yourself.",
        choices: [
          { text: "I build payment APIs.", score: 2, note: t("Natural."), reply: "Great." },
          { text: "I have 28 years.", score: 0, note: t("I'm 28."), reply: "Okay." },
        ],
      },
    ],
  }),
  cpr: sim({ kind: "cpr_rhythm" }),
};

describe("the player's types parse as blocks", () => {
  it.each([order, trueFalse, estimate, hotspot, ...Object.values(SIMS)])("%#", (block) => {
    expect(Block.safeParse({ id, ...block }).success).toBe(true);
  });

  it("refuses a sim whose kind nobody declared, and a field nobody declared", () => {
    expect(Block.safeParse({ id, ...sim({ kind: "laser", power: 3 }) }).success).toBe(false);
    expect(Block.safeParse({ id, ...order, extra: 1 }).success).toBe(false);
  });
});

describe("grade (STEP 12 types)", () => {
  it("order: identity is right; places out of order are partial", () => {
    expect(grade(order, { order: [0, 1, 2] })).toMatchObject({ correct: true, score: 100 });
    expect(grade(order, { order: [0, 2, 1] })).toMatchObject({
      correct: false,
      score: 33.33,
      detail: [1, 2],
    });
    expect(grade(order, { order: [0, 0, 1] })).toMatchObject({ correct: false, score: 0 });
    expect(grade({ type: "order", items: [t("solo")] }, { order: [0] }).gradable).toBe(false);
  });

  it("true_false: one answer per statement", () => {
    expect(grade(trueFalse, { answers: [true, false] })).toMatchObject({
      correct: true,
      score: 100,
    });
    expect(grade(trueFalse, { answers: [true, true] })).toMatchObject({
      correct: false,
      score: 50,
      detail: [1],
    });
    expect(grade(trueFalse, { answers: ["true", false] })).toMatchObject({ correct: false });
  });

  it("estimate: inside the range, and says which side a miss fell on", () => {
    expect(grade(estimate, { value: 3 })).toMatchObject({ correct: true });
    expect(grade(estimate, { value: 5.4 })).toMatchObject({ correct: false, detail: "high" });
    expect(grade(estimate, { value: "3" })).toMatchObject({ correct: false });
  });

  it("hotspot: a spot marked correct", () => {
    expect(grade(hotspot, { spot: 1 })).toMatchObject({ correct: true });
    expect(grade(hotspot, { spot: 0 })).toMatchObject({ correct: false });
    expect(grade(hotspot, { spot: 9 })).toMatchObject({ correct: false });
  });

  it("piano: the chord's pitch classes, in any octave, and nothing else", () => {
    expect(grade(SIMS.piano, { state: { notes: [60, 64, 67] } }).correct).toBe(true);
    expect(grade(SIMS.piano, { state: { notes: [64, 67, 72] } }).correct).toBe(true);
    expect(grade(SIMS.piano, { state: { notes: [60, 63, 67] } })).toMatchObject({
      correct: false,
      detail: { extra: [3], missing: [4] },
    });
  });

  it("guitar: the exact frets", () => {
    expect(grade(SIMS.guitar, { state: { frets: { "5": 2, "4": 2 } } }).correct).toBe(true);
    expect(grade(SIMS.guitar, { state: { frets: { "5": 2, "3": 2 } } })).toMatchObject({
      correct: false,
      detail: [3, 4],
    });
  });

  it("camera: exposed and fast enough", () => {
    // f/5.6, 1/250, ISO 100 is EV 12.94.
    expect(grade(SIMS.camera, { state: { aperture: 3, shutter: 3, iso: 0 } }).correct).toBe(true);
    // f/8, 1/125: exposed but too slow to freeze.
    expect(grade(SIMS.camera, { state: { aperture: 4, shutter: 2, iso: 0 } })).toMatchObject({
      correct: false,
      detail: "blur",
    });
    expect(grade(SIMS.camera, { state: { aperture: 0, shutter: 0, iso: 5 } })).toMatchObject({
      correct: false,
      detail: "bright",
    });
  });

  it("compound interest: the future value reaches the goal", () => {
    expect(futureValue(125, 0.06, 10)).toBeGreaterThan(20000);
    expect(grade(SIMS.interest, { state: { monthly: 125 } }).correct).toBe(true);
    expect(grade(SIMS.interest, { state: { monthly: 100 } }).correct).toBe(false);
  });

  it("flex, pie, ohm, wheel", () => {
    expect(grade(SIMS.flex, { state: { justify: "space-between", align: "center" } }).correct).toBe(
      true,
    );
    expect(grade(SIMS.flex, { state: { justify: "center", align: "center" } })).toMatchObject({
      correct: false,
      score: 50,
    });
    expect(grade(SIMS.pie, { state: { parts: [0, 1, 2] } }).correct).toBe(true);
    expect(grade(SIMS.pie, { state: { parts: [0, 1, 1, 2, 3] } })).toMatchObject({
      correct: false,
      detail: { count: 4 },
    });
    expect(grade(SIMS.ohm, { state: { v: 6, r: 3 } }).correct).toBe(true);
    expect(grade(SIMS.ohm, { state: { v: 13, r: 6.5 } }).correct).toBe(false);
    expect(grade(SIMS.wheel, { state: { pick: 2 } }).correct).toBe(true);
    expect(grade(SIMS.wheel, { state: { pick: 7 } })).toMatchObject({
      correct: false,
      detail: { distance: 1 },
    });
  });

  it("equation: any balancing multiple, and says when it is not the smallest", () => {
    expect(grade(SIMS.water, { state: { coefficients: [2, 1, 2] } })).toMatchObject({
      correct: true,
      detail: { smallest: true },
    });
    expect(grade(SIMS.water, { state: { coefficients: [4, 2, 4] } })).toMatchObject({
      correct: true,
      detail: { smallest: false },
    });
    expect(grade(SIMS.water, { state: { coefficients: [1, 1, 1] } })).toMatchObject({
      correct: false,
      detail: { off: ["O"] },
    });
  });

  it("chess, roleplay; and practice kinds are ungradable", () => {
    expect(grade(SIMS.chess, { state: { move: "A1A8" } }).correct).toBe(true);
    expect(grade(SIMS.chess, { state: { move: "a1a7" } }).correct).toBe(false);
    expect(grade(SIMS.roleplay, { state: { picks: [0] } }).correct).toBe(true);
    expect(grade(SIMS.roleplay, { state: { picks: [1] } }).correct).toBe(false);
    expect(grade(SIMS.cpr, { state: {} }).gradable).toBe(false);
  });

  it("answerable: the new gates need what makes them answerable", () => {
    expect(answerable(order)).toBe(true);
    expect(
      answerable({ ...hotspot, spots: hotspot.spots.map((s) => ({ ...s, correct: false })) }),
    ).toBe(false);
    expect(answerable({ ...estimate, answer_min: undefined })).toBe(false);
  });

  it("never throws on any submission or any block shape", () => {
    const blocks = [order, trueFalse, estimate, hotspot, ...Object.values(SIMS)];
    fc.assert(
      fc.property(fc.constantFrom(...blocks), fc.jsonValue(), (block, submission) => {
        const result = grade(block, submission);
        expect(typeof result.gradable).toBe("boolean");
      }),
    );
    fc.assert(
      fc.property(
        fc.constantFrom("order", "true_false", "estimate", "hotspot", "sim"),
        fc.jsonValue(),
        fc.jsonValue(),
        (type, body, submission) => {
          const block = {
            ...(typeof body === "object" && body && !Array.isArray(body) ? body : {}),
            type,
          };
          grade(block, submission);
          answerable(block);
        },
      ),
    );
  });
});
