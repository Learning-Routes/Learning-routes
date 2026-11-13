import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEnv } from "../../src/agent/env";
import { modelCall, providerFetch, type SpendBook } from "../../src/agent/model";

const HAIKU = "anthropic/claude-haiku-5.5";

function setUp(given: { env?: Partial<AgentEnv>; lastMinute?: number[]; month?: number } = {}) {
  const recorded: Parameters<SpendBook["record"]>[0][] = [];
  const added: number[] = [];
  const book: SpendBook = {
    spent: () => ({ month: given.month ?? 0, userToday: 0, lastMinute: given.lastMinute ?? [] }),
    record: (row) => recorded.push(row),
  };
  const ledger = { today: async () => 0, add: async (n: number) => void added.push(n) };
  const env = {
    OPENROUTER_API_KEY: "test-key",
    AGENT_SPACE_MONTHLY_MICROCENTS: "5000000",
    AGENT_USER_DAILY_MICROCENTS: "2000000",
    AGENT_DAILY_MICROCENTS: "20000000",
    AGENT_CALLS_PER_MINUTE: "12",
    LEDGER: { idFromName: () => "global", get: () => ledger },
    ...given.env,
  } as unknown as AgentEnv;
  const call = modelCall(env, providerFetch(env), book, { id: "c1", system: () => "Be brief." });
  return { call, recorded, added };
}

const ask = (call: ReturnType<typeof setUp>["call"]) =>
  call(HAIKU, [{ role: "user", content: "Hola" }], () => undefined);

function answerWith(body: string, status = 200) {
  const fetched = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the assistant's model calls", () => {
  it("call no model without a key, without limits, or with the space's month spent", async () => {
    const fetched = answerWith("");
    expect(await ask(setUp({ env: { OPENROUTER_API_KEY: undefined } }).call)).toEqual({
      ok: false,
      why: "budgetOut",
    });
    expect(
      await ask(setUp({ env: { AGENT_DAILY_MICROCENTS: undefined as unknown as string } }).call),
    ).toEqual({ ok: false, why: "budgetOut" });
    expect(await ask(setUp({ month: 5_000_000 }).call)).toEqual({ ok: false, why: "budgetOut" });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("refuse a space that already made a minute's calls", async () => {
    const fetched = answerWith("");
    const now = Date.now();
    const busy = setUp({ lastMinute: Array.from({ length: 12 }, (_, at) => now - at * 1000) });
    expect(await ask(busy.call)).toEqual({ ok: false, why: "failed" });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("meter a call at what it cost, charged to the space", async () => {
    answerWith(
      'data: {"choices":[{"delta":{"content":"Hola"}}],"usage":{"cost":0.00002,"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n',
    );
    const { call, recorded, added } = setUp();
    expect(await ask(call)).toMatchObject({ ok: true, content: "Hola" });
    expect(recorded).toEqual([
      expect.objectContaining({ microcents: 20, isCharged: true, promptTokens: 10 }),
    ]);
    expect(added).toEqual([20]);
  });

  it("meter a broken stream at the worst case: it reached a model, so it is never free", async () => {
    answerWith('data: {"choices":[{"delta":{"content":"Ho"}}]}\n\ndata: {broken\n');
    const { call, recorded, added } = setUp();
    expect(await ask(call)).toEqual({ ok: false, why: "failed" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.microcents).toBeGreaterThan(0);
    expect(recorded[0]?.isCharged).toBe(true);
    expect(added).toEqual([recorded[0]?.microcents]);
  });

  it("pause, with one plain log line, when the provider is out of credit; fail on anything else", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    answerWith('{"error":{"code":402,"message":"Insufficient credits"}}', 402);
    expect(await ask(setUp().call)).toEqual({ ok: false, why: "paused" });
    expect(errors.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
      { message: "provider credit out", status: 402 },
    ]);
    answerWith("overloaded", 503);
    expect(await ask(setUp().call)).toEqual({ ok: false, why: "failed" });
    errors.mockRestore();
  });

  it("meter nothing when OpenRouter refused the call before any model saw it", async () => {
    answerWith("bad gateway", 502);
    const { call, recorded, added } = setUp();
    expect(await ask(call)).toEqual({ ok: false, why: "failed" });
    expect(recorded).toEqual([]);
    expect(added).toEqual([]);
  });
});

describe("who answers the assistant's model calls (STEP 11-prep §A1)", () => {
  const base = { ENVIRONMENT: "development", OPENROUTER_API_KEY: undefined } as const;

  it("is OpenRouter with its key, and no one without it", () => {
    expect(providerFetch({ ...base, OPENROUTER_API_KEY: "test-key" } as never)).toEqual({
      apiKey: "test-key",
      fetcher: fetch,
    });
    expect(providerFetch(base as never)).toBeNull();
  });

  it("is the scripted provider, with no key, when MODEL_PROVIDER says so outside production", () => {
    const provider = providerFetch({ ...base, MODEL_PROVIDER: "scripted" } as never);
    expect(provider?.apiKey).toBe("scripted");
    expect(provider?.fetcher).not.toBe(fetch);
  });

  it("refuses the scripted provider in production: says so, then as if the var were unset", () => {
    let refusals = 0;
    const refused = () => {
      refusals += 1;
    };
    const production = { ENVIRONMENT: "production", MODEL_PROVIDER: "scripted" } as never;
    expect(providerFetch(production, refused)).toBeNull();
    expect(
      providerFetch(
        {
          ENVIRONMENT: "production",
          MODEL_PROVIDER: "scripted",
          OPENROUTER_API_KEY: "test-key",
        } as never,
        refused,
      ),
    ).toEqual({ apiKey: "test-key", fetcher: fetch });
    expect(refusals).toBe(2);
  });

  it("is allowed only in development: any other environment refuses it", () => {
    let refusals = 0;
    for (const ENVIRONMENT of ["Production", "staging", "test", undefined]) {
      expect(
        providerFetch({ ENVIRONMENT, MODEL_PROVIDER: "scripted" } as never, () => {
          refusals += 1;
        }),
      ).toBeNull();
    }
    expect(refusals).toBe(4);
  });
});

describe("the real-model provider and the small tier, local only (STEP 11-prep §A1b)", () => {
  const dev = { ENVIRONMENT: "development" } as const;

  it("answers with Anthropic, in development, with its key; with no key, no one answers", () => {
    const provider = providerFetch({
      ...dev,
      MODEL_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    } as never);
    expect(provider?.apiKey).toBe("anthropic");
    expect(provider?.fetcher).not.toBe(fetch);
    expect(providerFetch({ ...dev, MODEL_PROVIDER: "anthropic" } as never)).toBeNull();
    // Asked for Anthropic, never billed on OpenRouter instead: with no Anthropic key, no one answers.
    expect(
      providerFetch({
        ...dev,
        MODEL_PROVIDER: "anthropic",
        OPENROUTER_API_KEY: "test-openrouter-key",
      } as never),
    ).toBeNull();
  });

  it("refuses Anthropic and the small tier anywhere but development", () => {
    let refusals = 0;
    const refused = () => {
      refusals += 1;
    };
    const production = { ENVIRONMENT: "production", ANTHROPIC_API_KEY: "test-anthropic-key" };
    expect(
      providerFetch({ ...production, MODEL_PROVIDER: "anthropic" } as never, refused),
    ).toBeNull();
    expect(
      providerFetch(
        { ...production, OPENROUTER_API_KEY: "test-key", MODEL_TIER_OVERRIDE: "small" } as never,
        refused,
      ),
    ).toEqual({ apiKey: "test-key", fetcher: fetch });
    expect(refusals).toBe(2);
  });

  it("sends every call to the small tier, with the asked tier's room to write", async () => {
    const fetched = answerWith(
      'data: {"choices":[{"delta":{"content":"Hola"}}],"usage":{"cost":0.00002,"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n',
    );
    const { call, recorded } = setUp({
      env: { ENVIRONMENT: "development", MODEL_TIER_OVERRIDE: "small" } as Partial<AgentEnv>,
    });
    await call("anthropic/claude-sonnet-5.5", [{ role: "user", content: "Hola" }], () => undefined);
    const init = (fetched.mock.calls[0] as unknown[])[1] as RequestInit;
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ model: "anthropic/claude-haiku-5.5", max_tokens: 4000 });
    expect(recorded[0]?.model).toBe("anthropic/claude-haiku-5.5");
  });
});
