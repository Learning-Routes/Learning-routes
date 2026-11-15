import type { Attempt } from "../learning/attempt";
import { review } from "../learning/fsrs";
import type { ProgressRecord, Repos } from "../repos/ports";

// What the player keeps of an answer (Platform STEP 12): an attempt in a topic's progress, the XP it
// is worth, and the review it schedules.

/** XP for a block: a pass at the first try is worth more than a pass after retries. */
export const XP_FIRST_TRY = 10;
export const XP_RETRY = 5;

export type BlockState = ProgressRecord["blocks"][number];

export const xpOf = (block: BlockState) =>
  block.correct === true ? (block.attempts <= 1 ? XP_FIRST_TRY : XP_RETRY) : 0;

export const sumXp = (records: ProgressRecord[]) =>
  records.reduce((sum, r) => sum + r.blocks.reduce((s, b) => s + xpOf(b), 0), 0);

export function recordFor(
  records: ProgressRecord[],
  enrollmentId: string,
  lessonId: string,
): ProgressRecord {
  return (
    records.find((r) => r.lessonId === lessonId) ?? {
      enrollmentId,
      lessonId,
      status: "in_progress",
      completedAt: null,
      blocks: [],
    }
  );
}

export async function schedule(
  repos: Repos,
  spaceId: string,
  userId: string,
  itemId: string,
  rating: number | null,
  now: number,
) {
  if (rating === null) {
    return;
  }
  const locked = await repos.learning.lockCard(spaceId, userId, itemId);
  if (locked.ok) {
    const next = review(locked.value.card, rating, now);
    await repos.learning.saveCard(spaceId, userId, locked.value.id, next.card, next.nextReviewAt);
  }
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Epoch milliseconds as an ISO 8601 UTC timestamp, without reading a clock (core stays pure). */
export function isoOf(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const rest = ms - days * 86_400_000;
  // Howard Hinnant's civil_from_days.
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const h = Math.floor(rest / 3_600_000);
  const m = Math.floor((rest % 3_600_000) / 60_000);
  const sec = Math.floor((rest % 60_000) / 1000);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(sec)}.${pad(rest % 1000, 3)}Z`;
}

const iso = (ms: number | null) => (ms === null ? null : isoOf(ms));
const ms = (text: string | null) => (text === null ? null : Date.parse(text));

export function fromState(kind: string, state: BlockState): Attempt {
  return {
    blockType: kind,
    attempts: state.attempts,
    correct: state.correct,
    score: state.score,
    completedAt: ms(state.completedAt),
    releasedAt: ms(state.releasedAt),
    payload: null,
  };
}

export function toState(blockId: string, attempt: Attempt): BlockState {
  return {
    blockId,
    attempts: attempt.attempts,
    correct: attempt.correct,
    score: attempt.score,
    releasedAt: iso(attempt.releasedAt),
    completedAt: iso(attempt.completedAt),
  };
}
