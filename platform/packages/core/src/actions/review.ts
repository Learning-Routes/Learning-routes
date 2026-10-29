import { z } from "zod";
import { type Card, review } from "../learning/fsrs";
import { NEW_CARD } from "../learning/replay";
import type { Repos, ReviewRecord } from "../repos/ports";
import { ActionError, defineAction, type Scope } from "./define";

interface ReviewOutput {
  reviewId: string;
  itemId: string;
  card: Card;
  nextReviewAt: number;
  duplicate: boolean;
}

/** The result a stored review gave: replaying it from its state before is exact. */
function resultOf(stored: ReviewRecord, itemId: string, duplicate: boolean): ReviewOutput {
  const next = review(stored.stateBefore, stored.rating, stored.reviewedAt);
  return {
    reviewId: stored.reviewId,
    itemId,
    card: next.card,
    nextReviewAt: next.nextReviewAt,
    duplicate,
  };
}

/** The actor's own active enrollment, or not_found: another's, or a revoked one, does not exist for them. */
async function ownEnrollment(repos: Repos, scope: Scope, enrollmentId: string, userId: string) {
  const enrollment = await repos.enrollments.get(scope.spaceId, enrollmentId);
  if (
    !enrollment.ok ||
    enrollment.value.userId !== userId ||
    enrollment.value.status !== "active"
  ) {
    throw new ActionError("not_found", "not found");
  }
}

/** A new card's row, made before its first review so the review can name it. */
async function newCard(repos: Repos, spaceId: string, userId: string, itemId: string, at: number) {
  const created = await repos.learning.saveCard(spaceId, userId, itemId, NEW_CARD, at);
  if (!created.ok) {
    throw new ActionError("not_found", "not found");
  }
  return created.value.cardId;
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
    /** The content item the card is for, the same in every version and enrollment. */
    itemId: z.uuid(),
    rating: z.int().min(1).max(4),
    /** When the student answered (epoch ms); a queued review arrives later. */
    at: z.int().nonnegative(),
    /** How long the student took to answer. */
    elapsedMs: z.int().nonnegative(),
  }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  async run(ctx, input, scope): Promise<ReviewOutput> {
    const userId = ctx.actor.userId;
    await ownEnrollment(ctx.repos, scope, input.enrollmentId, userId);
    return ctx.repos.transaction(async (repos) => {
      const stored = await repos.learning.card(scope.spaceId, userId, input.itemId);
      const before = stored?.card ?? NEW_CARD;
      // The server schedules; a clock ahead of the server's cannot push a review later.
      const reviewedAt = Math.min(input.at, ctx.clock.now());
      const cardId =
        stored?.id ?? (await newCard(repos, scope.spaceId, userId, input.itemId, reviewedAt));
      const appended = await repos.reviews.append(scope.spaceId, userId, {
        reviewId: input.reviewId,
        cardId,
        rating: input.rating,
        reviewedAt,
        elapsedMs: input.elapsedMs,
        stateBefore: before,
      });
      // A retry: the stored review decides the answer, and the card is not touched.
      if (appended.duplicate) {
        return resultOf(appended.review, input.itemId, true);
      }
      const next = review(before, input.rating, reviewedAt);
      await repos.learning.saveCard(
        scope.spaceId,
        userId,
        input.itemId,
        next.card,
        next.nextReviewAt,
      );
      return resultOf(appended.review, input.itemId, false);
    });
  },
});
