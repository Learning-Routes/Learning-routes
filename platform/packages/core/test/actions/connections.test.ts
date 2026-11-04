import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { STAFF, testCtx, testWorld, type World } from "./test-ctx";

// A person's connected assistants (Platform STEP 5 §2): only in the app, only one's own, and
// only for someone who teaches. Connecting and disconnecting are logged, in no space.

const CLIENT = "https://client.example.test/metadata.json";
const GRANT = { clientId: CLIENT, scopes: ["routes:read"] };

function connected(world: World, userId: string) {
  world.connections.set(`${userId}:${CLIENT}`, {
    userId,
    clientId: CLIENT,
    clientName: "Cliente",
    scopes: ["routes:read"],
    lastUsedAt: null,
  });
}

describe("connection.grant", () => {
  it("lets someone who teaches say yes, and logs it in no space", async () => {
    const world = testWorld();
    const result = await runAction(
      ACTIONS,
      "connection.grant",
      GRANT,
      testCtx("ui", world, STAFF.assistant),
    );
    expect(result.ok).toBe(true);
    expect(world.log.at(-1)).toMatchObject({
      spaceId: null,
      action: "connection.grant",
      outcome: "ok",
      actorUserId: STAFF.assistant,
    });
  });

  it("refuses someone who only studies, and logs the refusal", async () => {
    const world = testWorld();
    const result = await runAction(
      ACTIONS,
      "connection.grant",
      GRANT,
      testCtx("ui", world, "student-1"),
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(world.log.at(-1)).toMatchObject({ action: "connection.grant", outcome: "forbidden" });
  });

  it("is never reached through the MCP", async () => {
    const world = testWorld();
    const result = await runAction(
      ACTIONS,
      "connection.grant",
      GRANT,
      testCtx("mcp", world, STAFF.owner),
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("connection.list and connection.revoke", () => {
  it("lists only one's own", async () => {
    const world = testWorld();
    connected(world, STAFF.owner);
    const mine = await runAction(ACTIONS, "connection.list", {}, testCtx("ui", world, STAFF.owner));
    const theirs = await runAction(
      ACTIONS,
      "connection.list",
      {},
      testCtx("ui", world, STAFF.coeditor),
    );
    expect(mine).toMatchObject({ ok: true, output: [{ clientId: CLIENT }] });
    expect(theirs).toEqual({ ok: true, output: [] });
  });

  it("ends one's own and logs it; another's is not_found", async () => {
    const world = testWorld();
    connected(world, STAFF.owner);
    const other = await runAction(
      ACTIONS,
      "connection.revoke",
      { clientId: CLIENT },
      testCtx("ui", world, STAFF.coeditor),
    );
    expect(other).toMatchObject({ ok: false, code: "not_found" });
    expect(world.connections.size).toBe(1);
    const own = await runAction(
      ACTIONS,
      "connection.revoke",
      { clientId: CLIENT },
      testCtx("ui", world, STAFF.owner),
    );
    expect(own.ok).toBe(true);
    expect(world.connections.size).toBe(0);
    expect(world.log.at(-1)).toMatchObject({
      spaceId: null,
      action: "connection.revoke",
      outcome: "ok",
    });
  });
});
