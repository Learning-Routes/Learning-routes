import { describe, expect, it } from "vitest";
import { estimateCost } from "../src/credits/cost";
import { decideSpend, V1_LIMITS } from "../src/credits/spend";

const NOW = Date.parse("2026-10-26T12:00:00Z");

describe("unknown cost (ADR 0003, fix 4)", () => {
  it("prices what it can", () => {
    expect(estimateCost("claude-sonnet-4-5", { inputTokens: 1_000_000 })).toEqual({
      kind: "known",
      microcents: 3_000_000,
    });
    expect(estimateCost("scribe_v2", { audioSeconds: "3600" })).toEqual({
      kind: "known",
      microcents: 220_000,
    });
    expect(estimateCost("eleven_flash_v2_5", { characters: 0 })).toEqual({
      kind: "known",
      microcents: 0,
    });
  });

  it("answers unknown, never 0 and never a raise, for every under-specified call", () => {
    expect(estimateCost("unpriced-model", { inputTokens: 10 })).toEqual({
      kind: "unknown",
      reason: "unknown_model",
    });
    expect(estimateCost("scribe_v2", {})).toEqual({
      kind: "unknown",
      reason: "missing_audio_seconds",
    });
    expect(estimateCost("scribe_v2", { audioSeconds: "a minute" })).toEqual({
      kind: "unknown",
      reason: "missing_audio_seconds",
    });
    expect(estimateCost("eleven_multilingual_v2", {})).toEqual({
      kind: "unknown",
      reason: "missing_characters",
    });
    expect(estimateCost("eleven_flash_v2_5", { inputTokens: 5 })).toEqual({
      kind: "unknown",
      reason: "missing_characters",
    });
    expect(estimateCost("tavily", {})).toEqual({
      kind: "unknown",
      reason: "provider_reported_usage_required",
    });
  });

  it("is refused by the spend gate, before anything else", () => {
    const decision = decideSpend({
      limits: { ...V1_LIMITS, ratePerMinute: 20 },
      spend: { globalToday: V1_LIMITS.dailyMicrocents, userToday: null },
      consumedAt: [],
      estimate: { kind: "unknown", reason: "unknown_model" },
      now: NOW,
    });
    expect(decision).toEqual({
      verdict: "refused",
      reason: "unknown_cost",
      consumesRateSlot: false,
    });
  });
});
