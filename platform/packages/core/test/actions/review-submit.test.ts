import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTION_NAMES } from "../../src/actions/names";
import { ACTIONS } from "../../src/actions/registry";
import { GOOD, review } from "../../src/learning/fsrs";
import { memoryStore, NOW, testCtx } from "./memory-store";

const DAY = 86_400_000;
const NEW_CARD = {
  state: null,
  reps: 0,
  lapses: 0,
  stability: 0,
  difficulty: 0,
  lastReviewAt: null,
};
const R1 = "0192d3a0-0000-7000-8000-000000000001";
const R2 = "0192d3a0-0000-7000-8000-000000000002";
const input = (reviewId: string, at = NOW, rating = GOOD) => ({
  reviewId,
  cardId: "card-hello",
  rating,
  at,
});
const submit = (raw: unknown, ctx = testCtx("ui")) => runAction(ACTIONS, "review.submit", raw, ctx);

describe("review.submit", () => {
  it("is the registry's only action so far, under the names browser code reads", () => {
    expect(Object.keys(ACTIONS)).toEqual([...ACTION_NAMES]);
    expect(ACTION_NAMES).toEqual(["review.submit"]);
  });

  it("schedules the card with core's FSRS", async () => {
    const expected = review(NEW_CARD, GOOD, NOW);
    expect(await submit(input(R1))).toEqual({
      ok: true,
      output: {
        reviewId: R1,
        cardId: "card-hello",
        card: expected.card,
        nextReviewAt: expected.nextReviewAt,
        duplicate: false,
      },
    });
  });

  it("applies a reviewId once: a retry returns the first result", async () => {
    const store = memoryStore();
    const first = await submit(input(R1), testCtx("ui", store));
    const retry = await submit(input(R1, NOW, 1), testCtx("ui", store));
    if (!(first.ok && retry.ok)) throw new Error("both calls should succeed");
    expect(retry.output).toEqual({ ...(first.output as object), duplicate: true });
    expect(retry.output).toMatchObject({ card: { reps: 1 } });
  });

  it("builds each review on the card's stored state", async () => {
    const store = memoryStore();
    await submit(input(R1), testCtx("ui", store));
    const later = { ...testCtx("ui", store), now: NOW + 3 * DAY };
    const second = await submit(input(R2, NOW + 3 * DAY), later);
    const card = review(review(NEW_CARD, GOOD, NOW).card, GOOD, NOW + 3 * DAY).card;
    expect(second).toMatchObject({ ok: true, output: { card, duplicate: false } });
  });

  it("never schedules from a time after the server's", async () => {
    expect(await submit(input(R1, NOW + DAY))).toMatchObject({
      ok: true,
      output: { card: { lastReviewAt: NOW } },
    });
  });

  it("keeps each student's reviews apart", async () => {
    const store = memoryStore();
    await submit(input(R1), testCtx("ui", store, "student-1"));
    expect(await submit(input(R1), testCtx("ui", store, "student-2"))).toMatchObject({
      ok: true,
      output: { duplicate: false, card: { reps: 1 } },
    });
  });

  it("refuses a rating outside 1 to 4 and a reviewId that is not a uuid", async () => {
    const bad = await submit({ ...input("not-a-uuid"), rating: 5 });
    expect(bad).toMatchObject({ ok: false, code: "invalid_input" });
    expect(bad.ok === false && "issues" in bad && bad.issues.map((i) => i.path)).toEqual([
      "reviewId",
      "rating",
    ]);
  });
});
