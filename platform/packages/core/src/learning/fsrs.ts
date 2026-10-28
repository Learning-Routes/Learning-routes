// Spaced repetition: v1's variant of FSRS v4 (ADR 0003 keeps it for now). Pure:
// the caller passes the card and `now` in epoch milliseconds, and stores the result.

const DAY_MS = 86_400_000;

// w0..w12, as tuned in v1.
const W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 0.5, 2.18] as const;
const w = (i: number) => W[i] as number;

/**
 * The lowest stability a card holds (ADR 0003). v1's lapse formula shrinks
 * stability toward zero until it underflows, and a review from 0 was NaN.
 */
export const FSRS_STABILITY_FLOOR = 0.01;

const floored = (stability: number) =>
  Number.isFinite(stability) ? Math.max(stability, FSRS_STABILITY_FLOOR) : FSRS_STABILITY_FLOOR;

export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

export type CardState = "new" | "learning" | "review" | "relearning";

export interface Card {
  /** null for a card that was never reviewed. */
  state: CardState | null;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  /** Epoch milliseconds, or null when never reviewed. */
  lastReviewAt: number | null;
}

export interface Review {
  card: Card & { state: CardState; lastReviewAt: number };
  nextReviewAt: number;
  elapsedDays: number;
  scheduledDays: number;
}

/** A schedule computed as NaN or infinite: v1 raised Ruby's FloatDomainError here. */
export class FsrsDomainError extends Error {
  override name = "FsrsDomainError";
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Ruby `Float#round` for scheduling: half away from zero, and raises on NaN or infinity. */
function roundDays(value: number): number {
  if (Number.isNaN(value)) {
    throw new FsrsDomainError("NaN");
  }
  if (!Number.isFinite(value)) {
    throw new FsrsDomainError(value > 0 ? "Infinity" : "-Infinity");
  }
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Days until the next review, targeting 90% recall: v1 `SpacedRepetition#next_interval`. */
export function interval(stability: number): number {
  const desiredRetention = 0.9;
  return clamp(roundDays(9.0 * stability * (1.0 / desiredRetention - 1)), 1, 365);
}

function recallAt(elapsedDays: number, stability: number): number {
  if (stability <= 0 || elapsedDays <= 0) {
    return 1.0;
  }
  return (1.0 + elapsedDays / (9.0 * stability)) ** -1;
}

/** Probability of recall now, on a power-law curve: v1 `SpacedRepetition#retrievability`. */
export function retrievability(card: Card, now: number): number {
  if (card.stability <= 0 || card.lastReviewAt === null) {
    return 1.0;
  }
  return recallAt((now - card.lastReviewAt) / DAY_MS, card.stability);
}

/**
 * Reviews a card with a rating from 1 (again) to 4 (easy); other values are
 * clamped. Replaces v1 `LearningRoutesEngine::SpacedRepetition#review`.
 */
export function review(card: Card, rawRating: number, now: number): Review {
  const rating = clamp(Math.trunc(rawRating), AGAIN, EASY);
  const isNew = card.state === "new" || card.state === null || card.reps === 0;
  return isNew ? reviewNew(rating, now) : reviewExisting(card, rating, now);
}

function reviewNew(rating: number, now: number): Review {
  const stability = w(rating - 1);
  const difficulty = w(4) - (rating - 3) * w(5);
  const state: CardState = rating >= GOOD ? "review" : rating === AGAIN ? "relearning" : "learning";
  return scheduled(
    {
      state,
      reps: 1,
      lapses: rating === AGAIN ? 1 : 0,
      stability,
      difficulty: clamp(difficulty, 1, 10),
    },
    now,
    0.0,
  );
}

function reviewExisting(card: Card, rating: number, now: number): Review {
  const elapsed = card.lastReviewAt === null ? 0.0 : (now - card.lastReviewAt) / DAY_MS;
  const incoming = floored(card.stability);
  const recall = recallAt(elapsed, incoming);
  // v1 departs from FSRS v4 here (ADR 0003): a fixed step on top of mean reversion.
  const difficulty = card.difficulty + w(5) * (w(4) - card.difficulty) - (rating - 3) * 0.5;
  const stability = floored(nextStability(incoming, difficulty, recall, rating));

  let state: CardState = "review";
  if (rating === AGAIN) {
    state = "relearning";
  } else if (card.state === "learning" || card.state === "relearning") {
    state = rating >= GOOD ? "review" : card.state;
  }

  return scheduled(
    {
      state,
      reps: card.reps + 1,
      lapses: card.lapses + (rating === AGAIN ? 1 : 0),
      stability,
      difficulty: clamp(difficulty, 1, 10),
    },
    now,
    elapsed,
  );
}

function nextStability(s: number, d: number, recall: number, rating: number): number {
  // v1's lapse formula, another departure from FSRS v4 (ADR 0003).
  if (rating === AGAIN) {
    return s * w(7) * d ** -0.2 * ((s + 1) ** 0.2 - 1);
  }
  let factor = Math.exp(w(6)) * (11 - d) * s ** -w(9) * (Math.exp((1 - recall) * w(10)) - 1);
  if (rating === HARD) {
    factor *= w(11);
  }
  if (rating === EASY) {
    factor *= w(12);
  }
  return s * (1 + factor);
}

function scheduled(card: Omit<Card, "lastReviewAt">, now: number, elapsedDays: number): Review {
  const scheduledDays = interval(card.stability);
  return {
    card: { ...card, state: card.state as CardState, lastReviewAt: now },
    nextReviewAt: now + scheduledDays * DAY_MS,
    elapsedDays,
    scheduledDays,
  };
}
