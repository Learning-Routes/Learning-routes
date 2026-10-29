import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTION_NAMES } from "../../src/actions/names";
import { ACTIONS } from "../../src/actions/registry";
import { GOOD, review } from "../../src/learning/fsrs";
import { NEW_CARD } from "../../src/learning/replay";
import { ENROLLMENTS, NOW, testCtx, testWorld } from "./test-ctx";

const DAY = 86_400_000;
const R1 = "0192d3a0-0000-7000-8000-000000000001";
const R2 = "0192d3a0-0000-7000-8000-000000000002";
const ITEM = "0192d3a0-0000-7000-8000-0000000000c1";
const input = (
  reviewId: string,
  at = NOW,
  rating = GOOD,
  enrollmentId = ENROLLMENTS["student-1"],
) => ({
  enrollmentId,
  reviewId,
  itemId: ITEM,
  rating,
  at,
  elapsedMs: 1_200,
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
        itemId: ITEM,
        card: expected.card,
        nextReviewAt: expected.nextReviewAt,
        duplicate: false,
      },
    });
  });

  it("applies a reviewId once: a retry returns the first result", async () => {
    const world = testWorld();
    const first = await submit(input(R1), testCtx("ui", world));
    const retry = await submit(input(R1, NOW, 1), testCtx("ui", world));
    if (!(first.ok && retry.ok)) {
      throw new Error("both calls should succeed");
    }
    expect(retry.output).toEqual({ ...(first.output as object), duplicate: true });
    expect(retry.output).toMatchObject({ card: { reps: 1 } });
  });

  it("builds each review on the card's stored state", async () => {
    const world = testWorld();
    await submit(input(R1), testCtx("ui", world));
    const later = testCtx("ui", world, "student-1", { now: NOW + 3 * DAY });
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
    const world = testWorld();
    await submit(input(R1), testCtx("ui", world, "student-1"));
    const theirs = input(R1, NOW, GOOD, ENROLLMENTS["student-2"]);
    expect(await submit(theirs, testCtx("ui", world, "student-2"))).toMatchObject({
      ok: true,
      output: { duplicate: false, card: { reps: 1 } },
    });
  });

  it("answers not_found on another student's enrollment, and records nothing", async () => {
    const world = testWorld();
    expect(await submit(input(R1), testCtx("ui", world, "student-2"))).toEqual({
      ok: false,
      code: "not_found",
      message: "not found",
    });
    expect(world.reviews.size).toBe(0);
  });

  it("answers not_found on a revoked enrollment", async () => {
    const world = testWorld();
    const enrollment = world.enrollments.get(ENROLLMENTS["student-1"] as string);
    if (enrollment) {
      enrollment.status = "revoked";
    }
    expect(await submit(input(R1), testCtx("ui", world))).toMatchObject({
      ok: false,
      code: "not_found",
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
