import { type Card, review } from "./fsrs";

// A card is a cache (Platform STEP 2 §2.13): replaying its review log, oldest
// first, from a new card rebuilds it exactly.

export const NEW_CARD: Card = {
  state: null,
  reps: 0,
  lapses: 0,
  stability: 0,
  difficulty: 0,
  lastReviewAt: null,
};

export interface LoggedReview {
  rating: number;
  /** Epoch milliseconds. */
  reviewedAt: number;
}

/** The card, and when it is next due, after every review in the log. */
export function replayReviews(log: readonly LoggedReview[]): {
  card: Card;
  nextReviewAt: number | null;
} {
  let card = NEW_CARD;
  let nextReviewAt: number | null = null;
  for (const { rating, reviewedAt } of [...log].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    const result = review(card, rating, reviewedAt);
    card = result.card;
    nextReviewAt = result.nextReviewAt;
  }
  return { card, nextReviewAt };
}
