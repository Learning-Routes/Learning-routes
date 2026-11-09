import { describe, expect, it } from "vitest";
import { type CallSpec, estimateInputTokens, type GateContext, gate } from "../../src/ai/gate";
import { MODELS, type ModelId } from "../../src/ai/models";
import { V1_LIMITS } from "../../src/credits/spend";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const ctx: GateContext = {
  limits: { ...V1_LIMITS, ratePerMinute: null },
  spend: { globalToday: 0, userToday: 0 },
  consumedAt: [],
  now: NOW,
};
const spec: CallSpec = {
  model: "openai/gpt-5-nano",
  maxTokens: 300,
  promptCache: false,
  sessionId: "review-session-0193",
  system: "x".repeat(400),
  messages: [{ role: "user", content: "y".repeat(400) }],
};

describe("the AI gate", () => {
  it("refuses a model missing from the table", () => {
    expect(gate({ ...spec, model: "openai/gpt-4o" }, ctx)).toEqual({
      verdict: "refused",
      reason: "unknown_model",
    });
  });

  it("refuses a call without a usable max_tokens: its cost has no ceiling", () => {
    for (const maxTokens of [0, -1, 1.5, Number.NaN]) {
      expect(gate({ ...spec, maxTokens }, ctx)).toEqual({
        verdict: "refused",
        reason: "unknown_cost",
      });
    }
  });

  it("estimates the worst case: the prompt at 4 characters a token, plus max_tokens out", () => {
    const decision = gate(spec, ctx);
    const { input, output } = MODELS["openai/gpt-5-nano"];
    // 200 input tokens and 300 output tokens, rounded up to a whole microcent.
    expect(decision).toMatchObject({
      verdict: "allowed",
      estimateMicrocents: Math.ceil((200 * input + 300 * output) / 1_000_000),
    });
  });

  it("goes through the spend gate in credits/", () => {
    const spent = { ...ctx, spend: { globalToday: V1_LIMITS.dailyMicrocents, userToday: 0 } };
    expect(gate(spec, spent)).toEqual({ verdict: "refused", reason: "daily_budget" });
  });

  it("describes the request: the model, max_tokens and the prompt cache", () => {
    const decision = gate({ ...spec, model: "anthropic/claude-haiku-5.5", promptCache: true }, ctx);
    expect(decision.verdict).toBe("allowed");
    if (decision.verdict !== "allowed") {
      return;
    }
    expect(decision.request).toEqual({
      model: "anthropic/claude-haiku-5.5",
      max_tokens: 300,
      provider: { zdr: true, data_collection: "deny" },
      session_id: "review-session-0193",
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: spec.system, cache_control: { type: "ephemeral" } }],
        },
        { role: "user", content: spec.messages[0]?.content },
      ],
    });
  });

  it("never sends a call to a provider that keeps or trains on the data, whatever the model", () => {
    for (const model of Object.keys(MODELS) as ModelId[]) {
      const decision = gate({ ...spec, model }, ctx);
      if (decision.verdict !== "allowed") {
        throw new Error(`${model}: ${decision.reason}`);
      }
      expect(decision.request.provider).toEqual({ zdr: true, data_collection: "deny" });
    }
  });

  it("keeps a session on one provider: session_id, at most 256 characters", () => {
    expect(gate({ ...spec, sessionId: "s".repeat(256) }, ctx)).toMatchObject({
      verdict: "allowed",
      request: { session_id: "s".repeat(256) },
    });
    for (const sessionId of ["s".repeat(257), ""]) {
      expect(gate({ ...spec, sessionId }, ctx)).toEqual({
        verdict: "refused",
        reason: "invalid_session_id",
      });
    }
  });

  it("refuses a prompt over the model's limit before the spend gate sees it", () => {
    const limit = MODELS["anthropic/claude-haiku-5.5"].maxPromptTokens;
    const fits = { ...spec, model: "anthropic/claude-haiku-5.5", system: "", messages: [] };
    const atLimit = {
      ...fits,
      messages: [{ role: "user" as const, content: "x".repeat(limit * 4) }],
    };
    const over = {
      ...fits,
      messages: [{ role: "user" as const, content: "x".repeat(limit * 4 + 1) }],
    };
    expect(gate(atLimit, ctx).verdict).toBe("allowed");
    expect(gate(over, ctx)).toEqual({ verdict: "refused", reason: "prompt_too_long" });

    // Refused first: no spend is reserved for a call that cannot happen.
    const spent = { ...ctx, spend: { globalToday: V1_LIMITS.dailyMicrocents, userToday: 0 } };
    expect(gate(over, spent)).toEqual({ verdict: "refused", reason: "prompt_too_long" });
  });

  it("prices a cached system prompt at the input price when the model has no cache-write price", () => {
    const cached = gate({ ...spec, promptCache: true }, ctx);
    const plain = gate(spec, ctx);
    expect(MODELS["openai/gpt-5-nano"].cacheWrite).toBeNull();
    expect(cached).toMatchObject({ verdict: "allowed" });
    expect(cached.verdict === "allowed" && cached.estimateMicrocents).toBe(
      plain.verdict === "allowed" && plain.estimateMicrocents,
    );
  });

  it("throws on a call too large to price safely, rather than guess", () => {
    const huge = { ...spec, model: "anthropic/claude-sonnet-5.5", maxTokens: 2 ** 40 };
    expect(() => gate(huge, ctx)).toThrow(RangeError);
  });

  it("counts tokens at 4 characters each, rounded up", () => {
    expect(estimateInputTokens("")).toBe(0);
    expect(estimateInputTokens("abcde")).toBe(2);
  });
});

describe("the AI gate, for an agent's turn (Platform STEP 10)", () => {
  const tool = {
    type: "function" as const,
    function: {
      name: "ask_creator",
      description: "Ask one question.",
      parameters: { type: "object", properties: {} },
    },
  };
  const turn: CallSpec = {
    ...spec,
    stream: true,
    tools: [tool],
    messages: [
      { role: "user", content: "Quiero mi app" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "ask_creator", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "{}" },
    ],
  };

  it("sends the tools, the tool calls and their results, and asks for a stream", () => {
    const decision = gate(turn, ctx);
    expect(decision.verdict).toBe("allowed");
    if (decision.verdict !== "allowed") {
      return;
    }
    expect(decision.request.stream).toBe(true);
    expect(decision.request.tools).toEqual([tool]);
    expect(decision.request.messages.slice(1)).toEqual(turn.messages);
  });

  it("prices the tools and the tool calls as prompt: they are sent every time", () => {
    const { tools: _tools, ...withoutTools } = turn;
    const bare = gate({ ...withoutTools, messages: [turn.messages[0] as never] }, ctx);
    const full = gate(turn, ctx);
    if (bare.verdict !== "allowed" || full.verdict !== "allowed") {
      throw new Error("both are allowed");
    }
    expect(full.estimateMicrocents).toBeGreaterThan(bare.estimateMicrocents);
  });

  it("leaves a plain call as it was: no tools and no stream", () => {
    const decision = gate(spec, ctx);
    if (decision.verdict !== "allowed") {
      throw new Error("allowed");
    }
    expect("tools" in decision.request).toBe(false);
    expect("stream" in decision.request).toBe(false);
  });
});

describe("the AI gate's prompt cache (Platform STEP 10)", () => {
  it("also marks the newest message, so a conversation's history is read from the cache next time", () => {
    const decision = gate(
      {
        ...spec,
        promptCache: true,
        messages: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "¿Para quién es?" },
          { role: "user", content: "Para colegio" },
        ],
      },
      ctx,
    );
    if (decision.verdict !== "allowed") {
      throw new Error("allowed");
    }
    expect(decision.request.messages.at(-1)).toEqual({
      role: "user",
      content: [{ type: "text", text: "Para colegio", cache_control: { type: "ephemeral" } }],
    });
    expect(decision.request.messages[1]).toEqual({ role: "user", content: "Hola" });
  });

  it("marks a tool's answer the same way, and nothing without the cache", () => {
    const messages: CallSpec["messages"] = [
      { role: "user", content: "Hola" },
      { role: "tool", tool_call_id: "c1", content: "{}" },
    ];
    const cached = gate({ ...spec, promptCache: true, messages }, ctx);
    const plain = gate({ ...spec, promptCache: false, messages }, ctx);
    if (cached.verdict !== "allowed" || plain.verdict !== "allowed") {
      throw new Error("allowed");
    }
    expect(cached.request.messages.at(-1)).toMatchObject({
      content: [{ type: "text", text: "{}", cache_control: { type: "ephemeral" } }],
    });
    expect(plain.request.messages.at(-1)).toEqual(messages[1]);
  });
});
