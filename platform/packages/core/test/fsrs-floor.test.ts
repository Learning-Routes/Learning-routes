import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Card, FSRS_STABILITY_FLOOR, review } from "../src/index";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-26T12:00:00Z");

const card = fc.record({
  state: fc.constantFrom<Card["state"]>(null, "new", "learning", "review", "relearning"),
  reps: fc.integer({ min: 0, max: 500 }),
  lapses: fc.integer({ min: 0, max: 500 }),
  stability: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 36_500, noNaN: true })),
  difficulty: fc.double({ min: 1, max: 10, noNaN: true }),
  lastReviewAt: fc.option(fc.integer({ min: NOW - 3_650 * DAY, max: NOW }), { nil: null }),
});

describe("FSRS floor (ADR 0003, fix 1)", () => {
  it("is 0.01", () => {
    expect(FSRS_STABILITY_FLOOR).toBe(0.01);
  });

  it("schedules the card v1 raised on", () => {
    const zero: Card = {
      state: "review",
      reps: 2,
      lapses: 0,
      stability: 0,
      difficulty: 10,
      lastReviewAt: null,
    };
    const next = review(zero, 3, NOW);
    expect(next.card.stability).toBeGreaterThanOrEqual(FSRS_STABILITY_FLOOR);
    expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("keeps any valid card finite, above the floor, within v1's bounds, at least a day out", () => {
    fc.assert(
      fc.property(
        card,
        fc.integer({ min: 0, max: 5 }),
        fc.double({ min: 0, max: 1_000, noNaN: true }),
        (start, rating, elapsedDays) => {
          const next = review(start, rating, NOW + elapsedDays * DAY);
          expect(Number.isFinite(next.card.stability)).toBe(true);
          expect(next.card.stability).toBeGreaterThanOrEqual(FSRS_STABILITY_FLOOR);
          expect(next.card.difficulty).toBeGreaterThanOrEqual(1);
          expect(next.card.difficulty).toBeLessThanOrEqual(10);
          expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it("stays above the floor through long runs of lapses", () => {
    fc.assert(
      fc.property(
        card,
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 60 }),
        (start, ratings) => {
          let current: Card = start;
          let now = NOW;
          for (const rating of ratings) {
            now += DAY;
            const next = review(current, rating, now);
            expect(next.card.stability).toBeGreaterThanOrEqual(FSRS_STABILITY_FLOOR);
            current = next.card;
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
