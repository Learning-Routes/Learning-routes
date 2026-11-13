import { costOfUsage, isAllowedModel, type ModelId } from "@learning-routes/core/ai/models";
import { type GateRequest, messagesBody } from "./anthropic-request";
import { ENDPOINT } from "./openrouter";

// The Anthropic provider (STEP 11-prep §A1b): local runs with a real model, never production. A
// fetch that takes the gate's OpenRouter request, sends it to Anthropic's Messages API, and streams
// the answer back in OpenRouter's shape, so nothing above the fetcher changes. Its cost is the
// table's prices applied to the tokens Anthropic reports, as the scripted provider's is.

const MESSAGES = "https://api.anthropic.com/v1/messages";
const VERSION = "2026-10-21";
// Anthropic says it is out of credit with a 400 and this in its message.
const CREDIT_OUT = /credit balance/i;

/** The table's models, by their Anthropic ids. A model Anthropic does not serve is refused. */
const MODEL_IDS: Partial<Record<ModelId, string>> = {
  "anthropic/claude-sonnet-5.5": "claude-sonnet-5-5",
  "anthropic/claude-haiku-5.5": "claude-haiku-5-5",
};

interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens?: number;
}

/** Anthropic's SSE events, from a body that arrives in pieces. */
async function* anthropicEvents(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(piece, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        yield JSON.parse(line.slice(5)) as Record<string, unknown> & { type: string };
      }
    }
  }
}

const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

/** OpenRouter's usage for Anthropic's tokens, with the cost at the table's prices, in credits. */
function usageOf(model: ModelId, usage: Usage, output: number) {
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const prompt = (usage.input_tokens ?? 0) + read + written;
  const cost = costOfUsage(model, {
    promptTokens: prompt,
    cachedTokens: read,
    cacheWriteTokens: written,
    completionTokens: output,
  });
  return {
    prompt_tokens: prompt,
    completion_tokens: output,
    prompt_tokens_details: { cached_tokens: read },
    cost: cost / 1_000_000,
  };
}

type Event = Record<string, unknown> & { type: string };

/** What an Anthropic stream has said so far, and what it says to OpenRouter's reader. */
class Translation {
  usage: Usage = {};
  output = 0;
  stop = "";
  private readonly tools = new Map<number, number>();
  private readonly withArguments = new Set<number>();

  constructor(private readonly send: (value: unknown) => void) {}

  private toolCall(piece: Record<string, unknown>) {
    this.send({ choices: [{ delta: { tool_calls: [piece] } }] });
  }

  started(event: Event) {
    this.usage = (event.message as { usage?: Usage }).usage ?? {};
    this.output = this.usage.output_tokens ?? 0;
  }

  blockStarted(event: Event) {
    const block = event.content_block as { type: string; id?: string; name?: string };
    if (block.type === "tool_use") {
      const index = this.tools.size;
      this.tools.set(Number(event.index), index);
      this.toolCall({ index, id: block.id, function: { name: block.name, arguments: "" } });
    }
  }

  // Thinking is off; anything else that is not words or a call's arguments is left out.
  delta(event: Event) {
    const delta = event.delta as { type: string; text?: string; partial_json?: string };
    const index = this.tools.get(Number(event.index));
    if (delta.type === "text_delta") {
      this.send({ choices: [{ delta: { content: delta.text } }] });
    } else if (delta.type === "input_json_delta" && index !== undefined && delta.partial_json) {
      this.withArguments.add(index);
      this.toolCall({ index, function: { arguments: delta.partial_json } });
    }
  }

  // A call with no arguments streams none: OpenRouter's reader gets an empty object, as JSON.
  blockStopped(event: Event) {
    const index = this.tools.get(Number(event.index));
    if (index !== undefined && !this.withArguments.has(index)) {
      this.toolCall({ index, function: { arguments: "{}" } });
    }
  }

  messageDelta(event: Event) {
    this.stop = String((event.delta as { stop_reason?: string }).stop_reason ?? "");
    this.output = (event.usage as Usage | undefined)?.output_tokens ?? this.output;
  }

  /** Takes one event; false once the stream has failed. */
  take(event: Event): boolean {
    const handlers: Record<string, (event: Event) => void> = {
      message_start: (e) => this.started(e),
      content_block_start: (e) => this.blockStarted(e),
      content_block_delta: (e) => this.delta(e),
      content_block_stop: (e) => this.blockStopped(e),
      message_delta: (e) => this.messageDelta(e),
    };
    if (event.type === "error") {
      this.stop = "error";
      return false;
    }
    handlers[event.type]?.(event);
    return true;
  }

  // An error or a refusal reached a model and left nothing usable: a failure, booked at what it
  // used, as meter() decides.
  finish(model: ModelId) {
    const usage = usageOf(model, this.usage, this.output);
    // Local runs only: how much of each prompt the cache wrote and read. No ids, no words.
    console.log(
      JSON.stringify({
        message: "anthropic usage",
        model,
        input: this.usage.input_tokens ?? 0,
        cacheWrite: this.usage.cache_creation_input_tokens ?? 0,
        cacheRead: this.usage.cache_read_input_tokens ?? 0,
        output: this.output,
        stop: this.stop,
      }),
    );
    this.send(
      this.stop === "refusal" || this.stop === "error"
        ? { usage, error: { message: this.stop } }
        : { choices: [{ delta: {} }], usage },
    );
  }
}

/** Anthropic's stream, re-said as OpenRouter's: text deltas, tool-call pieces, then the usage. */
function translated(body: ReadableStream<Uint8Array>, model: ModelId): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const translation = new Translation((value) =>
        controller.enqueue(encoder.encode(chunk(value))),
      );
      try {
        for await (const event of anthropicEvents(body)) {
          if (!translation.take(event)) {
            break;
          }
        }
        translation.finish(model);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/** Anthropic's refusal before any model ran, as OpenRouter would say it: out of credit is a 402. */
async function refusedAs(response: Response): Promise<Response> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? "";
  const status = response.status === 400 && CREDIT_OUT.test(message) ? 402 : response.status;
  return new Response(
    JSON.stringify({ error: { code: status, message: "refused by the provider" } }),
    {
      status,
    },
  );
}

/** The table's model a request names, and its Anthropic id; null for one Anthropic does not serve. */
function modelOf(request: GateRequest): { model: ModelId; id: string } | null {
  const model = isAllowedModel(request.model) ? request.model : null;
  const id = model ? MODEL_IDS[model] : undefined;
  return model && id ? { model, id } : null;
}

/** A fetch that answers OpenRouter's chat completions from Anthropic's Messages API. */
export function anthropicFetch(apiKey: string, upstream: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== ENDPOINT || init?.method !== "POST") {
      return new Response("the Anthropic provider answers only chat completions", { status: 404 });
    }
    const request = JSON.parse(String(init.body)) as GateRequest;
    const served = modelOf(request);
    if (!served) {
      return new Response(`Anthropic does not serve ${request.model}`, { status: 400 });
    }
    const response = await upstream(MESSAGES, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(messagesBody(request, served.id)),
      // The key goes to Anthropic only: a redirect fails instead of carrying it elsewhere.
      redirect: "error",
      ...(init.signal ? { signal: init.signal } : {}),
    });
    return response.ok && response.body
      ? new Response(translated(response.body, served.model), {
          headers: { "content-type": "text/event-stream" },
        })
      : refusedAs(response);
  };
}
