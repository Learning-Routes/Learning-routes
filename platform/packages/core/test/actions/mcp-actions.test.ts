import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ROUTE, SPACE, STAFF, testCtx, testWorld, type World } from "./test-ctx";

// The actions the MCP's tools needed (Platform STEP 5 §3), for the app and the MCP alike.

const draftOf = (world: World) => {
  const row = world.drafts.get(ROUTE);
  if (!row) {
    throw new Error("the world has no draft");
  }
  return row;
};

async function aLesson(world: World) {
  const via = testCtx("mcp", world, STAFF.owner);
  const revision = draftOf(world).revision;
  const module = await runAction(
    ACTIONS,
    "module.add",
    { routeId: ROUTE, expectedRevision: revision, title: { es: "M" } },
    via,
  );
  if (!module.ok) {
    throw new Error("no module");
  }
  const { id: moduleId, revision: next } = module.output as { id: string; revision: number };
  const lesson = await runAction(
    ACTIONS,
    "lesson.add",
    { routeId: ROUTE, expectedRevision: next, moduleId, title: { es: "L" } },
    via,
  );
  return lesson.ok ? (lesson.output as { id: string; revision: number }) : Promise.reject(lesson);
}

describe("space.list", () => {
  it("shows the spaces one teaches in, and nothing to someone who only studies", async () => {
    const world = testWorld();
    const staff = await runAction(
      ACTIONS,
      "space.list",
      {},
      testCtx("mcp", world, STAFF.assistant),
    );
    expect(staff).toMatchObject({ ok: true, output: [{ id: SPACE, role: "assistant" }] });
    const student = await runAction(ACTIONS, "space.list", {}, testCtx("mcp", world, "student-1"));
    expect(student).toEqual({ ok: true, output: [] });
  });
});

describe("route.update", () => {
  it("changes the details and moves the revision, for an editor through the MCP", async () => {
    const world = testWorld();
    const before = draftOf(world).revision;
    const result = await runAction(
      ACTIONS,
      "route.update",
      { routeId: ROUTE, expectedRevision: before, title: { es: "Otra" }, level: "intermedio" },
      testCtx("mcp", world, STAFF.coeditor),
    );
    expect(result).toMatchObject({ ok: true, output: { revision: before + 1 } });
    expect(draftOf(world).route.title).toEqual({ es: "Otra" });
  });

  it("refuses a stale revision, an empty change and a price", async () => {
    const world = testWorld();
    const ctx = testCtx("mcp", world, STAFF.owner);
    const expectedRevision = draftOf(world).revision;
    const stale = await runAction(
      ACTIONS,
      "route.update",
      { routeId: ROUTE, expectedRevision: expectedRevision + 5, title: { es: "Otra" } },
      ctx,
    );
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    const empty = await runAction(
      ACTIONS,
      "route.update",
      { routeId: ROUTE, expectedRevision },
      ctx,
    );
    expect(empty).toMatchObject({ ok: false, code: "invalid_input" });
    const price = await runAction(
      ACTIONS,
      "route.update",
      { routeId: ROUTE, expectedRevision, priceMinor: 100 },
      ctx,
    );
    expect(price).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("is refused to an assistant", async () => {
    const world = testWorld();
    const result = await runAction(
      ACTIONS,
      "route.update",
      { routeId: ROUTE, expectedRevision: draftOf(world).revision, title: { es: "Otra" } },
      testCtx("mcp", world, STAFF.assistant),
    );
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("blocks.add", () => {
  it("adds them in order and moves the revision once for each", async () => {
    const world = testWorld();
    const lesson = await aLesson(world);
    const result = await runAction(
      ACTIONS,
      "blocks.add",
      {
        routeId: ROUTE,
        expectedRevision: lesson.revision,
        lessonId: lesson.id,
        blocks: [
          { type: "concept", body: { es: "Uno" } },
          { type: "tip", body: { es: "Dos" } },
        ],
      },
      testCtx("mcp", world, STAFF.owner),
    );
    expect(result).toMatchObject({ ok: true, output: { revision: lesson.revision + 2 } });
    const added = draftOf(world).blocks.filter((block) => block.lessonId === lesson.id);
    expect(added.map((block) => block.kind)).toEqual(["concept", "tip"]);
  });

  it("writes none when one is not a block, or the lesson is not there", async () => {
    const world = testWorld();
    const lesson = await aLesson(world);
    const ctx = testCtx("mcp", world, STAFF.owner);
    const before = draftOf(world).blocks.length;
    const bad = await runAction(
      ACTIONS,
      "blocks.add",
      {
        routeId: ROUTE,
        expectedRevision: lesson.revision,
        lessonId: lesson.id,
        blocks: [{ type: "concept", body: { es: "Uno" } }, { type: "nada" }],
      },
      ctx,
    );
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const nowhere = await runAction(
      ACTIONS,
      "blocks.add",
      {
        routeId: ROUTE,
        expectedRevision: lesson.revision,
        lessonId: SPACE,
        blocks: [{ type: "concept", body: { es: "Uno" } }],
      },
      ctx,
    );
    expect(nowhere).toMatchObject({ ok: false, code: "not_found" });
    expect(draftOf(world).blocks).toHaveLength(before);
  });
});
