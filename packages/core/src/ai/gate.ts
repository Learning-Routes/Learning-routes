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

/** A function the model may call (OpenRouter tool calling). */
export interface ModelTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ModelMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

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
  messages: ModelMessage[];
  /** An agent's turn (Platform STEP 10): the tools it may call, priced as prompt. */
  tools?: ModelTool[];
  /** Stream the answer as it is written. */
  stream?: true;
}

export type GateContext = Omit<SpendRequest, "estimate">;

type CachedText = { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
type SystemContent = string | CachedText;
/** A user's or a tool's words marked for the cache: everything up to them is cached. */
type MarkedMessage =
  | { role: "user"; content: CachedText }
  | { role: "tool"; tool_call_id: string; content: CachedText };

// Student data never reaches a provider that keeps it: only zero-data-retention
// endpoints, and none that stores or trains on requests (OpenRouter provider routing).
const NO_RETENTION = { zdr: true, data_collection: "deny" } as const;

/** The OpenRouter chat completions body. */
export interface ModelRequest {
  model: ModelId;
  max_tokens: number;
  provider: typeof NO_RETENTION;
  session_id: string;
  messages: ({ role: "system"; content: SystemContent } | ModelMessage | MarkedMessage)[];
  tools?: ModelTool[];
  stream?: true;
}

export type GateDecision =
  | {
      verdict: "allowed";
      request: ModelRequest;
      estimateMicrocents: number;
      consumesRateSlot: boolean;
    }
  | { verdict: "refused"; reason: GateRefusal };

export type GateRefusal = "unknown_model" | "invalid_session_id" | "prompt_too_long" | SpendReason;

/** New: a token count from text, at 4 characters a token, rounded up. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// What a message sends besides its words: the calls it made, or the call it answers.
function sentText(message: ModelMessage): string {
  if (message.role === "assistant" && message.tool_calls) {
    return message.content + JSON.stringify(message.tool_calls);
  }
  return message.role === "tool" ? message.tool_call_id + message.content : message.content;
}

// The prompt, in estimated tokens: the system prompt with the tools, and the messages.
function promptTokens(spec: CallSpec): { system: number; messages: number } {
  return {
    system: estimateInputTokens(spec.system + (spec.tools ? JSON.stringify(spec.tools) : "")),
    messages: estimateInputTokens(spec.messages.map(sentText).join("")),
  };
}

// The most this call can cost: every prompt token at its price (the system prompt
// at the cache-write price when it is cached) and max_tokens of output.
function worstCase(spec: CallSpec, model: ModelId): CostEstimate {
  if (!(Number.isInteger(spec.maxTokens) && spec.maxTokens > 0)) {
    return { kind: "unknown", reason: "missing_max_tokens" };
  }
  const prices = MODELS[model];
  const tokens = promptTokens(spec);
  const systemPrice = spec.promptCache ? (prices.cacheWrite ?? prices.input) : prices.input;
  const perMillion =
    tokens.system * systemPrice + tokens.messages * prices.input + spec.maxTokens * prices.output;
  if (!Number.isSafeInteger(perMillion)) {
    throw new RangeError("a model call this large has no safe price");
  }
  return { kind: "known", microcents: Math.ceil(perMillion / PER_MILLION) };
}

const cached = (text: string): CachedText => [
  { type: "text", text, cache_control: { type: "ephemeral" } },
];

// With the cache, a conversation's newest user or tool message is marked too, so its next call
// reads the whole history from the cache instead of paying for it again. A one-message call is not:
// nothing would read it.
function markedLast(messages: ModelMessage[]): (ModelMessage | MarkedMessage)[] {
  const last = messages.at(-1);
  if (messages.length > 1 && (last?.role === "user" || last?.role === "tool")) {
    return [...messages.slice(0, -1), { ...last, content: cached(last.content) }];
  }
  return messages;
}

function requestOf(spec: CallSpec, model: ModelId): ModelRequest {
  const system: SystemContent = spec.promptCache ? cached(spec.system) : spec.system;
  return {
    model,
    max_tokens: spec.maxTokens,
    provider: NO_RETENTION,
    session_id: spec.sessionId,
    messages: [
      { role: "system", content: system },
      ...(spec.promptCache ? markedLast(spec.messages) : spec.messages),
    ],
    ...(spec.tools ? { tools: spec.tools } : {}),
    ...(spec.stream ? { stream: true as const } : {}),
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
  if (!isAllowedModel(model)) {
    return { verdict: "refused", reason: "unknown_model" };
  }
  // Before the spend gate: no spend is reserved for a call that cannot happen.
  const tokens = promptTokens(spec);
  if (tokens.system + tokens.messages > MODELS[model].maxPromptTokens) {
    return { verdict: "refused", reason: "prompt_too_long" };
  }
  const estimate = worstCase(spec, model);
  if (estimate.kind === "unknown") {
    return { verdict: "refused", reason: "unknown_cost" };
  }
  const decision = decideSpend({ ...context, estimate });
  if (decision.verdict === "refused") {
    // Safe: decideSpend gives a reason with every refusal, and every SpendReason is a GateRefusal.
    return { verdict: "refused", reason: decision.reason as GateRefusal };
  }
  return {
    verdict: "allowed",
    request: requestOf(spec, model),
    estimateMicrocents: estimate.microcents,
    consumesRateSlot: decision.consumesRateSlot,
  };
}
