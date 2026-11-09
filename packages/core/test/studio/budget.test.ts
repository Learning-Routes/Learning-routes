import { describe, expect, it } from "vitest";
import { budgetOf, CALLS_PER_MINUTE, limitsOf, monthOf } from "../../src/studio/budget";

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

describe("the assistant's limits, from config", () => {
  const given = {
    spaceMonthly: "5000000",
    userDaily: "2000000",
    daily: "20000000",
  };

  it("reads the three numbers", () => {
    expect(limitsOf(given)).toEqual({
      spaceMonthly: 5_000_000,
      userDaily: 2_000_000,
      daily: 20_000_000,
      perMinute: CALLS_PER_MINUTE,
    });
  });

  it("is nothing when one is missing or not a whole positive number: no limit never means unlimited", () => {
    expect(limitsOf({ ...given, daily: undefined })).toBeNull();
    expect(limitsOf({ ...given, userDaily: "2e6" })).toBeNull();
    expect(limitsOf({ ...given, spaceMonthly: "0" })).toBeNull();
    expect(limitsOf({ ...given, spaceMonthly: "-5" })).toBeNull();
  });
});
