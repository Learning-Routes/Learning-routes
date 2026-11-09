import { describe, expect, it } from "vitest";
import type { ModelMessage, ToolCall } from "../../src/ai/gate";
import type { StudioEvent } from "../../src/studio/session";
import {
  MAX_CALLS_PER_TURN,
  type ModelAnswer,
  runTurn,
  type TurnDeps,
} from "../../src/studio/turn";

const ROUTE = "00000000-0000-7000-8000-000000000001";

const toolCall = (id: string, name: string, args: unknown): ToolCall => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

function fake(answers: ModelAnswer[]) {
  const events: { event: StudioEvent; keep: boolean }[] = [];
  const models: string[] = [];
  const content: string[] = [];
  const deps: TurnDeps = {
    step: "meet",
    call: async (model, _messages, onText) => {
      models.push(model);
      const answer = answers.shift() ?? { ok: false, why: "failed" };
      if (answer.ok && answer.content) {
        onText(answer.content.slice(0, 3));
      }
      return answer;
    },
    runContentTool: async (name, args) => {
      content.push(`${name} ${args}`);
      return { text: '{"ok":true}', routeId: ROUTE };
    },
    studio: async (call) => (call.name === "ask_to_publish" ? "shown" : "done"),
    afterWrite: async () => undefined,
    emit: (event, keep) => events.push({ event, keep }),
    words: { failed: "FAILED", budgetOut: "OUT", tooLong: "LONG", working: () => "WORKING" },
  };
  return { deps, events, models, content };
}

const history = (): ModelMessage[] => [{ role: "user", content: "Quiero mi app de matemáticas" }];

describe("a turn of the assistant", () => {
  it("streams its words, keeps only the finished ones, and asks one question to end the turn", async () => {
    const { deps, events } = fake([
      {
        ok: true,
        content: "¡Hola, Andrés!",
        toolCalls: [
          toolCall("c1", "ask_creator", {
            question: "¿Ya tienes contenido?",
            is_fork: true,
            options: [
              { label: "Tengo contenido", decision: "Con su material" },
              { label: "Desde cero", decision: "Desde cero" },
            ],
          }),
        ],
      },
    ]);
    const messages = history();
    await runTurn(messages, deps);
    expect(events).toEqual([
      { event: { type: "said", text: "¡Ho" }, keep: false },
      { event: { type: "said", text: "¡Hola, Andrés!" }, keep: true },
    ]);
    // The ask itself is the page's to draw (deps.studio); the answer to it waits for the creator.
    expect(messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: "done" });
    expect(messages).toHaveLength(3);
  });

  it("uses the cheap model to talk and the strong one to plan and write", async () => {
    const talk = fake([{ ok: true, content: "Hola", toolCalls: [] }]);
    await runTurn(history(), talk.deps);
    const write = fake([{ ok: true, content: "Listo", toolCalls: [] }]);
    await runTurn(history(), { ...write.deps, step: "build" });
    expect(talk.models).toEqual(["anthropic/claude-haiku-5.5"]);
    expect(write.models).toEqual(["anthropic/claude-sonnet-5.5"]);
  });

  it("runs content tools with a quiet working line, then goes on until the model is done", async () => {
    const { deps, events, content } = fake([
      {
        ok: true,
        content: "",
        toolCalls: [toolCall("c1", "add_module", { title: { es: "Lo básico" } })],
      },
      { ok: true, content: "Listo el módulo 1.", toolCalls: [] },
    ]);
    const messages = history();
    await runTurn(messages, deps);
    expect(content).toEqual(['add_module {"title":{"es":"Lo básico"}}']);
    expect(events.map((each) => each.event)).toEqual([
      { type: "working", text: "WORKING" },
      { type: "worked" },
      { type: "said", text: "Lis" },
      { type: "said", text: "Listo el módulo 1." },
    ]);
  });

  it("never offers to publish, change a price or delete: those calls are refused as unknown", async () => {
    const { deps, content } = fake([
      {
        ok: true,
        content: "",
        toolCalls: [
          toolCall("c1", "publish_route", { route_id: ROUTE }),
          toolCall("c2", "set_price", {}),
          toolCall("c3", "remove_block", {}),
        ],
      },
      { ok: true, content: "Bien.", toolCalls: [] },
    ]);
    const messages = history();
    await runTurn(messages, deps);
    expect(content).toEqual([]);
    expect(messages.filter((m) => m.role === "tool").map((m) => m.content)).toEqual([
      "There is no tool publish_route.",
      "There is no tool set_price.",
      "There is no tool remove_block.",
    ]);
  });

  it("asks one question per turn: a second ask in the same answer is refused", async () => {
    const asked: string[] = [];
    const { deps } = fake([
      {
        ok: true,
        content: "",
        toolCalls: [
          toolCall("c1", "ask_creator", {
            question: "¿Cómo te llamas?",
            is_fork: false,
            options: [],
          }),
          toolCall("c2", "ask_creator", { question: "¿Qué enseñas?", is_fork: false, options: [] }),
        ],
      },
    ]);
    deps.studio = async (call) => {
      asked.push(call.name === "ask_creator" ? call.question : call.name);
      return "done";
    };
    const messages = history();
    await runTurn(messages, deps);
    expect(asked).toEqual(["¿Cómo te llamas?"]);
    expect(messages.at(-1)).toMatchObject({
      tool_call_id: "c2",
      content: expect.stringContaining("one question"),
    });
  });

  it("answers a broken studio call with what to fix, and never draws it", async () => {
    const { deps } = fake([
      {
        ok: true,
        content: "",
        toolCalls: [
          toolCall("c1", "ask_creator", { question: "¿A? ¿B?", is_fork: false, options: [] }),
        ],
      },
      { ok: true, content: "Perdón.", toolCalls: [] },
    ]);
    const messages = history();
    await runTurn(messages, deps);
    expect(messages[2]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect((messages[2] as { content: string }).content).toContain("one question");
  });

  it("says plainly when the month's budget is spent or a call fails, and stops", async () => {
    const out = fake([{ ok: false, why: "budgetOut" }]);
    await runTurn(history(), out.deps);
    expect(out.events).toEqual([{ event: { type: "said", text: "OUT" }, keep: true }]);
    const failed = fake([{ ok: false, why: "failed" }]);
    await runTurn(history(), failed.deps);
    expect(failed.events).toEqual([{ event: { type: "said", text: "FAILED" }, keep: true }]);
  });

  it("stops after a fixed number of model calls in one turn", async () => {
    const endless = Array.from({ length: MAX_CALLS_PER_TURN + 3 }, (_, at) => ({
      ok: true as const,
      content: "",
      toolCalls: [toolCall(`c${at}`, "get_route", { route_id: ROUTE })],
    }));
    const { deps, models, events } = fake(endless);
    await runTurn(history(), deps);
    expect(models).toHaveLength(MAX_CALLS_PER_TURN);
    expect(events.at(-1)).toEqual({ event: { type: "said", text: "LONG" }, keep: true });
  });
});
