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
  signal?: AbortSignal,
): Promise<Response> {
  return fetcher(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(allowed.request),
    ...(signal ? { signal } : {}),
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
  return {
    cost: costOf(usage.cost),
    promptTokens: usage.prompt_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}

// A cost that is not reported is unknown; one that is negative or not finite is
// invalid and never recorded, since it would move the day's spend.
function costOf(credits: number | null | undefined): CostEstimate {
  if (typeof credits !== "number") {
    return { kind: "unknown", reason: "provider_reported_usage_required" };
  }
  if (!Number.isFinite(credits) || credits < 0) {
    return { kind: "unknown", reason: "invalid_quantity" };
  }
  // toFixed first: 0.0000145 * 1e6 is 14.499999999999998 in floating point.
  return {
    kind: "known",
    microcents: Math.round(Number((credits * MICROCENTS_PER_CREDIT).toFixed(6))),
  };
}

type Settled = ReturnType<typeof settle>;
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type Streamed =
  | { ok: true; content: string; toolCalls: ToolCall[]; usage: Settled | null }
  /**
   * usage is what the failed call cost, when OpenRouter said. reached: whether it got to a model,
   * so it may have cost something even without a usage.
   */
  | { ok: false; status: number; usage: Settled | null; reached: boolean };

/** The longest a streamed answer may take, start to end. */
const STREAM_MS = 90_000;

interface Chunk {
  error?: unknown;
  usage?: Parameters<typeof settle>[0]["usage"];
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

/** The `data:` events of an SSE body, as they arrive; comment lines and [DONE] are left out. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<Chunk> {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(piece, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (data && data !== "[DONE]") {
        yield JSON.parse(data) as Chunk;
      }
    }
  }
}

/**
 * Sends a call the gate allowed with stream: true (Platform STEP 10). Each new piece of the answer's
 * words goes to `onText` as the whole text so far; the tool calls are put together from their pieces.
 * OpenRouter sends the usage, with its cost, in the last event.
 */
export async function streamFromOpenRouter(
  allowed: Allowed,
  apiKey: string,
  onText: (textSoFar: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<Streamed> {
  let response: Response;
  try {
    response = await sendToOpenRouter(allowed, apiKey, fetcher, AbortSignal.timeout(STREAM_MS));
  } catch {
    return { ok: false, status: 504, usage: null, reached: false };
  }
  if (!(response.ok && response.body)) {
    return { ok: false, status: response.status, usage: null, reached: false };
  }
  const answer = { content: "", usage: null as Settled | null, calls: [] as ToolCall[] };
  try {
    for await (const chunk of events(response.body)) {
      if (chunk.usage) {
        answer.usage = settle({ usage: chunk.usage });
      }
      if (chunk.error) {
        return { ok: false, status: 502, usage: answer.usage, reached: true };
      }
      take(answer, chunk, onText);
    }
  } catch {
    // A broken event or a timeout mid-stream: the call reached a model all the same.
    return { ok: false, status: 502, usage: answer.usage, reached: true };
  }
  return {
    ok: true,
    content: answer.content,
    toolCalls: answer.calls.filter(Boolean),
    usage: answer.usage,
  };
}

/** One event's words and tool-call pieces, added to the answer so far. */
function take(
  answer: { content: string; calls: ToolCall[] },
  chunk: Chunk,
  onText: (textSoFar: string) => void,
) {
  const delta = chunk.choices?.[0]?.delta;
  if (delta?.content) {
    answer.content += delta.content;
    onText(answer.content);
  }
  for (const piece of delta?.tool_calls ?? []) {
    answer.calls[piece.index] ??= {
      id: "",
      type: "function",
      function: { name: "", arguments: "" },
    };
    const call = answer.calls[piece.index] as ToolCall;
    call.id ||= piece.id ?? "";
    call.function.name += piece.function?.name ?? "";
    call.function.arguments += piece.function?.arguments ?? "";
  }
}
