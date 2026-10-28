import { type GateContext, gate } from "@learning-routes/core/ai/gate";
import { V1_LIMITS } from "@learning-routes/core/credits/spend";
import { describe, expect, it } from "vitest";
import { sendToOpenRouter, settle } from "../src/ai/openrouter";
import response from "./fixtures/openrouter-chat-completion.json" with { type: "json" };

const ENDPOINT = "openrouter.ai/api/v1/chat";
const context: GateContext = {
  limits: { ...V1_LIMITS, ratePerMinute: null },
  spend: { globalToday: 0, userToday: 0 },
  consumedAt: [],
  now: Date.parse("2026-10-28T12:00:00Z"),
};

// Every platform source file, as text.
const sources = {
  ...import.meta.glob("../../*/{src,app,workers}/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("../../../packages/*/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

describe("the OpenRouter adapter", () => {
  it("sends exactly the request the gate allowed, with the key", async () => {
    const decision = gate(
      {
        model: "openai/gpt-5-nano",
        maxTokens: 100,
        promptCache: false,
        sessionId: "review-session-0193",
        system: "Be brief.",
        messages: [{ role: "user", content: "Hola" }],
      },
      context,
    );
    if (decision.verdict !== "allowed") throw new Error(`refused: ${decision.reason}`);

    const sent: { url: string; init: RequestInit }[] = [];
    const stub = async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), init: init ?? {} });
      return new Response("{}");
    };
    await sendToOpenRouter(decision, "test-key", stub as typeof fetch);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`https://${ENDPOINT}/completions`);
    expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual(decision.request);
  });

  it("settles a call from the cost OpenRouter reports, in microcents", () => {
    // usage.cost is in credits, one US dollar each: $0.0000145 is 14.5 microcents.
    expect(settle(response)).toEqual({
      cost: { kind: "known", microcents: 15 },
      promptTokens: 194,
      cachedTokens: 64,
      completionTokens: 12,
    });
  });

  it("never guesses a cost the response does not report", () => {
    const noCost = { ...response, usage: { ...response.usage, cost: null } };
    expect(settle(noCost).cost).toEqual({
      kind: "unknown",
      reason: "provider_reported_usage_required",
    });
    expect(settle({}).cost.kind).toBe("unknown");
  });

  it("is the only code that names the OpenRouter endpoint", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(20);
    const callers = files.filter(([, text]) => text.includes(ENDPOINT)).map(([file]) => file);
    expect(callers).toEqual(["../src/ai/openrouter.ts"]);
  });
});
