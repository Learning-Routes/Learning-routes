import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ActionError,
  type ActorKind,
  type Ctx,
  defineAction,
  mcpTools,
  runAction,
} from "../../src/actions/define";

const echo = defineAction({
  name: "test.echo",
  kind: "query",
  description: "Returns its input and who asked.",
  input: z.object({ text: z.string().min(1) }),
  run: async (ctx, input) => ({ text: input.text, at: ctx.now }),
});
const fail = defineAction({
  name: "test.fail",
  kind: "mutation",
  description: "Always refuses.",
  input: z.object({}),
  run: async () => {
    throw new ActionError("not_found", "nothing here");
  },
});
const registry = { "test.echo": echo, "test.fail": fail };

const ctx = (via: ActorKind): Ctx => ({
  actor: { via, userId: "user-1" },
  store: { get: async () => undefined, put: async () => undefined },
  now: 1_000,
  newId: () => "id-1",
});

describe("runAction", () => {
  it("validates, runs and reports the output", async () => {
    expect(await runAction(registry, "test.echo", { text: "hola" }, ctx("ui"))).toEqual({
      ok: true,
      output: { text: "hola", at: 1_000 },
    });
  });

  it("refuses an unknown action", async () => {
    expect(await runAction(registry, "test.nope", {}, ctx("ui"))).toEqual({
      ok: false,
      code: "unknown_action",
    });
  });

  it("refuses invalid input with the failing paths", async () => {
    expect(await runAction(registry, "test.echo", { text: "" }, ctx("mcp"))).toEqual({
      ok: false,
      code: "invalid_input",
      issues: [{ path: "text", message: expect.any(String) }],
    });
  });

  it("reports an action's own refusal", async () => {
    expect(await runAction(registry, "test.fail", {}, ctx("agent"))).toEqual({
      ok: false,
      code: "not_found",
      message: "nothing here",
    });
  });

  it("does not resolve a name through the prototype chain", async () => {
    expect(await runAction(registry, "toString", {}, ctx("ui"))).toEqual({
      ok: false,
      code: "unknown_action",
    });
  });
});

describe("mcpTools", () => {
  it("describes every action, read-only for queries", () => {
    const tools = mcpTools(registry);
    expect(tools.map((tool) => [tool.name, tool.annotations.readOnlyHint])).toEqual([
      ["test.echo", true],
      ["test.fail", false],
    ]);
    expect(tools[0]?.inputSchema).toMatchObject({
      type: "object",
      properties: { text: { type: "string", minLength: 1 } },
      required: ["text"],
    });
  });

  it("names each tool by the key runAction answers to", async () => {
    const aliased = { "test.alias": echo };
    const [tool] = mcpTools(aliased);
    expect(tool?.name).toBe("test.alias");
    expect(await runAction(aliased, tool?.name ?? "", { text: "hola" }, ctx("mcp"))).toMatchObject({
      ok: true,
    });
  });
});
