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
    expect(midway).toMatchObject({ ok: false, status: 502, reached: true });
    const refused = await streamFromOpenRouter(
      allowed(),
      "k",
      () => undefined,
      (async () => new Response("no", { status: 402 })) as unknown as typeof fetch,
    );
    expect(refused).toEqual({
      ok: false,
      status: 402,
      usage: null,
      reached: false,
      isCreditOut: true,
    });
  });

  it("tells a provider out of credit, or with a bad or spent key, from any other refusal", async () => {
    const answer = (status: number, body: unknown = { error: { code: status, message: "no" } }) =>
      streamFromOpenRouter(
        allowed(),
        "k",
        () => undefined,
        (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
      );
    const keyLimit = {
      error: {
        code: 403,
        message: "Key limit exceeded",
        metadata: { limit_source: "openrouter_key_limit" },
      },
    };
    const flagged = {
      error: { code: 403, message: "flagged", metadata: { reasons: ["violence"] } },
    };
    expect(await answer(402)).toMatchObject({ isCreditOut: true });
    expect(await answer(401)).toMatchObject({ isCreditOut: true });
    expect(await answer(403, keyLimit)).toMatchObject({ isCreditOut: true });
    expect(await answer(403, flagged)).toMatchObject({ isCreditOut: false });
    expect(await answer(403, "not json")).toMatchObject({ isCreditOut: false });
    expect(await answer(500)).toMatchObject({ isCreditOut: false });
    expect(await answer(429)).toMatchObject({ isCreditOut: false });
  });

  it("counts a broken stream as a call that reached a model, so it is still metered", async () => {
    const broken = await streamFromOpenRouter(
      allowed(),
      "k",
      () => undefined,
      sse([data({ choices: [{ delta: { content: "Ho" } }] }), "data: {not json\n"]),
    );
    expect(broken).toEqual({
      ok: false,
      status: 502,
      usage: null,
      reached: true,
      isCreditOut: false,
    });
  });

  it("gives up on a stream that takes too long", async () => {
    const sent: RequestInit[] = [];
    await streamFromOpenRouter(allowed(), "k", () => undefined, (async (
      _url: unknown,
      init: RequestInit,
    ) => {
      sent.push(init);
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch);
    expect(sent[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
