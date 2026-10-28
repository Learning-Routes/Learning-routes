import type { CostEstimate } from "../credits/cost";
import { decideSpend, type SpendReason, type SpendRequest } from "../credits/spend";
import { isAllowedModel, MODELS, type ModelId } from "./models";

// The only place a model call is described (STEP 46 §2.7). A call names a model
// from ai/models.ts, a max_tokens and whether to cache the prompt; the gate prices
// its worst case and puts it through the spend gate in credits/. Pure: the caller
// sends the request it returns, through the one platform adapter.

const CHARS_PER_TOKEN = 4;
// OpenRouter's limit for session_id.
const MAX_SESSION_ID = 256;
const PER_MILLION = 1_000_000;

export interface CallSpec {
  model: string;
  maxTokens: number;
  promptCache: boolean;
  /**
   * The agent session or the review session this call belongs to: OpenRouter keeps
   * the session's calls on the provider that holds its prompt cache. At most 256
   * characters. Never a user id, an email or other personal data.
   */
  sessionId: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export type GateContext = Omit<SpendRequest, "estimate">;

type SystemContent =
  | string
  | { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];

// Student data never reaches a provider that keeps it: only zero-data-retention
// endpoints, and none that stores or trains on requests (OpenRouter provider routing).
const NO_RETENTION = { zdr: true, data_collection: "deny" } as const;

/** The OpenRouter chat completions body. */
export interface ModelRequest {
  model: ModelId;
  max_tokens: number;
  provider: typeof NO_RETENTION;
  session_id: string;
  messages: ({ role: "system"; content: SystemContent } | CallSpec["messages"][number])[];
}

export type GateDecision =
  | {
      verdict: "allowed";
      request: ModelRequest;
      estimateMicrocents: number;
      consumesRateSlot: boolean;
    }
  | { verdict: "refused"; reason: "unknown_model" | "invalid_session_id" | SpendReason };

/** New: a token count from text, at 4 characters a token, rounded up. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// The most this call can cost: every prompt token at its price (the system prompt
// at the cache-write price when it is cached) and max_tokens of output.
function worstCase(spec: CallSpec, model: ModelId): CostEstimate {
  if (!(Number.isInteger(spec.maxTokens) && spec.maxTokens > 0)) {
    return { kind: "unknown", reason: "missing_max_tokens" };
  }
  const prices = MODELS[model];
  const systemTokens = estimateInputTokens(spec.system);
  const messageTokens = estimateInputTokens(spec.messages.map((m) => m.content).join(""));
  const systemPrice = spec.promptCache ? (prices.cacheWrite ?? prices.input) : prices.input;
  const perMillion =
    systemTokens * systemPrice + messageTokens * prices.input + spec.maxTokens * prices.output;
  if (!Number.isSafeInteger(perMillion))
    throw new RangeError("a model call this large has no safe price");
  return { kind: "known", microcents: Math.ceil(perMillion / PER_MILLION) };
}

function requestOf(spec: CallSpec, model: ModelId): ModelRequest {
  const system: SystemContent = spec.promptCache
    ? [{ type: "text", text: spec.system, cache_control: { type: "ephemeral" } }]
    : spec.system;
  return {
    model,
    max_tokens: spec.maxTokens,
    provider: NO_RETENTION,
    session_id: spec.sessionId,
    messages: [{ role: "system", content: system }, ...spec.messages],
  };
}

/**
 * New: whether a model call may happen, and the request to send when it may. An
 * unknown model or an unknown cost is an explicit refusal; so is a call the spend
 * gate refuses.
 */
export function gate(spec: CallSpec, context: GateContext): GateDecision {
  const { model, sessionId } = spec;
  if (sessionId.length === 0 || sessionId.length > MAX_SESSION_ID) {
    return { verdict: "refused", reason: "invalid_session_id" };
  }
  if (!isAllowedModel(model)) return { verdict: "refused", reason: "unknown_model" };
  const estimate = worstCase(spec, model);
  const decision = decideSpend({ ...context, estimate });
  if (decision.verdict === "refused") {
    return { verdict: "refused", reason: decision.reason as SpendReason };
  }
  return {
    verdict: "allowed",
    request: requestOf(spec, model),
    estimateMicrocents: estimate.kind === "known" ? estimate.microcents : 0,
    consumesRateSlot: decision.consumesRateSlot,
  };
}
