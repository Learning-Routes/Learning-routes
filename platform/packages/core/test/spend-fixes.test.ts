import { describe, expect, it } from "vitest";
import { decideSpend, V1_LIMITS } from "../src/credits/spend";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const limits = { ...V1_LIMITS, ratePerMinute: 20 };

describe("spend fixes (ADR 0003)", () => {
  it("only an allowed call consumes a rate slot (fix 3)", () => {
    const overBudget = decideSpend({
      limits,
      spend: { globalToday: V1_LIMITS.dailyMicrocents, userToday: null },
      consumedAt: [],
      estimate: { kind: "known", microcents: 1 },
      now: NOW,
    });
    expect(overBudget).toEqual({
      verdict: "refused",
      reason: "daily_budget",
      consumesRateSlot: false,
    });

    const allowed = decideSpend({
      limits,
      spend: { globalToday: 0, userToday: null },
      consumedAt: [],
      estimate: { kind: "known", microcents: 1 },
      now: NOW,
    });
    expect(allowed.consumesRateSlot).toBe(true);
  });

  it("counts the calls in the sliding minute before now (answer 2)", () => {
    // One call opens v1's fixed window, 19 more come at its end.
    const consumedAt = [NOW, ...Array.from({ length: 19 }, () => NOW + 59_000)];
    const at = (now: number) =>
      decideSpend({
        limits,
        spend: { globalToday: 0, userToday: null },
        consumedAt,
        estimate: { kind: "known", microcents: 1 },
        now,
      });
    expect(at(NOW + 60_000)).toMatchObject({ verdict: "refused", reason: "rate_limit" });
    expect(at(NOW + 60_001).verdict).toBe("allowed");

    // An earlier call made in the same millisecond is still an earlier call.
    const burst = decideSpend({
      limits,
      spend: { globalToday: 0, userToday: null },
      consumedAt: Array.from({ length: 20 }, () => NOW),
      estimate: { kind: "known", microcents: 1 },
      now: NOW,
    });
    expect(burst).toMatchObject({ verdict: "refused", reason: "rate_limit" });
  });
});
