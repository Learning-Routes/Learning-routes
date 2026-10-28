import type { GateDecision } from "@learning-routes/core/ai/gate";
import type { CostEstimate } from "@learning-routes/core/credits/cost";

// The one adapter between the AI gate in core and OpenRouter (STEP 46 §2.7). It
// sends only a call the gate allowed; nothing else in the platform calls a model.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// usage.cost is in credits, one US dollar each; a dollar is 1,000,000 microcents.
const MICROCENTS_PER_CREDIT = 1_000_000;

type Allowed = Extract<GateDecision, { verdict: "allowed" }>;

/** Sends a call the gate allowed, and returns OpenRouter's response. */
export function sendToOpenRouter(
  allowed: Allowed,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return fetcher(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(allowed.request),
  });
}

interface Usage {
  cost?: number | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

/**
 * What a finished call cost and used, from the usage OpenRouter returns on every
 * response. A response with no cost is an explicit unknown, never a guessed 0.
 */
export function settle(response: { usage?: Usage }) {
  const usage = response.usage ?? {};
  const cost: CostEstimate =
    typeof usage.cost === "number" && Number.isFinite(usage.cost)
      ? {
          kind: "known",
          // toFixed first: 0.0000145 * 1e6 is 14.499999999999998 in floating point.
          microcents: Math.round(Number((usage.cost * MICROCENTS_PER_CREDIT).toFixed(6))),
        }
      : { kind: "unknown", reason: "provider_reported_usage_required" };
  return {
    cost,
    promptTokens: usage.prompt_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}
