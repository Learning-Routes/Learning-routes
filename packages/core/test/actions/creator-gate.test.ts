import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CREATOR_ACTIONS } from "../../src/access";
import { ACTOR_KINDS } from "../../src/actions/actor";
import { defineAction, type Registry, runAction } from "../../src/actions/define";
import { memoryTenancy, SPACE, testCtx, testWorld } from "./test-ctx";

// Building takes being a creator (Platform STEP 14): an owner or a coeditor. Anyone else who
// tries a creator action, through the app, the MCP or the assistant, hears creator_required.
// It is said from the actor alone, so a creator elsewhere still gets not_found: no space's
// existence leaks to anyone.

const CREATOR_REQUIRED = {
  ok: false,
  code: "creator_required",
  message: "only a creator in this space may do this",
};

/** Each creator action by its real name, on a space row, with its input check out of the way. */
const registry: Registry = Object.fromEntries(
  [...CREATOR_ACTIONS].map((name) => [
    name,
    defineAction({
      name,
      kind: "mutation",
      description: name,
      input: z.object({}).loose(),
      target: () => ({ kind: "space", id: SPACE }),
      run: async () => "ran",
    }),
  ]),
);

const ctxAs = (userId: string, via: (typeof ACTOR_KINDS)[number]) =>
  testCtx(via, testWorld(), userId, {
    tenancy: memoryTenancy({
      rows: { [`space:${SPACE}`]: SPACE, "space:space-2": "space-2" },
      roles: {
        [`${SPACE}:owner-1`]: "owner",
        [`${SPACE}:coeditor-1`]: "coeditor",
        [`${SPACE}:assistant-1`]: "assistant",
        [`${SPACE}:student-1`]: "student",
        "space-2:elsewhere-1": "owner",
      },
    }),
  });

describe("the creator gate", () => {
  it("covers every way content is built, and nothing a learner or the operator does", () => {
    expect([...CREATOR_ACTIONS].sort()).toEqual([
      "asset.upload",
      "block.add",
      "block.remove",
      "blocks.add",
      "catalog.request",
      "catalog.withdraw",
      "creation.upload",
      "lesson.add",
      "membership.add",
      "module.add",
      "route.create",
      "route.import",
      "route.publish",
      "route.set_price",
      "route.update",
      "route.upload",
      "space.update",
    ]);
  });

  for (const name of CREATOR_ACTIONS) {
    for (const via of ACTOR_KINDS) {
      it(`${name} via ${via}: creator_required for a learner, an assistant and a stranger`, async () => {
        for (const who of ["student-1", "assistant-1", "stranger"]) {
          expect(await runAction(registry, name, {}, ctxAs(who, via), () => true)).toEqual(
            CREATOR_REQUIRED,
          );
        }
      });
    }
  }

  it("answers not_found, not creator_required, to a creator outside the space", async () => {
    for (const name of CREATOR_ACTIONS) {
      expect(await runAction(registry, name, {}, ctxAs("elsewhere-1", "mcp"))).toMatchObject({
        code: "not_found",
      });
    }
  });

  it("lets existing creators build exactly as before", async () => {
    for (const name of CREATOR_ACTIONS) {
      expect(await runAction(registry, name, {}, ctxAs("owner-1", "ui"))).toEqual({
        ok: true,
        output: "ran",
      });
    }
    // A coeditor keeps their ways in; what only an owner may do stays forbidden to them.
    expect(await runAction(registry, "route.import", {}, ctxAs("coeditor-1", "mcp"))).toEqual({
      ok: true,
      output: "ran",
    });
    expect(
      await runAction(registry, "route.set_price", {}, ctxAs("coeditor-1", "ui")),
    ).toMatchObject({ code: "forbidden" });
  });
});
