import { type GateContext, gate } from "@learning-routes/core/ai/gate";
import { V1_LIMITS } from "@learning-routes/core/credits/spend";
import { describe, expect, it } from "vitest";
import { streamFromOpenRouter } from "../src/ai/openrouter";

const context: GateContext = {
  limits: { ...V1_LIMITS, ratePerMinute: null },
  spend: { globalToday: 0, userToday: 0 },
  consumedAt: [],
  now: Date.parse("2026-11-09T12:00:00Z"),
};

function allowed() {
  const decision = gate(
    {
      model: "anthropic/claude-haiku-5.5",
      maxTokens: 200,
      promptCache: true,
      sessionId: "studio-test",
      system: "Be brief.",
      messages: [{ role: "user", content: "Hola" }],
      stream: true,
    },
    context,
  );
  if (decision.verdict !== "allowed") {
    throw new Error("allowed");
  }
  return decision;
}

// An SSE body cut at awkward places, as a network delivers it.
function sse(lines: string[], cutEvery = 7): typeof fetch {
  const text = lines.join("\n");
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let at = 0; at < text.length; at += cutEvery) {
            controller.enqueue(new TextEncoder().encode(text.slice(at, at + cutEvery)));
          }
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;
}

const data = (value: unknown) => `data: ${JSON.stringify(value)}\n`;

describe("streaming from OpenRouter", () => {
  it("passes the words on as they come, and returns the whole answer with its cost", async () => {
    const seen: string[] = [];
    const answer = await streamFromOpenRouter(
      allowed(),
      "test-key",
      (text) => seen.push(text),
      sse([
        ": OPENROUTER PROCESSING\n",
        data({ choices: [{ delta: { content: "¡Hola" } }] }),
        data({ choices: [{ delta: { content: ", Andrés!" } }] }),
        data({
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { cost: 0.000012, prompt_tokens: 40, completion_tokens: 6 },
        }),
        "data: [DONE]\n",
      ]),
    );
    expect(seen).toEqual(["¡Hola", "¡Hola, Andrés!"]);
    expect(answer).toMatchObject({
      ok: true,
      content: "¡Hola, Andrés!",
      toolCalls: [],
      usage: { cost: { kind: "known", microcents: 12 }, promptTokens: 40, completionTokens: 6 },
    });
  });

  it("puts tool calls together from their pieces", async () => {
    const answer = await streamFromOpenRouter(
      allowed(),
      "test-key",
      () => undefined,
      sse([
        data({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "c1",
                    type: "function",
                    function: { name: "set_step", arguments: "" },
                  },
                ],
              },
            },
          ],
        }),
        data({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"step"' } }] } }],
        }),
        data({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"plan"}' } }] } }],
        }),
        data({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { cost: 0.00001 } }),
        "data: [DONE]\n",
      ]),
    );
    expect(answer).toMatchObject({
      ok: true,
      toolCalls: [
        {
          id: "c1",
          type: "function",
          function: { name: "set_step", arguments: '{"step":"plan"}' },
        },
      ],
    });
  });

  it("fails plainly on an error in the stream or a refused request, with what it had used", async () => {
    const midway = await streamFromOpenRouter(
      allowed(),
      "k",
      () => undefined,
      sse([data({ error: { message: "overloaded" } }), "data: [DONE]\n"]),
    );
    expect(midway).toMatchObject({ ok: false, status: 502 });
    const refused = await streamFromOpenRouter(
      allowed(),
      "k",
      () => undefined,
      (async () => new Response("no", { status: 402 })) as unknown as typeof fetch,
    );
    expect(refused).toEqual({ ok: false, status: 402, usage: null });
  });
});
