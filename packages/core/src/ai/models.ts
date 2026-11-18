// The OpenRouter models the platform may call, and what each costs: the single
// source of truth (STEP 46 §2.7). Prices are integer microcents per million tokens
// (lesson 10), copied from OpenRouter's model list on 28 October 2026.

export const PRICES_AS_OF = "2026-10-28";
export const PRICES_SOURCE = "https://openrouter.ai/api/v1/models";

export interface ModelPrices {
  input: number;
  output: number;
  cacheRead: number;
  /** null when the provider charges nothing extra to write the cache (billed as input). */
  cacheWrite: number | null;
  /** The longest prompt the gate sends, in estimated tokens; a longer one is refused. */
  maxPromptTokens: number;
}

// Candidate for the cheapest tier: openai/gpt-oss-20b ($0.018 in, $0.09 out per
// million tokens). It stays out of the table until it passes a zero-data-retention
// check and an eval.
export const MODELS = {
  // The cheapest: the default for student-facing features (WORKING_AGREEMENT.md).
  "openai/gpt-5-nano": {
    input: 50_000,
    output: 400_000,
    cacheRead: 5_000,
    cacheWrite: null,
    // context_length in the models API.
    maxPromptTokens: 400_000,
  },
  "anthropic/claude-haiku-5.5": {
    input: 100_000,
    output: 500_000,
    cacheRead: 10_000,
    cacheWrite: 125_000,
    // Its context is 1,000,000, but pricing.overrides charges 5 times as much from
    // min_prompt_tokens 100,000 (models API); the table has the base price only.
    maxPromptTokens: 99_999,
  },
  // For authoring work a cheaper model fails.
  "anthropic/claude-sonnet-5.5": {
    input: 2_000_000,
    output: 10_000_000,
    cacheRead: 100_000,
    cacheWrite: 2_500_000,
    // context_length in the models API; no price override.
    maxPromptTokens: 1_000_000,
  },
  // Route images (Platform STEP 20 §B), copied from the models API on 17 November 2026. Output is
  // priced at image_output ($30 a million; an image is about 1,290 tokens), the dearer of its two
  // output prices, so a text-only answer is never priced under what it costs.
  "google/gemini-2.5-flash-image": {
    input: 300_000,
    output: 30_000_000,
    cacheRead: 30_000,
    cacheWrite: 83_334,
    // context_length in the models API.
    maxPromptTokens: 32_768,
  },
} as const satisfies Record<string, ModelPrices>;

export type ModelId = keyof typeof MODELS;

/** New: whether a model id is in the table. */
export function isAllowedModel(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id);
}

/**
 * What a call's usage costs at the table's prices, in microcents, rounded up: fresh input at the
 * input price, cache writes at theirs (the input price where the model has none), cache reads at
 * theirs, output at the output price. promptTokens counts every prompt token, written and read
 * included. The scripted and the Anthropic providers (STEP 11-prep) report this as their cost.
 */
export function costOfUsage(
  model: ModelId,
  usage: {
    promptTokens: number;
    cachedTokens: number;
    cacheWriteTokens?: number;
    completionTokens: number;
  },
): number {
  const { promptTokens, cachedTokens, cacheWriteTokens = 0, completionTokens } = usage;
  const counts = [promptTokens, cachedTokens, cacheWriteTokens, completionTokens];
  if (
    !counts.every((count) => Number.isSafeInteger(count) && count >= 0) ||
    cachedTokens + cacheWriteTokens > promptTokens
  ) {
    throw new RangeError("a usage with negative, fractional or more cached than sent tokens");
  }
  const prices: ModelPrices = MODELS[model];
  const perMillion =
    (promptTokens - cachedTokens - cacheWriteTokens) * prices.input +
    cacheWriteTokens * (prices.cacheWrite ?? prices.input) +
    cachedTokens * prices.cacheRead +
    completionTokens * prices.output;
  return Math.ceil(perMillion / 1_000_000);
}
