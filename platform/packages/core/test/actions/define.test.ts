import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ActorKind } from "../../src/actions/actor";
import { ActionError, type Ctx, defineAction, mcpTools, runAction } from "../../src/actions/define";
import { testCtx, testWorld } from "./test-ctx";

const echo = defineAction({
  name: "test.echo",
  kind: "query",
  description: "Returns its input and who asked.",
  input: z.object({ text: z.string().min(1) }),
  target: () => ({ kind: "space", id: "space-1" }),
  run: async (ctx, input) => ({ text: input.text, at: ctx.clock.now() }),
});
const fail = defineAction({
  name: "test.fail",
  kind: "mutation",
  description: "Always refuses.",
  input: z.object({}),
  target: () => ({ kind: "space", id: "space-1" }),
  run: async () => {
    throw new ActionError("not_found", "nothing here");
  },
});
const registry = { "test.echo": echo, "test.fail": fail };
const allowAll = () => true;

// Every target is in space-1, where user-1 owns it; access is tested in tenancy.test.ts.
const ctx = (via: ActorKind): Ctx => ({
  ...testCtx(via, testWorld(), "user-1"),
  tenancy: { scopeOf: async () => ({ spaceId: "space-1", role: "owner" }) },
  clock: { now: () => 1_000 },
});

describe("runAction", () => {
  it("validates, runs and reports the output", async () => {
    expect(await runAction(registry, "test.echo", { text: "hola" }, ctx("ui"), allowAll)).toEqual({
      ok: true,
      output: { text: "hola", at: 1_000 },
    });
  });

  it("refuses an unknown action", async () => {
    expect(await runAction(registry, "test.nope", {}, ctx("ui"), allowAll)).toEqual({
      ok: false,
      code: "unknown_action",
    });
  });

  it("refuses invalid input with the failing paths", async () => {
    expect(await runAction(registry, "test.echo", { text: "" }, ctx("mcp"), allowAll)).toEqual({
      ok: false,
      code: "invalid_input",
      issues: [{ path: "text", message: expect.any(String) }],
    });
  });

  it("reports an action's own refusal", async () => {
    expect(await runAction(registry, "test.fail", {}, ctx("agent"), allowAll)).toEqual({
      ok: false,
      code: "not_found",
      message: "nothing here",
    });
  });

  it("does not resolve a name through the prototype chain", async () => {
    expect(await runAction(registry, "toString", {}, ctx("ui"), allowAll)).toEqual({
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
    expect(
      await runAction(aliased, tool?.name ?? "", { text: "hola" }, ctx("mcp"), allowAll),
    ).toMatchObject({
      ok: true,
    });
  });
});
