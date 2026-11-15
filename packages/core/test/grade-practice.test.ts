import { describe, expect, it } from "vitest";
import { grade } from "../src/learning/grader";

// Platform STEP 12 PR 1: the new question types, graded on the server from the block and the
// submission alone. One golden case each: right, wrong, partly right, and a malformed submission,
// which is ungradable and never counts as an answer.

const t = (es: string) => ({ es });
const right = (score = 100) => ({ correct: true, score, gradable: true, reason: null });
const wrong = (score: number) => ({ correct: false, score, gradable: true, reason: null });
const ungradable = { correct: null, score: null, gradable: false };

const order = {
  type: "order",
  prompt: t("Ordena el cambio de pastillas"),
  items: [
    t("Asegura la moto"),
    t("Quita los tornillos"),
    t("Saca las pastillas"),
    t("Pon las nuevas"),
  ],
};

const trueFalse = {
  type: "true_false",
  statements: [
    { text: t("El agua hierve a 100 °C al nivel del mar"), answer: true },
    { text: t("El hierro flota en el agua"), answer: false, why: t("Es más denso.") },
    { text: t("La Luna tiene luz propia"), answer: false },
    { text: t("Las plantas hacen fotosíntesis"), answer: true },
  ],
};

const estimate = {
  type: "estimate",
  prompt: t("¿Qué pH tiene el vinagre?"),
  min: 0,
  max: 14,
  step: 0.1,
  answer_min: 2.4,
  answer_max: 3.4,
};

const hotspot = {
  type: "hotspot",
  prompt: t("¿Cuál pieza se gasta?"),
  diagram: "brake",
  spots: [
    { x: 0.2, y: 0.5, label: t("Disco"), correct: false },
    { x: 0.62, y: 0.4, label: t("Pastilla"), correct: true },
    { x: 0.8, y: 0.7, label: t("Pistón"), correct: false },
  ],
};

describe("order", () => {
  it("is right in the given order, partly right by the items in place, wrong otherwise", () => {
    expect(grade(order, { order: [0, 1, 2, 3] })).toEqual(right());
    expect(grade(order, { order: [0, 1, 3, 2] })).toEqual(wrong(50));
    expect(grade(order, { order: [3, 2, 1, 0] })).toEqual(wrong(0));
  });

  it("is ungradable when the submission is not a permutation of the items", () => {
    for (const submission of [
      { order: [0, 1, 2] },
      { order: [0, 0, 1, 2] },
      { order: [0, 1, 2, 9] },
      {},
    ]) {
      expect(grade(order, submission)).toMatchObject(ungradable);
    }
  });
});

describe("true_false", () => {
  it("scores the statements answered right, and is right only when all are", () => {
    expect(grade(trueFalse, { answers: [true, false, false, true] })).toEqual(right());
    expect(grade(trueFalse, { answers: [true, true, false, true] })).toEqual(wrong(75));
    expect(grade(trueFalse, { answers: [false, true, true, false] })).toEqual(wrong(0));
  });

  it("is ungradable without one boolean per statement", () => {
    for (const submission of [
      { answers: [true, false] },
      { answers: [1, 0, 0, 1] },
      { answers: "yes" },
    ]) {
      expect(grade(trueFalse, submission)).toMatchObject(ungradable);
    }
  });
});

describe("estimate", () => {
  it("is right inside the answer range, and scores a miss by how far it lands", () => {
    expect(grade(estimate, { value: 3 })).toEqual(right());
    expect(grade(estimate, { value: 2.4 })).toEqual(right());
    expect(grade(estimate, { value: 4.8 })).toEqual(wrong(90));
    expect(grade(estimate, { value: 14 })).toEqual(wrong(24.29));
  });

  it("is ungradable outside the scale or without a number", () => {
    for (const submission of [
      { value: -1 },
      { value: 15 },
      { value: "3" },
      { value: Number.NaN },
    ]) {
      expect(grade(estimate, submission)).toMatchObject(ungradable);
    }
  });
});

describe("hotspot", () => {
  it("is right on a correct spot and wrong on another", () => {
    expect(grade(hotspot, { spot: 1 })).toEqual(right());
    expect(grade(hotspot, { spot: 0 })).toEqual(wrong(0));
    // One spot is one answer: there is no partly right.
    expect(grade(hotspot, { spot: 2 })).toEqual(wrong(0));
  });

  it("is ungradable on a spot that does not exist", () => {
    for (const submission of [{ spot: 3 }, { spot: -1 }, { spot: 1.5 }, { spot: "1" }]) {
      expect(grade(hotspot, submission)).toMatchObject(ungradable);
    }
  });
});

describe("open_answer", () => {
  it("leaves the grade to the tutor, and refuses an empty answer", () => {
    const block = {
      type: "open_answer",
      prompt: t("¿Por qué?"),
      rubric: [t("Nombra un imprevisto")],
    };
    expect(grade(block, { text: "Porque si pasa algo…" })).toEqual({
      ...ungradable,
      reason: "open_answer is graded by the tutor",
    });
    expect(grade(block, { text: "   " })).toMatchObject({
      ...ungradable,
      reason: "malformed submission",
    });
  });
});

describe("a malformed block", () => {
  it("is ungradable rather than a trap", () => {
    expect(grade({ type: "order", items: [t("solo uno")] }, { order: [0] })).toMatchObject(
      ungradable,
    );
    expect(
      grade(
        { ...hotspot, spots: hotspot.spots.map((s) => ({ ...s, correct: false })) },
        { spot: 0 },
      ),
    ).toMatchObject(ungradable);
    expect(grade({ ...estimate, answer_min: 9, answer_max: 2 }, { value: 3 })).toMatchObject(
      ungradable,
    );
  });
});
