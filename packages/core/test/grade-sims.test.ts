import { describe, expect, it } from "vitest";
import { grade } from "../src/learning/grader";

// Platform STEP 12 PR 1: each sim kind's pure grader. It recomputes the goal from the submitted
// state and never reads a client's verdict. Golden cases: right, wrong, partly right, malformed.

const t = (es: string) => ({ es });
const sim = (kind: string, params: Record<string, unknown>) => ({
  type: "sim",
  prompt: t("Inténtalo"),
  setup: { kind, ...params },
});
const right = (score = 100) => ({ correct: true, score, gradable: true, reason: null });
const wrong = (score: number) => ({ correct: false, score, gradable: true, reason: null });
const ungradable = { correct: null, score: null, gradable: false };
const at = (block: unknown, state: unknown) => grade(block, { state });

describe("piano_chord", () => {
  const block = sim("piano_chord", { target: [0, 4, 7], low: 60, high: 76 });
  it("is right on exactly the target's pitch classes, in any octave", () => {
    expect(at(block, { notes: [60, 64, 67] })).toEqual(right());
    expect(at(block, { notes: [64, 67, 72] })).toEqual(right());
    expect(at(block, { notes: [60, 64, 69] })).toEqual(wrong(50));
    expect(at(block, { notes: [61, 63, 66] })).toEqual(wrong(0));
  });
  it("is ungradable off the keyboard or with no notes", () => {
    for (const state of [{ notes: [59] }, { notes: [] }, { notes: [60, 60] }, { notes: [60.5] }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("guitar_chord", () => {
  const block = sim("guitar_chord", { target: { "5": 2, "4": 2 } });
  it("is right on the exact fretted strings, open strings left out", () => {
    expect(at(block, { frets: { "5": 2, "4": 2 } })).toEqual(right());
    expect(at(block, { frets: { "5": 2, "4": 2, "1": 0 } })).toEqual(right());
    expect(at(block, { frets: { "5": 2 } })).toEqual(wrong(50));
    expect(at(block, { frets: { "3": 1 } })).toEqual(wrong(0));
  });
  it("is ungradable on a string or fret the neck does not have", () => {
    for (const state of [{ frets: { "7": 1 } }, { frets: { "5": 6 } }, { frets: [2, 2] }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("camera_exposure", () => {
  const block = sim("camera_exposure", { scene_ev: 13, min_shutter_denominator: 250 });
  it("is right when the exposure lands within half a stop and the shutter is fast enough", () => {
    expect(at(block, { aperture: 5.6, shutter: 250, iso: 100 })).toEqual(right());
    // Well exposed, but too slow to freeze the cyclist.
    expect(at(block, { aperture: 8, shutter: 125, iso: 100 })).toEqual(wrong(50));
    expect(at(block, { aperture: 2.8, shutter: 60, iso: 400 })).toEqual(wrong(0));
  });
  it("is ungradable off the fixed lists", () => {
    for (const state of [
      { aperture: 3, shutter: 250, iso: 100 },
      { aperture: 5.6, shutter: 100, iso: 100 },
      {},
    ]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("compound_interest", () => {
  const block = sim("compound_interest", {
    rate: 6,
    years: 10,
    goal: 20_000,
    min: 50,
    max: 300,
    step: 10,
  });
  it("is right when the saving reaches the goal, and scores the share reached", () => {
    expect(at(block, { monthly: 130 })).toEqual(right());
    expect(at(block, { monthly: 100 })).toEqual(wrong(81.94));
    expect(at(block, { monthly: 50 })).toEqual(wrong(40.97));
  });
  it("is ungradable off the slider", () => {
    for (const state of [{ monthly: 105 }, { monthly: 400 }, { monthly: "100" }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("css_flex", () => {
  const block = sim("css_flex", { target: { justify: "between", align: "center" } });
  it("is right on an exact match", () => {
    expect(at(block, { justify: "between", align: "center" })).toEqual(right());
    expect(at(block, { justify: "between", align: "start" })).toEqual(wrong(50));
    expect(at(block, { justify: "start", align: "start" })).toEqual(wrong(0));
  });
  it("is ungradable on a value it does not offer", () => {
    expect(at(block, { justify: "space-around", align: "center" })).toMatchObject(ungradable);
  });
});

describe("fraction_pie", () => {
  const block = sim("fraction_pie", { parts: 8, target: 3 });
  it("is right when as many parts as the target are coloured", () => {
    expect(at(block, { selected: [0, 2, 5] })).toEqual(right());
    expect(at(block, { selected: [0, 1] })).toEqual(wrong(66.67));
    expect(at(block, { selected: [] })).toEqual(wrong(0));
  });
  it("is ungradable on a part the pie does not have, or one picked twice", () => {
    for (const state of [{ selected: [8] }, { selected: [1, 1, 2] }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("ohm", () => {
  const block = sim("ohm", { target_amps: 2, v: [0, 12], r: [1, 12], tolerance: 0.05 });
  it("is right when V/R is within the tolerance of the target", () => {
    expect(at(block, { v: 12, r: 6 })).toEqual(right());
    expect(at(block, { v: 6, r: 6 })).toEqual(wrong(50));
    expect(at(block, { v: 12, r: 1 })).toEqual(wrong(0));
  });
  it("is ungradable outside the sliders", () => {
    for (const state of [{ v: 13, r: 6 }, { v: 6, r: 0 }, { v: 6 }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("equation_balance", () => {
  const block = sim("equation_balance", {
    terms: [
      { formula: "H2", atoms: { H: 2 }, side: "left" },
      { formula: "O2", atoms: { O: 2 }, side: "left" },
      { formula: "H2O", atoms: { H: 2, O: 1 }, side: "right" },
    ],
    max: 6,
  });
  it("is right when every element balances, and says when it is not the smallest", () => {
    expect(at(block, { coefficients: [2, 1, 2] })).toEqual(right());
    expect(at(block, { coefficients: [4, 2, 4] })).toEqual({ ...right(), note: "not_smallest" });
    expect(at(block, { coefficients: [1, 1, 1] })).toEqual(wrong(50));
    expect(at(block, { coefficients: [3, 1, 1] })).toEqual(wrong(0));
  });
  it("is ungradable with a coefficient out of range or one per term missing", () => {
    for (const state of [
      { coefficients: [0, 1, 2] },
      { coefficients: [7, 1, 2] },
      { coefficients: [2, 1] },
    ]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("chess_mate_in_one", () => {
  const block = sim("chess_mate_in_one", {
    fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    solution: "a1a8",
  });
  it("is right on the solution's move only", () => {
    expect(at(block, { move: "a1a8" })).toEqual(right());
    // The right piece to the wrong square is no mate: there is no partly right.
    expect(at(block, { move: "a1a7" })).toEqual(wrong(0));
    expect(at(block, { move: "g1h1" })).toEqual(wrong(0));
  });
  it("is ungradable on something that is not a move", () => {
    for (const state of [{ move: "a1a9" }, { move: "rook to a8" }, {}]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("color_wheel", () => {
  it("is right by hue arithmetic for each relation", () => {
    const complement = sim("color_wheel", { base: 8, relation: "complement" });
    expect(at(complement, { pick: 2 })).toEqual(right());
    expect(at(complement, { pick: 7 })).toEqual(wrong(0));
    const analogous = sim("color_wheel", { base: 0, relation: "analogous" });
    expect(at(analogous, { pick: 11 })).toEqual(right());
    expect(at(analogous, { pick: 1 })).toEqual(right());
    // A triad partner is a harmony, but not the one asked for.
    expect(at(analogous, { pick: 4 })).toEqual(wrong(0));
    const triad = sim("color_wheel", { base: 8, relation: "triad" });
    expect(at(triad, { pick: 0 })).toEqual(right());
    expect(at(triad, { pick: 4 })).toEqual(right());
  });
  it("is ungradable off the wheel, or on the base itself", () => {
    const block = sim("color_wheel", { base: 8, relation: "complement" });
    for (const state of [{ pick: 12 }, { pick: 8 }, { pick: "2" }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("roleplay", () => {
  const turn = (line: string) => ({
    line,
    choices: [
      { text: "Best", score: 2, note: t("Natural"), reply: "Great." },
      { text: "Fine", score: 1, note: t("Correcto"), reply: "OK." },
      { text: "Off", score: 0, note: t("Así no"), reply: "Sorry?" },
    ],
  });
  const block = sim("roleplay", {
    lang: "en",
    turns: [turn("Tell me about yourself."), turn("Why us?")],
  });
  it("scores the sum of the choices, and is right from 80%", () => {
    expect(at(block, { choices: [0, 0] })).toEqual(right());
    expect(at(block, { choices: [0, 1] })).toEqual(wrong(75));
    expect(at(block, { choices: [2, 2] })).toEqual(wrong(0));
    const five = sim("roleplay", {
      lang: "en",
      turns: Array.from({ length: 5 }, () => turn("Hi")),
    });
    expect(at(five, { choices: [0, 0, 0, 1, 1] })).toEqual(right(80));
  });
  it("is ungradable without one choice per turn", () => {
    for (const state of [{ choices: [0] }, { choices: [0, 3] }, { choices: [0, -1] }]) {
      expect(at(block, state)).toMatchObject(ungradable);
    }
  });
});

describe("engagement-only kinds", () => {
  it("never grade: the client measures cpr_rhythm and step_sequencer", () => {
    const cpr = sim("cpr_rhythm", { min_bpm: 100, max_bpm: 120, count: 15 });
    expect(at(cpr, { taps: [0, 550, 1100] })).toMatchObject({
      ...ungradable,
      reason: "sim cpr_rhythm is engagement-only",
    });
    const sequencer = sim("step_sequencer", { bpm: 90, rows: [{ name: "Bombo", steps: [0, 8] }] });
    expect(at(sequencer, {})).toMatchObject(ungradable);
  });
});

describe("a malformed sim", () => {
  it("is ungradable: an unknown kind, missing params, or no state", () => {
    expect(at(sim("theremin", {}), { notes: [60] })).toMatchObject(ungradable);
    expect(at(sim("ohm", { target_amps: 2 }), { v: 2, r: 1 })).toMatchObject(ungradable);
    expect(
      grade(sim("css_flex", { target: { justify: "start", align: "start" } }), {}),
    ).toMatchObject(ungradable);
  });
});
