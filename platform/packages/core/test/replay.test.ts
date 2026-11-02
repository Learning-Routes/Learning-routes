import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { review } from "../src/learning/fsrs";
import { NEW_CARD, replayReviews } from "../src/learning/replay";

const DAY = 86_400_000;

describe("replayReviews: a card rebuilt from its review log (Platform STEP 2 §2.13)", () => {
  it("gives a new card for no reviews", () => {
    expect(replayReviews([])).toEqual({ card: NEW_CARD, nextReviewAt: null });
  });

  it("matches reviewing the card one rating at a time", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 40 })), {
          minLength: 1,
          maxLength: 12,
        }),
        (steps) => {
          let card = NEW_CARD;
          let at = Date.UTC(2026, 0, 1);
          let nextReviewAt: number | null = null;
          const log = [];
          for (const [rating, days] of steps) {
            at += days * DAY;
            log.push({ rating, reviewedAt: at });
            const result = review(card, rating, at);
            card = result.card;
            nextReviewAt = result.nextReviewAt;
          }
          // The log may come back in any order; replay sorts it by time.
          expect(replayReviews([...log].reverse())).toEqual({ card, nextReviewAt });
        },
      ),
    );
  });
});
