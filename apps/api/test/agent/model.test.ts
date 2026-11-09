import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEnv } from "../../src/agent/env";
import { modelCall, type SpendBook } from "../../src/agent/model";

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
    LEDGER: { idFromName: () => "global", get: () => ledger },
    ...given.env,
  } as unknown as AgentEnv;
  const call = modelCall(env, book, { id: "c1", system: () => "Be brief." });
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

  it("meter nothing when OpenRouter refused the call before any model saw it", async () => {
    answerWith("no credit", 402);
    const { call, recorded, added } = setUp();
    expect(await ask(call)).toEqual({ ok: false, why: "failed" });
    expect(recorded).toEqual([]);
    expect(added).toEqual([]);
  });
});
