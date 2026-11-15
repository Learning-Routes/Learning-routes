import { round2 } from "../v1-import/loose-json";

/** What a grader answers. A score is out of 100. */
export interface GradeResult {
  correct: boolean | null;
  score: number | null;
  gradable: boolean;
  reason: string | null;
  /** A right answer the feedback says more about: a balance that is not the smallest. */
  note?: "not_smallest";
}

export const ungradable = (reason: string): GradeResult => ({
  correct: null,
  score: null,
  gradable: false,
  reason,
});

export const graded = (correct: boolean, score: number): GradeResult => ({
  correct,
  score,
  gradable: true,
  reason: null,
});

/** A share from 0 to 1 as a score: right only when all of it is. */
export const byShare = (share: number): GradeResult => graded(share === 1, round2(share * 100));

export const MALFORMED = ungradable("malformed submission");
