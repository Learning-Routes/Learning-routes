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
} as const satisfies Record<string, ModelPrices>;

export type ModelId = keyof typeof MODELS;

/** New: whether a model id is in the table. */
export function isAllowedModel(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id);
}
