import { describe, expect, it } from "vitest";
import { answerable, grade } from "../../src/learning/grader";
import fixture from "../golden/block_grader.json" with { type: "json" };

describe("grader (block_grader.json)", () => {
  it("has every origin", () => {
    const origins = new Set(fixture.cases.map((c) => c.input.origin));
    expect([...origins].sort()).toEqual(["edge", "normalize", "recorded"]);
  });

  it.each(fixture.cases)("$input.origin #%#", ({ input, output }) => {
    expect({
      call: grade(input.section, input.payload),
      answerable: answerable(input.section),
    }).toEqual(output);
  });
});
