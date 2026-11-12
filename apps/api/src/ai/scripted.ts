import { costOfUsage, isAllowedModel } from "@learning-routes/core/ai/models";
import * as z from "zod";
import { ENDPOINT } from "./openrouter";

// The scripted model provider (STEP 11-prep §A1): it stands in for OpenRouter, outside production
// only, so the whole path runs with no network and no cost. It answers the chat completions endpoint
// with a real SSE stream in OpenRouter's shape; everything around it (the gate, meter(), the tools,
// the studio's events) runs as it does with a real model.

const Usage = z.strictObject({
  prompt_tokens: z.int().nonnegative(),
  cached_tokens: z.int().nonnegative(),
  completion_tokens: z.int().nonnegative(),
});

const Turn = z.strictObject({
  /** Checked against the newest message of the request. */
  expect: z.union([
    z.strictObject({ lastUserIncludes: z.string().min(1) }),
    z.strictObject({ lastToolName: z.string().min(1) }),
  ]),
  reply: z.union([
    z.strictObject({
      text: z.string().default(""),
      /**
       * Real tool calls. A string argument "$space_id", "$route_id", "$draft_revision",
       * "$module_ids.N" or "$lesson_ids.N" is filled from the conversation and the tools' answers.
       */
      toolCalls: z
        .array(
          z.strictObject({ name: z.string().min(1), arguments: z.record(z.string(), z.unknown()) }),
        )
        .default([]),
      usage: Usage,
      /** The stream breaks after the words and half of the first call. */
      cut: z.literal(true).optional(),
    }),
    /** OpenRouter refuses the call before any model sees it, as it does without credit. */
    z.strictObject({ status: z.int().min(400).max(599) }),
  ]),
});

const Script = z.strictObject({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** The conversation's first creator message, exactly. */
  opening: z.string().min(1),
  turns: z.array(Turn).min(1),
});
export type Script = z.infer<typeof Script>;

export const readScript = (json: unknown): Script => Script.parse(json);

type Message = {
  role: string;
  content?: string | { text: string }[] | null;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string } }[];
};

// A message marked for the cache carries its words as an array of parts.
const textOf = (content: Message["content"]): string =>
  typeof content === "string" ? content : (content ?? []).map((part) => part.text).join("");

// The space id, from the conversation line studioContext adds to the system prompt.
const SPACE_ID = /"space_id":"([0-9a-f-]{36})"/;
// Words stream one by one, each with its trailing space.
const AFTER_SPACE = /(?<= )/;

const failed = (status: number, why: string) => new Response(why, { status });

/** What the scripts' "$" arguments stand for, read from the request as a model would read it. */
function idsOf(messages: Message[]) {
  const ids = {
    space_id: SPACE_ID.exec(textOf(messages[0]?.content))?.[1],
    route_id: undefined as unknown,
    draft_revision: undefined as unknown,
    module_ids: [] as unknown[],
    lesson_ids: [] as unknown[],
  };
  for (const message of messages.filter((each) => each.role === "tool")) {
    let answer: Record<string, unknown>;
    try {
      // A content tool's answer is quoted as data (turn.ts asData): its text is the tool's JSON.
      answer = JSON.parse(String((JSON.parse(textOf(message.content)) as { data: string }).data));
    } catch {
      continue;
    }
    ids.route_id = answer.route_id ?? ids.route_id;
    ids.draft_revision = answer.draft_revision ?? ids.draft_revision;
    if (answer.module_id) {
      ids.module_ids.push(answer.module_id);
    }
    if (answer.lesson_id) {
      ids.lesson_ids.push(answer.lesson_id);
    }
  }
  return ids;
}

function filled(value: unknown, ids: ReturnType<typeof idsOf>): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const [name, at] = value.slice(1).split(".") as [keyof typeof ids, string | undefined];
    const found = at === undefined ? ids[name] : (ids[name] as unknown[] | undefined)?.[Number(at)];
    if (found === undefined) {
      throw new Error(`nothing in the conversation fills ${value}`);
    }
    return found;
  }
  if (Array.isArray(value)) {
    return value.map((each) => filled(each, ids));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, filled(each, ids)]));
  }
  return value;
}

/** Whether the newest message is the one the turn expects; why not, when it is not. */
function mismatch(expected: Script["turns"][number]["expect"], messages: Message[]): string | null {
  const last = messages.at(-1);
  if ("lastUserIncludes" in expected) {
    return last?.role === "user" && textOf(last.content).includes(expected.lastUserIncludes)
      ? null
      : `a creator message with "${expected.lastUserIncludes}"`;
  }
  const name = messages
    .flatMap((message) => message.tool_calls ?? [])
    .find((call) => call.id === last?.tool_call_id)?.function.name;
  return last?.role === "tool" && name === expected.lastToolName
    ? null
    : `the answer of a ${expected.lastToolName} call`;
}

const event = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`;

/** The reply as OpenRouter streams it: words, then each call's pieces, then the usage. */
function sse(
  reply: Extract<Script["turns"][number]["reply"], { usage: unknown }>,
  calls: { name: string; arguments: string }[],
  cost: number,
  turn: number,
): ReadableStream<Uint8Array> {
  const words = reply.text.split(AFTER_SPACE).filter(Boolean);
  const pieces = [
    ...words.map((content) => event({ choices: [{ delta: { content } }] })),
    ...calls.flatMap((call, index) => {
      const half = Math.ceil(call.arguments.length / 2);
      const id = `call_${turn}_${index}`;
      return [
        event({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index,
                    id,
                    function: { name: call.name, arguments: call.arguments.slice(0, half) },
                  },
                ],
              },
            },
          ],
        }),
        event({
          choices: [
            {
              delta: {
                tool_calls: [{ index, function: { arguments: call.arguments.slice(half) } }],
              },
            },
          ],
        }),
      ];
    }),
  ];
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      if (reply.cut) {
        // The words and the first half of the first call, then the connection breaks.
        for (const piece of pieces.slice(0, words.length + 1)) {
          controller.enqueue(encoder.encode(piece));
        }
        controller.error(new Error("the scripted stream was cut"));
        return;
      }
      for (const piece of pieces) {
        controller.enqueue(encoder.encode(piece));
      }
      const { prompt_tokens, cached_tokens, completion_tokens } = reply.usage;
      controller.enqueue(
        encoder.encode(
          event({
            choices: [{ delta: {}, finish_reason: calls.length > 0 ? "tool_calls" : "stop" }],
            // In credits, a dollar each, as OpenRouter reports it.
            usage: {
              prompt_tokens,
              completion_tokens,
              prompt_tokens_details: { cached_tokens },
              cost: cost / 1_000_000,
            },
          }),
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/**
 * A fetch that answers chat completions from the scripts. The script is chosen by the conversation's
 * first creator message, the turn by how many assistant messages were already sent. Anything the
 * script did not expect answers 500, naming the script and the turn, so a test fails instead of hanging.
 */
/** The script and turn a request is at, or the 500 that names what did not match. */
function turnOf(scripts: readonly Script[], messages: Message[]) {
  const opening = textOf(messages.find((message) => message.role === "user")?.content);
  const script = scripts.find((each) => each.opening === opening);
  if (!script) {
    return failed(500, `no script opens with ${JSON.stringify(opening.slice(0, 80))}`);
  }
  const index = messages.filter((message) => message.role === "assistant").length;
  const turn = script.turns[index];
  if (!turn) {
    return failed(500, `${script.name}: turn ${index} is past the script's ${script.turns.length}`);
  }
  const wanted = mismatch(turn.expect, messages);
  return wanted
    ? failed(500, `${script.name}: turn ${index} expected ${wanted}`)
    : { name: script.name, index, reply: turn.reply };
}

/**
 * A fetch that answers chat completions from the scripts. The script is chosen by the conversation's
 * first creator message, the turn by how many assistant messages were already sent. Anything the
 * script did not expect answers 500, naming the script and the turn, so a test fails instead of hanging.
 */
export function scriptedFetch(scripts: readonly Script[]): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== ENDPOINT || init?.method !== "POST") {
      return failed(404, "the scripted provider answers only chat completions");
    }
    const body = JSON.parse(String(init.body)) as { model: string; messages: Message[] };
    const at = turnOf(scripts, body.messages);
    if (at instanceof Response) {
      return at;
    }
    const { name, index, reply } = at;
    if ("status" in reply) {
      return failed(reply.status, `${name}: turn ${index} refused as scripted`);
    }
    if (!isAllowedModel(body.model)) {
      return failed(500, `${name}: turn ${index} was sent to ${body.model}`);
    }
    let calls: { name: string; arguments: string }[];
    try {
      const ids = idsOf(body.messages);
      calls = reply.toolCalls.map((call) => ({
        name: call.name,
        arguments: JSON.stringify(filled(call.arguments, ids)),
      }));
    } catch (error) {
      return failed(500, `${name}: turn ${index}: ${(error as Error).message}`);
    }
    const cost = costOfUsage(body.model, {
      promptTokens: reply.usage.prompt_tokens,
      cachedTokens: reply.usage.cached_tokens,
      completionTokens: reply.usage.completion_tokens,
    });
    return new Response(sse(reply, calls, cost, index), {
      headers: { "content-type": "text/event-stream" },
    });
  };
}
