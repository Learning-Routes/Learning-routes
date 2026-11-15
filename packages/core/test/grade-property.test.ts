import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SIM_KINDS } from "../src/blocks/sims";
import { BLOCK_TYPES } from "../src/blocks/types";
import { answerable, grade } from "../src/learning/grader";

// Platform STEP 12 PR 1: a submission is untrusted input, and a block may be old or broken. No
// grader may throw on any JSON, and every answer has the same shape.

const anyBlock = fc.oneof(
  fc.jsonValue(),
  fc
    .record({ type: fc.constantFrom(...BLOCK_TYPES) }, { noNullPrototype: true })
    .chain((head) =>
      fc.dictionary(fc.string(), fc.jsonValue()).map((rest) => ({ ...rest, ...head })),
    ),
  fc
    .record({ kind: fc.constantFrom(...SIM_KINDS) })
    .chain((head) =>
      fc
        .dictionary(fc.string(), fc.jsonValue())
        .map((rest) => ({ type: "sim", setup: { ...rest, ...head } })),
    ),
);
const anySubmission = fc.oneof(
  fc.jsonValue(),
  fc.record({ state: fc.jsonValue() }),
  fc.dictionary(
    fc.constantFrom("order", "answers", "value", "spot", "text", "state"),
    fc.jsonValue(),
  ),
);

describe("every grader on any JSON", () => {
  it("never throws, and answers ungradable or a score from 0 to 100", () => {
    fc.assert(
      fc.property(anyBlock, anySubmission, (block, submission) => {
        const result = grade(block, submission);
        if (result.gradable) {
          expect(typeof result.correct).toBe("boolean");
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        } else {
          expect(result).toMatchObject({ correct: null, score: null });
        }
        expect(typeof answerable(block)).toBe("boolean");
      }),
      { numRuns: 3000 },
    );
  });
});
