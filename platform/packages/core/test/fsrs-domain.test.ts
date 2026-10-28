import { describe, expect, it } from "vitest";
import { FSRS_STABILITY_FLOOR, FsrsDomainError, interval, review } from "../src/learning/fsrs";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;

describe("FSRS on numbers that are not finite", () => {
  it.each([
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
    [Number.NEGATIVE_INFINITY, "-Infinity"],
  ])(
    "an interval from %s raises FsrsDomainError, as v1 raised FloatDomainError",
    (stability, message) => {
      expect(() => interval(stability)).toThrow(new FsrsDomainError(message));
    },
  );

  it("reads a stored stability that is not finite as the floor, so a corrupt card still schedules", () => {
    const card = {
      state: "review" as const,
      reps: 3,
      lapses: 0,
      stability: Number.POSITIVE_INFINITY,
      difficulty: 5,
      lastReviewAt: NOW - DAY,
    };
    const fromInfinity = review(card, 3, NOW);
    const fromFloor = review({ ...card, stability: FSRS_STABILITY_FLOOR }, 3, NOW);

    expect(fromInfinity).toEqual(fromFloor);
  });
});
