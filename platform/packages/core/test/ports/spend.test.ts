import { describe, expect, it } from "vitest";
import { rateLimitPerMinute } from "../../src/credits/spend";
import fixture from "../golden/spend_limits.json" with { type: "json" };
import { runSpend } from "../runners";

describe("spend (spend_limits.json)", () => {
  it("has thirty situations or more around each limit", () => {
    for (const limit of ["daily_budget", "user_budget", "rate_limit"]) {
      expect(fixture.cases.filter((c) => c.input.limit === limit).length).toBeGreaterThanOrEqual(
        30,
      );
    }
  });

  it("knows v1's per-minute limits", () => {
    expect(rateLimitPerMinute("elevenlabs")).toBe(20);
    expect(rateLimitPerMinute("eleven_multilingual_v2")).toBeNull();
  });

  it.each(fixture.cases)("$input.limit #%#", ({ input, output }) => {
    expect(runSpend(input)).toEqual(output);
  });
});
