import { describe, expect, it } from "vitest";
import { answerable, grade } from "../../src/learning/grader";
import { fromV1Section, fromV1Type } from "../../src/v1-import/vocabulary";
import fixture from "../golden/block_grader.json" with { type: "json" };

// v1's reason names the block type; the platform names it in the glossary's words.
const ENGAGEMENT_ONLY = /^(\w+) is engagement-only$/;
function inGlossary<T extends { call: { reason: string | null } }>(output: T): T {
  const reason = output.call.reason?.replace(
    ENGAGEMENT_ONLY,
    (_, type: string) => `${fromV1Type(type)} is engagement-only`,
  );
  return { ...output, call: { ...output.call, reason: reason ?? null } };
}

describe("grader (block_grader.json)", () => {
  it("has every origin", () => {
    const origins = new Set(fixture.cases.map((c) => c.input.origin));
    expect([...origins].sort()).toEqual(["edge", "normalize", "recorded"]);
  });

  it.each(fixture.cases)("$input.origin #%#", ({ input, output }) => {
    expect({
      call: grade(fromV1Section(input.section), input.payload),
      answerable: answerable(fromV1Section(input.section)),
    }).toEqual(inGlossary(output));
  });
});
