import { z } from "zod";
import { type Card, review } from "../learning/fsrs";
import { NEW_CARD } from "../learning/replay";
import { defineAction } from "./define";

interface ReviewOutput {
  reviewId: string;
  cardId: string;
  card: Card;
  nextReviewAt: number;
  duplicate: boolean;
}

/**
 * New: records one spaced-repetition review and schedules the card with FSRS.
 * Safe to retry: the same reviewId is applied once, and a retry gets the first result.
 */
export const reviewSubmit = defineAction({
  name: "review.submit",
  kind: "mutation",
  description:
    "Record one spaced-repetition review of a card and schedule its next one. Safe to retry: the same reviewId is applied once.",
  input: z.strictObject({
    /** The student's enrollment the card belongs to; its row gives the space. */
    enrollmentId: z.uuid(),
    reviewId: z.uuid(),
    cardId: z.string().min(1),
    rating: z.int().min(1).max(4),
    /** When the student answered (epoch ms); a queued review arrives later. */
    at: z.int().nonnegative(),
  }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  async run(ctx, input): Promise<ReviewOutput> {
    const owner = ctx.actor.userId;
    const reviewKey = `review:${owner}:${input.reviewId}`;
    // shortcut(Platform STEP 2): read-then-write is not atomic; the Postgres store makes reviewId unique.
    const done = await ctx.store.get<ReviewOutput>(reviewKey);
    if (done) {
      return { ...done, duplicate: true };
    }

    const cardKey = `card:${owner}:${input.cardId}`;
    const card = (await ctx.store.get<Card>(cardKey)) ?? NEW_CARD;
    // The server schedules; a clock ahead of the server's cannot push a review later.
    const next = review(card, input.rating, Math.min(input.at, ctx.now));
    const output: ReviewOutput = {
      reviewId: input.reviewId,
      cardId: input.cardId,
      card: next.card,
      nextReviewAt: next.nextReviewAt,
      duplicate: false,
    };
    await ctx.store.put(cardKey, next.card);
    await ctx.store.put(reviewKey, output);
    return output;
  },
});
