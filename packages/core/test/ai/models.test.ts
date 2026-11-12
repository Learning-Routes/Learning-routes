import { describe, expect, it } from "vitest";
import { costOfUsage } from "../../src/ai/models";

describe("what a call's usage costs at the table's prices", () => {
  it("prices fresh input, cache reads and output each at their own rate", () => {
    // Sonnet: 2 microcents a fresh input token, 0.1 a cached one, 10 an output token.
    expect(
      costOfUsage("anthropic/claude-sonnet-5.5", {
        promptTokens: 9_000,
        cachedTokens: 8_000,
        completionTokens: 300,
      }),
    ).toBe(1_000 * 2 + 8_000 * 0.1 + 300 * 10);
  });

  it("prices tokens written to the cache at the cache-write price", () => {
    // Haiku: 0.1 a fresh input token, 0.125 a cache write, 0.01 a cache read, 0.5 an output token.
    expect(
      costOfUsage("anthropic/claude-haiku-5.5", {
        promptTokens: 10_000,
        cachedTokens: 4_000,
        cacheWriteTokens: 5_000,
        completionTokens: 200,
      }),
    ).toBe(1_000 * 0.1 + 5_000 * 0.125 + 4_000 * 0.01 + 200 * 0.5);
  });

  it("rounds a fraction of a microcent up, so a call is never free", () => {
    expect(
      costOfUsage("anthropic/claude-haiku-5.5", {
        promptTokens: 1,
        cachedTokens: 1,
        completionTokens: 0,
      }),
    ).toBe(1);
  });

  it("refuses usage that cannot be real", () => {
    for (const usage of [
      { promptTokens: 10, cachedTokens: 11, completionTokens: 0 },
      { promptTokens: -1, cachedTokens: 0, completionTokens: 0 },
      { promptTokens: 1.5, cachedTokens: 0, completionTokens: 0 },
      { promptTokens: 10, cachedTokens: 5, cacheWriteTokens: 6, completionTokens: 0 },
    ]) {
      expect(() => costOfUsage("anthropic/claude-haiku-5.5", usage)).toThrow(RangeError);
    }
  });
});
