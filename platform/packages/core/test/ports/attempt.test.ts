import { describe, expect, it } from "vitest";
import { type Attempt, fsrsRating, grade, newAttempt, recordSubmission } from "../../src/index";
import fixture from "../golden/attempt_rating.json" with { type: "json" };

const NOW = Date.parse("2026-10-26T12:00:00Z");
const byKind = (kind: string) => fixture.cases.filter((c) => c.input.kind === kind);

interface RatingInput {
  block_type: string;
  correct: boolean | null;
  attempts: number | null;
  released: boolean;
  payload: unknown;
}

interface HistoryInput {
  section: { type: string };
  submissions: { payload: unknown; complete: boolean }[];
}

const state = (attempt: Attempt) => ({
  attempts: attempt.attempts,
  correct: attempt.correct,
  score: attempt.score,
  completed: attempt.completedAt !== null,
  released: attempt.releasedAt !== null,
  passed: attempt.correct === true,
  engaged: attempt.correct === null && attempt.completedAt !== null,
  satisfied: attempt.completedAt !== null,
  fsrs_rating: fsrsRating(attempt),
});

describe("attempt rating (attempt_rating.json)", () => {
  it("has v1's case counts", () => {
    expect(byKind("fsrs_rating")).toHaveLength(176);
    expect(byKind("submissions")).toHaveLength(13);
  });

  it.each(byKind("fsrs_rating"))("rating #%#", ({ input, output }) => {
    const { block_type, correct, attempts, released, payload } = input as RatingInput;
    const attempt: Attempt = {
      ...newAttempt(block_type),
      correct,
      attempts: attempts ?? 0,
      releasedAt: released ? NOW : null,
      payload,
    };
    expect(fsrsRating(attempt)).toBe(output);
  });

  it.each(byKind("submissions"))("$input.name", ({ input, output }) => {
    const { section, submissions } = input as HistoryInput;
    let attempt = newAttempt(section.type);
    const states = submissions.map(({ payload, complete }) => {
      attempt = recordSubmission(attempt, {
        payload,
        grading: grade(section, payload),
        complete,
        now: NOW,
      });
      return state(attempt);
    });
    expect(states).toEqual(output);
  });

  it("ignores ratings that only exist on Object.prototype", () => {
    const attempt = {
      ...newAttempt("flashcards"),
      payload: { ratings: ["constructor", "toString"] },
    };
    expect(fsrsRating(attempt)).toBeNull();
  });
});
