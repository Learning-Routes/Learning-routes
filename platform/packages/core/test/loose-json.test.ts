import { describe, expect, it } from "vitest";
import { asArray, asText, round2 } from "../src/v1-import/loose-json";

describe("v1 coercions", () => {
  it("rounds like Ruby's Float#round(2)", () => {
    expect(round2(33.333333)).toBe(33.33);
    expect(round2(66.666666)).toBe(66.67);
    expect(round2(3.125)).toBe(3.13);
    expect(round2(-3.125)).toBe(-3.13);
    // 1.005 is 1.00499999... in binary; Ruby gives 1.0.
    expect(round2(1.005)).toBe(1);
  });

  it("reads arrays like Array()", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray("a")).toEqual(["a"]);
    expect(asArray({ a: 1 })).toEqual([["a", 1]]);
  });

  it("writes text like to_s", () => {
    expect(asText(null)).toBe("");
    expect(asText(3)).toBe("3");
    expect(asText(1.5)).toBe("1.5");
  });
});

describe("asText on numbers, as Ruby's to_s", () => {
  it.each([
    [1.5, "1.5"],
    [-0, "-0.0"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
    [Number.NEGATIVE_INFINITY, "-Infinity"],
  ])("%s reads as %s", (value, text) => {
    expect(asText(value)).toBe(text);
  });
});

describe("asText on a very large float", () => {
  it("keeps JavaScript's form, 1e+21 where Ruby prints 1.0e+21, until a golden fixture holds one", () => {
    // A known difference from v1, recorded in test/golden/DIVERGENCES.md.
    expect(asText(1e21)).toBe("1e+21");
  });
});
