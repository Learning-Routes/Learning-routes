import { describe, expect, it } from "vitest";
import { estimateCost, PRICING } from "../../src/index";
import fixture from "../golden/cost_estimate.json" with { type: "json" };
import { runCost } from "../runners";

describe("cost (cost_estimate.json)", () => {
  it("prices every model v1 priced", () => {
    const models = new Set(fixture.cases.map((c) => c.input.model));
    expect(Object.keys(PRICING).sort()).toEqual(
      [...models].filter((m) => m !== "unpriced-model").sort(),
    );
    expect(fixture.cases).toHaveLength(252);
  });

  it.each(fixture.cases)("$input.model #%#", ({ input, output }) => {
    expect(runCost(input)).toEqual(output);
  });

  it("refuses a total beyond Number.MAX_SAFE_INTEGER microcents", () => {
    expect(() => estimateCost("claude-opus-4-5", { outputTokens: 1e15 })).toThrow(RangeError);
  });
});
