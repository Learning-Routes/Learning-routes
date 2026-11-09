import { describe, expect, it } from "vitest";
import { budgetOf, monthOf } from "../../src/studio/budget";

const MONTHLY = 5_000_000;

describe("a space's assistant budget", () => {
  it("is fine until a fifth is left, then low, then spent", () => {
    expect(budgetOf(0, MONTHLY)).toBe("ok");
    expect(budgetOf(3_999_999, MONTHLY)).toBe("ok");
    expect(budgetOf(4_000_000, MONTHLY)).toBe("low");
    expect(budgetOf(5_000_000, MONTHLY)).toBe("out");
    expect(budgetOf(9_000_000, MONTHLY)).toBe("out");
  });

  it("is spent when no budget is set: an unset number never means unlimited", () => {
    expect(budgetOf(0, 0)).toBe("out");
    expect(budgetOf(0, Number.NaN)).toBe("out");
  });

  it("counts by calendar month in UTC", () => {
    expect(monthOf(Date.parse("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(monthOf(Date.parse("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
});
