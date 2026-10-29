import { describe, expect, it } from "vitest";
import type { ActorKind } from "../../src/actions/actor";
import { type ActionResult, runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENTS, ROUTE, SPACE, STAFF, testCtx, testWorld, type World } from "./test-ctx";

// The first actions on real data (Platform STEP 2 §6), on the repositories'
// in-memory twin; the API runs them on Postgres in the two-tenant test.

const HASH = /^[0-9a-f]{64}$/;
const call = (world: World, userId: string, name: string, input: unknown, via: ActorKind = "ui") =>
  runAction(ACTIONS, name, input, testCtx(via, world, userId));
const output = <T>(result: ActionResult): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  }
  return result.output as T;
};
const NEW_USER = "0192d3a0-0000-7000-8000-0000000000f1";

describe("space.get", () => {
  it("shows the space to any member", async () => {
    const world = testWorld();
    for (const userId of [STAFF.owner, "student-1"]) {
      expect(await call(world, userId, "space.get", { spaceId: SPACE })).toMatchObject({
        ok: true,
        output: { id: SPACE },
      });
    }
  });
});

describe("membership.add", () => {
  it("lets an owner add an existing user, from the app only", async () => {
    const world = testWorld();
    expect(
      await call(
        world,
        STAFF.owner,
        "membership.add",
        { spaceId: SPACE, userId: NEW_USER, role: "coeditor" },
        "agent",
      ),
    ).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(
      await call(world, STAFF.owner, "membership.add", {
        spaceId: SPACE,
        userId: NEW_USER,
        role: "coeditor",
      }),
    ).toEqual({
      ok: true,
      output: { userId: NEW_USER, role: "coeditor" },
    });
    expect(
      await call(world, STAFF.owner, "membership.add", {
        spaceId: SPACE,
        userId: NEW_USER,
        role: "student",
      }),
    ).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });

  it("refuses everyone but an owner", async () => {
    const world = testWorld();
    for (const userId of [STAFF.coeditor, STAFF.assistant, "student-1"]) {
      const input = { spaceId: SPACE, userId: NEW_USER, role: "student" };
      expect(await call(world, userId, "membership.add", input)).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    }
  });
});

describe("route.create, route.get and route.list", () => {
  const route = (slug: string, pricing = "free") => ({
    spaceId: SPACE,
    slug,
    title: { en: "New route" },
    sourceLocale: "en",
    access: "open",
    pricing,
  });

  it("creates a draft at revision 0, which staff list and read", async () => {
    const world = testWorld();
    const { routeId, revision } = output<{ routeId: string; revision: number }>(
      await call(world, STAFF.coeditor, "route.create", route("new-route"), "agent"),
    );
    expect(revision).toBe(0);
    expect(
      output<{ slug: string }[]>(
        await call(world, STAFF.assistant, "route.list", { spaceId: SPACE }),
      ).map((entry) => entry.slug),
    ).toEqual(["first-route", "new-route"]);
    expect(await call(world, STAFF.assistant, "route.get", { routeId })).toMatchObject({
      ok: true,
      output: { revision: 0 },
    });
  });

  it("sets a price only from the app, refuses a taken slug, and keeps drafts from students", async () => {
    const world = testWorld();
    expect(
      await call(world, STAFF.coeditor, "route.create", route("paid", "paid"), "agent"),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(await call(world, STAFF.coeditor, "route.create", route("paid", "paid"))).toMatchObject({
      ok: true,
    });
    expect(await call(world, STAFF.owner, "route.create", route("paid"))).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await call(world, "student-1", "route.create", route("mine"))).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(await call(world, "student-1", "route.get", { routeId: ROUTE })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("refuses a title without the source locale", async () => {
    const world = testWorld();
    const bad = { ...route("no-source"), title: { es: "Ruta" } };
    expect(await call(world, STAFF.owner, "route.create", bad)).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });
});

describe("module.add, lesson.add and block.add", () => {
  it("adds content in order, each edit on the revision it read", async () => {
    const world = testWorld();
    const first = output<{ id: string; revision: number }>(
      await call(world, STAFF.coeditor, "module.add", {
        routeId: ROUTE,
        expectedRevision: 0,
        title: { en: "Two" },
      }),
    );
    // Before the first one.
    const before = output<{ id: string; revision: number }>(
      await call(world, STAFF.coeditor, "module.add", {
        routeId: ROUTE,
        expectedRevision: 1,
        title: { en: "One" },
        after: null,
      }),
    );
    expect(
      await call(world, STAFF.coeditor, "module.add", {
        routeId: ROUTE,
        expectedRevision: 1,
        title: { en: "Late" },
      }),
    ).toMatchObject({
      ok: false,
      code: "conflict",
    });
    const lesson = output<{ id: string; revision: number }>(
      await call(world, STAFF.owner, "lesson.add", {
        routeId: ROUTE,
        moduleId: first.id,
        expectedRevision: 2,
        title: { en: "L" },
      }),
    );
    const block = await call(world, STAFF.owner, "block.add", {
      routeId: ROUTE,
      lessonId: lesson.id,
      expectedRevision: lesson.revision,
      block: { type: "concept", title: { en: "Idea" }, body: { en: "Text" } },
    });
    expect(block).toMatchObject({ ok: true, output: { revision: 4 } });
    const draft = output<{ modules: { id: string }[]; blocks: { kind: string }[] }>(
      await call(world, STAFF.owner, "route.get", { routeId: ROUTE }),
    );
    expect(draft.modules.map((entry) => entry.id)).toEqual([before.id, first.id]);
    expect(draft.blocks.map((entry) => entry.kind)).toEqual(["concept"]);
  });

  it("refuses a block core's schema refuses, and a parent the draft lacks", async () => {
    const world = testWorld();
    const bad = {
      routeId: ROUTE,
      lessonId: ENROLLMENTS["student-1"],
      expectedRevision: 0,
      block: { type: "concept" },
    };
    expect(await call(world, STAFF.owner, "block.add", bad)).toMatchObject({
      ok: false,
      code: "invalid",
    });
    const orphan = {
      routeId: ROUTE,
      moduleId: ENROLLMENTS["student-1"],
      expectedRevision: 0,
      title: { en: "L" },
    };
    expect(await call(world, STAFF.owner, "lesson.add", orphan)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });
});

describe("route.publish", () => {
  it("freezes the draft as the next version, with its format and hash", async () => {
    const world = testWorld();
    output(
      await call(world, STAFF.owner, "module.add", {
        routeId: ROUTE,
        expectedRevision: 0,
        title: { en: "M" },
      }),
    );
    const published = output<{ version: number; contentHash: string }>(
      await call(world, STAFF.coeditor, "route.publish", { routeId: ROUTE, expectedRevision: 1 }),
    );
    expect(published.version).toBe(2);
    expect(published.contentHash).toMatch(HASH);
    expect(world.drafts.get(ROUTE)?.latestPublishedVersion).toBe(2);
    expect(world.versions.get(`${ROUTE}:2`)?.snapshot.modules).toHaveLength(1);
    expect(
      await call(world, STAFF.coeditor, "route.publish", { routeId: ROUTE, expectedRevision: 0 }),
    ).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
});

describe("enrollment.create and enrollment.upgrade", () => {
  it("makes a stranger a student of a free, open route, logged in its space", async () => {
    const world = testWorld();
    const enrolled = output<{ enrollmentId: string; spaceId: string }>(
      await call(world, "stranger", "enrollment.create", { routeId: ROUTE }),
    );
    expect(enrolled.spaceId).toBe(SPACE);
    expect(world.members.get(`${SPACE}:stranger`)?.role).toBe("student");
    expect(world.log.at(-1)).toMatchObject({
      spaceId: SPACE,
      actorUserId: "stranger",
      action: "enrollment.create",
      outcome: "ok",
    });
    expect(
      await call(world, "stranger", "enrollment.create", {
        routeId: "0192d3a0-0000-7000-8000-0000000000ff",
      }),
    ).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("upgrades the student's own enrollment to the latest version, and nobody else's", async () => {
    const world = testWorld();
    output(
      await call(world, STAFF.owner, "route.publish", { routeId: ROUTE, expectedRevision: 0 }),
    );
    const enrollmentId = ENROLLMENTS["student-1"];
    expect(await call(world, "student-2", "enrollment.upgrade", { enrollmentId })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await call(world, "student-1", "enrollment.upgrade", { enrollmentId })).toEqual({
      ok: true,
      output: { pinnedVersion: 2 },
    });
    expect(world.enrollments.get(enrollmentId as string)?.pinnedVersion).toBe(2);
  });
});
