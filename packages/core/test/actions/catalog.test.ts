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

describe("what an operator looks after (Platform STEP 4 §6.4)", () => {
  const APPLICATION = "0192d3a0-0000-7000-8000-0000000000b1";

  function withApplication() {
    const world = worldWithOperator();
    world.applications.set(APPLICATION, {
      id: APPLICATION,
      name: "Ana Prueba",
      email: "ana@example.com",
      teaches: "Guitarra",
      link: null,
      locale: "es",
      status: "new",
    });
    return world;
  }

  it("admin.overview shows new applications and active listings, to operators only", async () => {
    const world = withApplication();
    await requested(world);
    const seen = await call(world, OPERATOR, "admin.overview", {});
    expect(seen).toMatchObject({
      ok: true,
      output: {
        applications: [{ id: APPLICATION }],
        listings: [{ status: "requested" }],
      },
    });
    expect(await call(world, STAFF.owner, "admin.overview", {})).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("application.decide leaves the list, is logged in no space, without the person's words", async () => {
    const world = withApplication();
    expect(
      await call(world, OPERATOR, "application.decide", {
        applicationId: APPLICATION,
        status: "invited",
      }),
    ).toMatchObject({ ok: true });
    expect(world.applications.get(APPLICATION)?.status).toBe("invited");
    const entry = world.log.find((row) => row.action === "application.decide");
    expect(entry).toMatchObject({ spaceId: null, actorUserId: OPERATOR, outcome: "ok" });
    expect(JSON.stringify(entry)).not.toContain("Ana");
  });

  it("logs an operator's refusal too", async () => {
    const world = worldWithOperator();
    expect(
      await call(world, OPERATOR, "application.decide", {
        applicationId: APPLICATION,
        status: "invited",
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(world.log.map((row) => [row.spaceId, row.outcome])).toEqual([[null, "not_found"]]);
  });

  it("catalog.feature chooses an approved route for the landing, and takes it off", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    // Not until it is approved.
    expect(
      await call(world, OPERATOR, "catalog.feature", { listingId, position: 1 }),
    ).toMatchObject({ ok: false, code: "not_found" });
    await call(world, OPERATOR, "catalog.decide", { listingId, decision: "approve" });
    expect(
      await call(world, OPERATOR, "catalog.feature", { listingId, position: 2 }),
    ).toMatchObject({ ok: true, output: { position: 2 } });
    expect(world.listings.get(listingId)?.featuredPosition).toBe(2);
    await call(world, OPERATOR, "catalog.feature", { listingId, position: null });
    expect(world.listings.get(listingId)?.featuredPosition).toBeNull();
    expect(
      await call(world, OPERATOR, "catalog.feature", { listingId, position: 4 }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    expect(purgeTagsAfter("catalog.feature", { spaceId: "s", routeId: "r" })).toContain("catalog");
  });

  it("does not exist for anyone else", async () => {
    const world = worldWithOperator();
    const listingId = await requested(world);
    expect(
      await call(world, STAFF.owner, "catalog.feature", { listingId, position: 1 }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(
      await call(world, STAFF.owner, "application.decide", {
        applicationId: listingId,
        status: "invited",
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("enrollment.list (Platform STEP 4 §6.2)", () => {
  it("answers only with the actor's own, and says whether they teach", async () => {
    const world = testWorld();
    const mine = await call(world, "student-1", "enrollment.list", {});
    expect(mine).toMatchObject({
      ok: true,
      output: { teaches: false, enrollments: [{ routeId: ROUTE, lessonsPerModule: [0] }] },
    });
    expect(await call(world, STAFF.owner, "enrollment.list", {})).toMatchObject({
      ok: true,
      output: { teaches: true, enrollments: [] },
    });
  });
});

describe("space.create (Platform STEP 5 §1)", () => {
  const OWNER_ID = "0192d3a0-0000-7000-8000-0000000000c9";
  const input = (over: object = {}) => ({
    name: "Ana Prueba",
    slug: "ana-prueba",
    ownerEmail: "ana@example.com",
    locale: "es",
    ...over,
  });
  function world() {
    const made = worldWithOperator();
    made.accounts.set("ana@example.com", OWNER_ID);
    return made;
  }

  it("an operator makes a space, its owner a member, and the log keeps it", async () => {
    const made = world();
    const result = await call(made, OPERATOR, "space.create", input());
    expect(result).toMatchObject({ ok: true, output: { slug: "ana-prueba" } });
    const { spaceId } = (result as { output: { spaceId: string } }).output;
    expect(made.spaces.get(spaceId)).toMatchObject({
      slug: "ana-prueba",
      name: { es: "Ana Prueba" },
      defaultLocale: "es",
      locales: ["es"],
    });
    expect(made.members.get(`${spaceId}:${OWNER_ID}`)?.role).toBe("owner");
    const entry = made.log.find((row) => row.action === "space.create");
    expect(entry).toMatchObject({ spaceId, actorUserId: OPERATOR, outcome: "ok" });
    expect(JSON.stringify(entry)).not.toContain("ana@example.com");
  });

  it("does not exist for anyone else, and not through an agent or MCP", async () => {
    const made = world();
    for (const userId of [STAFF.owner, "a-stranger"]) {
      expect(await call(made, userId, "space.create", input())).toMatchObject({
        ok: false,
        code: "not_found",
      });
    }
    for (const via of ["agent", "mcp"] as const) {
      expect(await call(made, OPERATOR, "space.create", input(), via)).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    }
  });

  it("refuses an address the platform keeps, saying why", async () => {
    const result = await call(world(), OPERATOR, "space.create", input({ slug: "docs" }));
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(JSON.stringify(result)).toContain("keeps this address for itself");
  });

  it("refuses an address nobody has signed in with", async () => {
    const result = await call(
      world(),
      OPERATOR,
      "space.create",
      input({ ownerEmail: "nadie@example.com" }),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses a slug another space has", async () => {
    const made = world();
    await call(made, OPERATOR, "space.create", input());
    expect(await call(made, OPERATOR, "space.create", input())).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
});
