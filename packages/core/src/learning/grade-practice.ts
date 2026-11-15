import * as z from "zod";
import {
  ESTIMATE_FIELDS,
  HOTSPOT_FIELDS,
  ORDER_FIELDS,
  TRUE_FALSE_FIELDS,
} from "../blocks/practice";
import { round2 } from "../v1-import/loose-json";
import { byShare, type GradeResult, graded, MALFORMED, ungradable } from "./grade-result";

// The graders of the player's question types (Platform STEP 12). Each reads the few fields it
// needs from the block the server holds and checks the submission strictly: a submission that is
// not an answer to this block is ungradable, never a wrong answer.

const Order = { block: ORDER_FIELDS, submission: z.strictObject({ order: z.array(z.int()) }) };
const TrueFalse = {
  block: TRUE_FALSE_FIELDS,
  submission: z.strictObject({ answers: z.array(z.boolean()) }),
};
const Estimate = { block: ESTIMATE_FIELDS, submission: z.strictObject({ value: z.number() }) };
const Hotspot = { block: HOTSPOT_FIELDS, submission: z.strictObject({ spot: z.int() }) };
const OpenAnswer = z.strictObject({ text: z.string().trim().min(1) });

/** Parses the block and the submission, or says which one is broken. */
function both<B, S>(
  type: string,
  schemas: { block: z.ZodType<B>; submission: z.ZodType<S> },
  block: unknown,
  submission: unknown,
): { block: B; submission: S } | GradeResult {
  const ownBlock = schemas.block.safeParse(block);
  if (!ownBlock.success) {
    return ungradable(`${type} is malformed`);
  }
  const own = schemas.submission.safeParse(submission);
  return own.success ? { block: ownBlock.data, submission: own.data } : MALFORMED;
}

const isResult = (value: object): value is GradeResult => "gradable" in value;

/** Correct when the order is the identity; the score counts the items in place. */
export function gradeOrder(block: unknown, submission: unknown): GradeResult {
  const read = both("order", Order, block, submission);
  if (isResult(read)) {
    return read;
  }
  const n = read.block.items.length;
  const order = read.submission.order;
  const permutation =
    order.length === n && new Set(order).size === n && order.every((i) => i >= 0 && i < n);
  if (!permutation) {
    return MALFORMED;
  }
  return byShare(order.filter((item, place) => item === place).length / n);
}

/** One answer per statement; the score counts the right ones. */
export function gradeTrueFalse(block: unknown, submission: unknown): GradeResult {
  const read = both("true_false", TrueFalse, block, submission);
  if (isResult(read)) {
    return read;
  }
  const { statements } = read.block;
  const { answers } = read.submission;
  if (answers.length !== statements.length) {
    return MALFORMED;
  }
  return byShare(
    statements.filter((statement, i) => statement.answer === answers[i]).length / statements.length,
  );
}

/** Right inside the answer range; a miss scores less the further it lands, across the scale. */
export function gradeEstimate(block: unknown, submission: unknown): GradeResult {
  const read = both("estimate", Estimate, block, submission);
  if (isResult(read)) {
    return read;
  }
  const { min, max, answer_min, answer_max } = read.block;
  const { value } = read.submission;
  if (value < min || value > max) {
    return MALFORMED;
  }
  const miss = value < answer_min ? answer_min - value : Math.max(0, value - answer_max);
  return miss === 0 ? graded(true, 100) : graded(false, round2(100 * (1 - miss / (max - min))));
}

/** One spot is one answer: right on a correct spot, and nothing partly right. */
export function gradeHotspot(block: unknown, submission: unknown): GradeResult {
  const read = both("hotspot", Hotspot, block, submission);
  if (isResult(read)) {
    return read;
  }
  const spot = read.block.spots[read.submission.spot];
  if (!spot) {
    return MALFORMED;
  }
  return graded(spot.correct, spot.correct ? 100 : 0);
}

/** The tutor grades an open answer (Platform STEP 12 PR 2); here it is only checked to be one. */
export function gradeOpenAnswer(submission: unknown): GradeResult {
  return OpenAnswer.safeParse(submission).success
    ? ungradable("open_answer is graded by the tutor")
    : MALFORMED;
}
