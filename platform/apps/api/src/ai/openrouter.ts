import type { GateDecision } from "@learning-routes/core/ai/gate";

// The one adapter between the AI gate in core and OpenRouter (STEP 46 §2.7). It
// sends only a call the gate allowed; nothing else in the platform calls a model.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
