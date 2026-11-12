import { readdirSync, readFileSync } from "node:fs";
import { costOfUsage } from "@learning-routes/core/ai/models";
import { describe, expect, it } from "vitest";
import { anthropicFetch } from "../src/ai/anthropic";
import { ENDPOINT, streamFromOpenRouter } from "../src/ai/openrouter";

const MESSAGES = "https://api.anthropic.com/v1/messages";
const cached = (text: string) => [{ type: "text", text, cache_control: { type: "ephemeral" } }];

// The gate's request, as OpenRouter would get it.
const request = (model = "anthropic/claude-haiku-5.5") => ({
  model,
  max_tokens: 1200,
  provider: { zdr: true, data_collection: "deny" },
  session_id: "studio-c1",
  stream: true,
  tools: [
    {
      type: "function",
      function: {
        name: "add_module",
        description: "Add a module.",
        parameters: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" },
      },
    },
  ],
  messages: [
    { role: "system", content: cached("Rules.") },
    { role: "user", content: "Quiero una ruta" },
    {
      role: "assistant",
      content: "Armo el plan.",
      tool_calls: [
        { id: "toolu_1", type: "function", function: { name: "add_module", arguments: '{"a":1}' } },
      ],
    },
    { role: "tool", tool_call_id: "toolu_1", content: cached('{"ok":true}') },
  ],
});

const sse = (events: unknown[]) =>
  events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");

const STREAM = [
  {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 1000,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 4000,
        output_tokens: 1,
      },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hola, " } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Andrés." } },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_2", name: "add_module", input: {} },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"ti' },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: 'tle":1}' },
  },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 200 } },
  { type: "message_stop" },
];

function upstream(answer: () => Response) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  return { sent, fetcher };
}

const ask = (fetcher: typeof fetch, body: unknown = request()) =>
  streamFromOpenRouter({ request: body } as never, "anthropic", () => undefined, fetcher);

describe("the Anthropic provider (STEP 11-prep §A1b)", () => {
  it("sends the gate's request as a Messages API request, with the key and the API version", async () => {
    const { sent, fetcher } = upstream(() => new Response(sse(STREAM)));
    await ask(anthropicFetch("test-key", fetcher));
    expect(sent[0]?.url).toBe(MESSAGES);
    const headers = new Headers(sent[0]?.init.headers);
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.get("anthropic-version")).toBe("2026-10-21");
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 1200,
      stream: true,
      // Thinking off: no thinking blocks to replay, and the cheapest call.
      thinking: { type: "disabled" },
      system: cached("Rules."),
      tools: [
        { name: "add_module", description: "Add a module.", input_schema: { type: "object" } },
      ],
      messages: [
        { role: "user", content: "Quiero una ruta" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Armo el plan." },
            { type: "tool_use", id: "toolu_1", name: "add_module", input: { a: 1 } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: cached('{"ok":true}') },
          ],
        },
      ],
    });
  });

  it("turns thinking off on Sonnet the only way it allows", async () => {
    const { sent, fetcher } = upstream(() => new Response(sse(STREAM)));
    await ask(anthropicFetch("test-key", fetcher), request("anthropic/claude-sonnet-5.5"));
    expect(JSON.parse(String(sent[0]?.init.body))).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "between_tools" },
    });
  });

  it("streams back OpenRouter's shape: the words, the call in pieces, and the usage at the table's prices", async () => {
    const { fetcher } = upstream(() => new Response(sse(STREAM)));
    const streamed = await ask(anthropicFetch("test-key", fetcher));
    expect(streamed).toMatchObject({ ok: true, content: "Hola, Andrés." });
    if (!streamed.ok) {
      throw new Error("not ok");
    }
    expect(streamed.toolCalls).toEqual([
      {
        id: "toolu_2",
        type: "function",
        function: { name: "add_module", arguments: '{"title":1}' },
      },
    ]);
    expect(streamed.usage).toEqual({
      cost: {
        kind: "known",
        microcents: costOfUsage("anthropic/claude-haiku-5.5", {
          promptTokens: 10_000,
          cachedTokens: 4_000,
          cacheWriteTokens: 5_000,
          completionTokens: 200,
        }),
      },
      promptTokens: 10_000,
      cachedTokens: 4_000,
      completionTokens: 200,
    });
  });

  it("ends a refused or broken answer as a failure that reached a model, with what it used", async () => {
    const refused = [
      STREAM[0],
      { type: "message_delta", delta: { stop_reason: "refusal" }, usage: { output_tokens: 3 } },
      { type: "message_stop" },
    ];
    const { fetcher } = upstream(() => new Response(sse(refused)));
    expect(await ask(anthropicFetch("test-key", fetcher))).toMatchObject({
      ok: false,
      reached: true,
      usage: { promptTokens: 10_000 },
    });
    const overloaded = [STREAM[0], { type: "error", error: { type: "overloaded_error" } }];
    const broken = upstream(() => new Response(sse(overloaded)));
    expect(await ask(anthropicFetch("test-key", broken.fetcher))).toMatchObject({
      ok: false,
      reached: true,
    });
  });

  it("answers out of credit as 402, a bad key as 401, and anything else as it came", async () => {
    const answer = (status: number, message: string) =>
      ask(
        anthropicFetch(
          "test-key",
          upstream(
            () =>
              new Response(JSON.stringify({ type: "error", error: { type: "x", message } }), {
                status,
              }),
          ).fetcher,
        ),
      );
    expect(
      await answer(400, "Your credit balance is too low to access the Anthropic API."),
    ).toMatchObject({ ok: false, status: 402, isCreditOut: true });
    expect(await answer(401, "invalid x-api-key")).toMatchObject({
      status: 401,
      isCreditOut: true,
    });
    expect(await answer(529, "Overloaded")).toMatchObject({ status: 529, isCreditOut: false });
    expect(await answer(400, "messages: bad")).toMatchObject({ status: 400, isCreditOut: false });
  });

  it("answers only chat completions, and only for the models it knows", async () => {
    const { sent, fetcher } = upstream(() => new Response(sse(STREAM)));
    const adapter = anthropicFetch("test-key", fetcher);
    expect((await adapter("https://example.test/", { method: "POST", body: "{}" })).status).toBe(
      404,
    );
    const unknown = await adapter(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(request("openai/gpt-5-nano")),
    });
    expect(unknown.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("is the only code that names Anthropic's endpoint", () => {
    const root = new URL("../src/", import.meta.url);
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((file) =>
      file.endsWith(".ts"),
    );
    const naming = files.filter((file) =>
      readFileSync(new URL(file, root), "utf8").includes("api.anthropic.com"),
    );
    expect(naming).toEqual(["ai/anthropic.ts"]);
  });
});
