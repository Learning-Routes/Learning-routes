import { asArray, asText } from "../v1-import/loose-json";
import { AGAIN, EASY, GOOD, HARD } from "./fsrs";
import type { GradeResult } from "./grader";

// A student's attempt at one block, and what it tells the scheduler. Three outcomes
// stay distinct: passed (correct), released (failed RELEASE_AFTER times, so the
// block stops gating; not a pass) and engaged (an ungradable block they used).

/** Failed submissions after which a block stops gating: the answer key is likelier wrong. */
export const RELEASE_AFTER = 3;

export interface Attempt {
  blockType: string;
  attempts: number;
  correct: boolean | null;
  score: number | null;
  /** Epoch milliseconds; set when the attempt satisfies progression. */
  completedAt: number | null;
  releasedAt: number | null;
  payload: unknown;
}

/** An attempt before any submission: a new v1 `BlockAttempt` row (block_attempt.rb). */
export function newAttempt(blockType: string): Attempt {
  return {
    blockType,
    attempts: 0,
    correct: null,
    score: null,
    completedAt: null,
    releasedAt: null,
    payload: null,
  };
}

/**
 * Records one submission. Replaces v1 `BlockAttemptRecorder#record_submission!`.
 * Only a complete submission counts as an attempt and can release the block.
 */
export function recordSubmission(
  attempt: Attempt,
  submission: { payload: unknown; grading: GradeResult; complete: boolean; now: number },
): Attempt {
  const { payload, grading, complete, now } = submission;
  const next: Attempt = { ...attempt, payload, attempts: attempt.attempts + (complete ? 1 : 0) };

  if (!grading.gradable) {
    return { ...next, correct: null, score: null, completedAt: now };
  }

  next.correct = grading.correct;
  next.score = grading.score;
  if (grading.correct) {
    next.completedAt = now;
  }
  if (complete && !next.correct && next.releasedAt === null && next.attempts >= RELEASE_AFTER) {
    next.releasedAt = now;
    next.completedAt = now;
  }
  return next;
}

const CARD_RATINGS: Record<string, number> = {
  hard: HARD,
  normal: GOOD,
  good: GOOD,
  easy: EASY,
};

/**
 * What an attempt feeds FSRS, or null when it must feed nothing. Replaces v1
 * `BlockAttempt#fsrs_rating`. A released block feeds nothing: calling it right
 * would claim mastery, and calling it wrong would punish our bad answer key.
 */
export function fsrsRating(attempt: Attempt): number | null {
  if (attempt.releasedAt !== null) {
    return null;
  }
  if (attempt.blockType === "cards") {
    return cardsRating(attempt.payload);
  }
  if (attempt.correct === null) {
    return null;
  }
  if (attempt.correct) {
    return attempt.attempts <= 1 ? GOOD : HARD;
  }
  return AGAIN;
}

// The worst card, not the average: one card still hard brings the step back sooner.
function cardsRating(payload: unknown): number | null {
  const isObject = (value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const ratings = isObject(payload) ? (payload as Record<string, unknown>).ratings : null;
  const values = isObject(ratings) ? Object.values(ratings as object) : asArray(ratings);
  const mapped = values.flatMap((value) => {
    const key = asText(value).toLowerCase();
    return Object.hasOwn(CARD_RATINGS, key) ? [CARD_RATINGS[key] as number] : [];
  });
  return mapped.length === 0 ? null : Math.min(...mapped);
}
