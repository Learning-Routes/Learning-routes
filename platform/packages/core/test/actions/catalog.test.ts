import { describe, expect, it } from "vitest";
import { can } from "../../src/access";
import type { ActorKind } from "../../src/actions/actor";
import { runAction } from "../../src/actions/define";
import { purgeTagsAfter } from "../../src/actions/purge-tags";
import { ACTIONS } from "../../src/actions/registry";
import { ROUTE, SPACE, STAFF, testCtx, testWorld, type World } from "./test-ctx";

// The catalog (Platform STEP 4 §3.1): an owner asks and withdraws; only an operator,
// from the app, decides.

const OPERATOR = "operator-1";
const call = (world: World, userId: string, name: string, input: unknown, via: ActorKind = "ui") =>
  runAction(ACTIONS, name, input, testCtx(via, world, userId));

function worldWithOperator() {
  const world = testWorld();
  world.operators.add(OPERATOR);
  return world;
}

async function requested(world: World) {
  const asked = await call(world, STAFF.owner, "catalog.request", { routeId: ROUTE });
  if (!asked.ok) {
    throw new Error(JSON.stringify(asked));
  }
  return (asked.output as { listingId: string }).listingId;
}

describe("the operator's row in the permission table (Platform STEP 4 §2.5)", () => {
  it("grants the admin actions, through the app only, and nothing else", () => {
    expect(can("operator", "catalog.decide", "ui")).toBe(true);
    expect(can("operator", "catalog.decide", "mcp")).toBe(false);
    expect(can("operator", "catalog.decide", "agent")).toBe(false);
    expect(can("operator", "route.publish", "ui")).toBe(false);
    expect(can("operator", "space.update", "ui")).toBe(false);
  });
});

describe("catalog.request", () => {
  it("an owner asks for a listing of a published route", async () => {
    const world = worldWithOperator();
    await requested(world);
    expect([...world.listings.values()]).toMatchObject([
      { routeId: ROUTE, spaceId: SPACE, status: "requested" },
    ]);
  });

  it("is refused to anyone else, and through an agent", async () => {
    const world = worldWithOperator();
    for (const userId of [STAFF.coeditor, STAFF.assistant]) {
      expect(await call(world, userId, "catalog.request", { routeId: ROUTE })).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    }
    expect(
      await call(world, STAFF.owner, "catalog.request", { routeId: ROUTE }, "agent"),
    ).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("is refused for a route with no price and no free module", async () => {
    // The test world's published version has no modules, and no price.
    const world = worldWithOperator();
    const version = world.versions.get(`${ROUTE}:1`);
    if (version) {
      version.snapshot.modules = [];
    }
    expect(await call(world, STAFF.owner, "catalog.request", { routeId: ROUTE })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("is refused for a route nobody published", async () => {
    const world = worldWithOperator();
    world.versions.clear();
    const draft = world.drafts.get(ROUTE);
    if (draft) {
      draft.latestPublishedVersion = null;
    }
    expect(await call(world, STAFF.owner, "catalog.request", { routeId: ROUTE })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("answers conflict while a request is active", async () => {
    const world = worldWithOperator();
    await requested(world);
    expect(await call(world, STAFF.owner, "catalog.request", { routeId: ROUTE })).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
});

describe("catalog.withdraw", () => {
  it("an owner withdraws, and may ask again", async () => {
    const world = worldWithOperator();
    await requested(world);
    expect(await call(world, STAFF.owner, "catalog.withdraw", { routeId: ROUTE })).toMatchObject({
      ok: true,
    });
    await requested(world);
    expect([...world.listings.values()].map((row) => row.status).sort()).toEqual([
      "requested",
      "withdrawn",
    ]);
  });

  it("answers not_found with nothing to withdraw", async () => {
    expect(
      await call(worldWithOperator(), STAFF.owner, "catalog.withdraw", { routeId: ROUTE }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("catalog.decide", () => {
  it("an operator approves, recording who, when, and the version", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    const decided = await call(world, OPERATOR, "catalog.decide", {
      listingId,
      decision: "approve",
    });
    expect(decided).toMatchObject({ ok: true, output: { status: "approved" } });
    expect(world.listings.get(listingId)).toMatchObject({
      status: "approved",
      decidedBy: OPERATOR,
      decidedVersion: 1,
    });
  });

  it("an operator declines, and the note is kept for the creator", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    await call(world, OPERATOR, "catalog.decide", {
      listingId,
      decision: "decline",
      note: "Falta la descripción",
    });
    expect(world.listings.get(listingId)).toMatchObject({
      status: "declined",
      note: "Falta la descripción",
    });
  });

  it("does not exist for anyone else, their space's owner included", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    for (const userId of [STAFF.owner, "student-1", "a-stranger"]) {
      expect(
        await call(world, userId, "catalog.decide", { listingId, decision: "approve" }),
      ).toMatchObject({ ok: false, code: "not_found" });
    }
    expect(world.listings.get(listingId)?.status).toBe("requested");
  });

  it("an operator cannot decide through an agent or MCP", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    for (const via of ["agent", "mcp"] as const) {
      expect(
        await call(world, OPERATOR, "catalog.decide", { listingId, decision: "approve" }, via),
      ).toMatchObject({ ok: false, code: "forbidden" });
    }
  });

  it("writes the action log, in the listing's space, without the note's words", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    await call(world, OPERATOR, "catalog.decide", {
      listingId,
      decision: "decline",
      note: "Falta la descripción",
    });
    const entry = world.log.find((row) => row.action === "catalog.decide");
    expect(entry).toMatchObject({ spaceId: SPACE, actorUserId: OPERATOR, outcome: "ok" });
    expect(JSON.stringify(entry)).not.toContain("Falta");
  });

  it("answers not_found for a listing that was already withdrawn", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    await call(world, STAFF.owner, "catalog.withdraw", { routeId: ROUTE });
    expect(
      await call(world, OPERATOR, "catalog.decide", { listingId, decision: "approve" }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("what a catalog change makes stale", () => {
  it("purges the route, its space and every page that lists routes", () => {
    const output = { spaceId: "s", routeId: "r", status: "approved" };
    for (const action of ["catalog.decide", "catalog.withdraw"]) {
      expect(purgeTagsAfter(action, output)).toEqual(["route:r", "space:s", "catalog"]);
    }
  });
});
