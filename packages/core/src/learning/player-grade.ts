import { asArray, asObject, round2, truthy } from "../v1-import/loose-json";

// Grades the player's question types (Platform STEP 12). Every grader reads the block the
// server holds and the learner's submission as loose JSON: a malformed submission is a wrong
// answer, a malformed block is ungradable, and nothing here throws.

export interface PlayerGrade {
  correct: boolean | null;
  score: number | null;
  gradable: boolean;
  reason: string | null;
  /** Which part was wrong, for the feedback: indices or a short code. */
  detail?: unknown;
}

export const ungradable = (reason: string): PlayerGrade => ({
  correct: null,
  score: null,
  gradable: false,
  reason,
});
export const graded = (correct: boolean, score: number, detail?: unknown): PlayerGrade => ({
  correct,
  score: round2(score),
  gradable: true,
  reason: null,
  ...(detail === undefined ? {} : { detail }),
});

export const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);
export const isNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** order: the submission is a permutation of the item indices; correct when it is the identity. */
export function gradeOrder(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const n = asArray(block.items).length;
  if (n < 2) {
    return ungradable("order has fewer than two items");
  }
  const order = asArray(payload.order);
  const valid =
    order.length === n &&
    order.every(isInt) &&
    new Set(order).size === n &&
    order.every((i) => (i as number) >= 0 && (i as number) < n);
  if (!valid) {
    return graded(false, 0);
  }
  const wrong = order.flatMap((item, place) => (item === place ? [] : [place]));
  return graded(wrong.length === 0, ((n - wrong.length) / n) * 100, wrong);
}

/** true_false: one boolean per statement. */
export function gradeTrueFalse(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const statements = asArray(block.statements).map(asObject);
  if (statements.length === 0) {
    return ungradable("true_false has no statements");
  }
  const answers = asArray(payload.answers);
  const wrong = statements.flatMap((s, i) =>
    answers[i] === (s.answer === true) && typeof answers[i] === "boolean" ? [] : [i],
  );
  return graded(
    wrong.length === 0,
    ((statements.length - wrong.length) / statements.length) * 100,
    wrong,
  );
}

/** estimate: a number inside [answer_min, answer_max]. */
export function gradeEstimate(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const lo = block.answer_min;
  const hi = block.answer_max;
  if (!(isNum(lo) && isNum(hi)) || lo > hi) {
    return ungradable("estimate has no answer range");
  }
  const value = payload.value;
  if (!isNum(value)) {
    return graded(false, 0);
  }
  const hit = value >= lo && value <= hi;
  return graded(hit, hit ? 100 : 0, hit ? undefined : value < lo ? "low" : "high");
}

/** hotspot: the index of a spot marked correct. */
export function gradeHotspot(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const spots = asArray(block.spots).map(asObject);
  if (!spots.some((spot) => truthy(spot.correct) && spot.correct === true)) {
    return ungradable("hotspot has no correct spot");
  }
  const spot = payload.spot;
  if (!isInt(spot) || spot < 0 || spot >= spots.length) {
    return graded(false, 0);
  }
  const hit = spots[spot]?.correct === true;
  return graded(hit, hit ? 100 : 0);
}
