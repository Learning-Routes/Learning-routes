import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { isoOf } from "../../src/actions/player-progress";
import { ACTIONS } from "../../src/actions/registry";
import { itemKey } from "../../src/content/player-view";
import { ENROLLMENT, ENROLLMENTS, ROUTE, testCtx, testWorld } from "./test-ctx";

const LESSON = "0192d3a0-0000-7000-8000-0000000000c1";
const CHECK = "0192d3a0-0000-7000-8000-0000000000d1";
const ORDER = "0192d3a0-0000-7000-8000-0000000000d2";
const PIANO = "0192d3a0-0000-7000-8000-0000000000d3";
const CONCEPT = "0192d3a0-0000-7000-8000-0000000000d4";

function world() {
  const w = testWorld();
  const snapshot = w.versions.get(`${ROUTE}:1`)?.snapshot;
  if (!snapshot) {
    throw new Error("no snapshot");
  }
  snapshot.lessons.push({
    id: LESSON,
    moduleId: snapshot.modules[0]?.id ?? "",
    position: "V",
    title: { es: "Un tema" },
  });
  snapshot.blocks.push(
    {
      id: CONCEPT,
      lessonId: LESSON,
      position: "a",
      kind: "concept",
      data: { body: { es: "Hola" } },
    },
    {
      id: CHECK,
      lessonId: LESSON,
      position: "b",
      kind: "check",
      data: {
        question: { es: "3x − 5 = 10" },
        options: [
          { label: { es: "x = 3" }, correct: false },
          { label: { es: "x = 5/3" }, correct: false, why: { es: "Te faltó un paso" } },
          { label: { es: "x = 5" }, correct: true },
        ],
        explanation: { es: "Suma 5 y divide entre 3." },
      },
    },
    {
      id: ORDER,
      lessonId: LESSON,
      position: "c",
      kind: "order",
      data: { prompt: { es: "Ordena" }, items: [{ es: "uno" }, { es: "dos" }, { es: "tres" }] },
    },
    {
      id: PIANO,
      lessonId: LESSON,
      position: "d",
      kind: "sim",
      data: {
        prompt: { es: "Do mayor" },
        sim: { kind: "piano_chord", target: [0, 4, 7], low: 60, high: 76 },
      },
    },
  );
  return w;
}

const ctx = (w: ReturnType<typeof world>, who = "student-1") => testCtx("ui", w, who);

describe("lesson.play", () => {
  it("sends the beats without their answers", async () => {
    const w = world();
    const answer = await runAction(
      ACTIONS,
      "lesson.play",
      { enrollmentId: ENROLLMENT, topic: 1 },
      ctx(w),
    );
    expect(answer.ok).toBe(true);
    const text = JSON.stringify(answer);
    expect(text).not.toContain('"correct":true');
    expect(text).not.toContain("Suma 5");
    expect(text).not.toContain("Te faltó");
    expect(text).not.toContain('"target"');
    const output = (
      answer as {
        output: { beats: { kind: string; data: Record<string, unknown>; gradable: boolean }[] };
      }
    ).output;
    expect(output.beats.map((b) => b.kind)).toEqual(["concept", "check", "order", "sim"]);
    const order = output.beats[2]?.data.items as { key: string }[];
    expect(order.map((i) => i.key)).not.toEqual([0, 1, 2].map((i) => itemKey(ORDER, i)));
    expect(output.beats.map((b) => b.gradable)).toEqual([false, true, true, true]);
  });

  it("does not exist for another student", async () => {
    const w = world();
    const answer = await runAction(
      ACTIONS,
      "lesson.play",
      { enrollmentId: ENROLLMENTS["student-2"], topic: 1 },
      ctx(w),
    );
    expect(answer).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("lesson.answer", () => {
  it("grades on the server, explains a wrong option, keeps the attempt and awards XP once", async () => {
    const w = world();
    const wrong = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: CHECK, submission: { option_index: 1 } },
      ctx(w),
    );
    expect(wrong).toMatchObject({
      ok: true,
      output: {
        correct: false,
        attempts: 1,
        explanation: { es: "Te faltó un paso" },
        solution: null,
        xp: { gained: 0 },
      },
    });

    const right = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: CHECK, submission: { option_index: 2 } },
      ctx(w),
    );
    expect(right).toMatchObject({
      ok: true,
      output: { correct: true, attempts: 2, xp: { gained: 5, topic: 5 } },
    });

    const again = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: CHECK, submission: { option_index: 2 } },
      ctx(w),
    );
    expect(again).toMatchObject({
      ok: true,
      output: { correct: true, xp: { gained: 0, topic: 5 } },
    });

    const play = await runAction(
      ACTIONS,
      "lesson.play",
      { enrollmentId: ENROLLMENT, topic: 1 },
      ctx(w),
    );
    expect(play).toMatchObject({ ok: true, output: { xp: { topic: 5 } } });
  });

  it("reads keyed answers for an order question, and a simulator's state", async () => {
    const w = world();
    const order = await runAction(
      ACTIONS,
      "lesson.answer",
      {
        enrollmentId: ENROLLMENT,
        blockId: ORDER,
        submission: { order: [0, 1, 2].map((i) => itemKey(ORDER, i)) },
      },
      ctx(w),
    );
    expect(order).toMatchObject({ ok: true, output: { correct: true, xp: { gained: 10 } } });

    const piano = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: PIANO, submission: { state: { notes: [60, 63, 67] } } },
      ctx(w),
    );
    expect(piano).toMatchObject({
      ok: true,
      output: { correct: false, detail: { missing: [4], extra: [3] } },
    });
  });

  it("refuses another student's enrollment and a block of no such route", async () => {
    const w = world();
    const other = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENTS["student-2"], blockId: CHECK, submission: {} },
      ctx(w),
    );
    expect(other).toMatchObject({ ok: false, code: "not_found" });
    const nowhere = await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: "0192d3a0-0000-7000-8000-0000000000ff", submission: {} },
      ctx(w),
    );
    expect(nowhere).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("lesson.finish", () => {
  it("finishes a topic only once its gates are passed", async () => {
    const w = world();
    const early = await runAction(
      ACTIONS,
      "lesson.finish",
      { enrollmentId: ENROLLMENT, topic: 1 },
      ctx(w),
    );
    expect(early).toMatchObject({ ok: true, output: { done: false, missing: [CHECK, ORDER] } });

    await runAction(
      ACTIONS,
      "lesson.answer",
      { enrollmentId: ENROLLMENT, blockId: CHECK, submission: { option_index: 2 } },
      ctx(w),
    );
    await runAction(
      ACTIONS,
      "lesson.answer",
      {
        enrollmentId: ENROLLMENT,
        blockId: ORDER,
        submission: { order: [0, 1, 2].map((i) => itemKey(ORDER, i)) },
      },
      ctx(w),
    );
    const done = await runAction(
      ACTIONS,
      "lesson.finish",
      { enrollmentId: ENROLLMENT, topic: 1 },
      ctx(w),
    );
    expect(done).toMatchObject({ ok: true, output: { done: true } });

    const play = await runAction(
      ACTIONS,
      "lesson.play",
      { enrollmentId: ENROLLMENT, topic: 1 },
      ctx(w),
    );
    expect(play).toMatchObject({ ok: true, output: { done: true } });
  });
});

describe("isoOf", () => {
  it("formats epoch milliseconds like Date#toISOString", () => {
    for (const ms of [0, 951_782_400_000, 1_794_668_029_123, 4_102_444_799_999]) {
      expect(isoOf(ms)).toBe(new Date(ms).toISOString());
    }
  });
});
