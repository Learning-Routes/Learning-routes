import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENT, ROUTE, SPACE, STAFF, testCtx, testWorld, type World } from "./test-ctx";

// Platform STEP 12 PR 1: a route's own accent colour, chosen by its creator, checked by the same
// rule as the space's brand colour. Without one, the route takes the space's.

const draftOf = (world: World) => world.drafts.get(ROUTE);

async function setAccent(world: World, accentColor: string | null) {
  return runAction(
    ACTIONS,
    "route.update",
    { routeId: ROUTE, expectedRevision: draftOf(world)?.revision ?? 0, accentColor },
    testCtx("ui", world, STAFF.owner),
  );
}

describe("route.update: the accent colour", () => {
  it("keeps a colour that passes checkBrandColor, in lower case", async () => {
    const world = testWorld();
    expect(await setAccent(world, "#6A2EA0")).toMatchObject({ ok: true });
    expect(draftOf(world)?.route.accentColor).toBe("#6a2ea0");
  });

  it("refuses what checkBrandColor refuses, and changes nothing", async () => {
    const world = testWorld();
    for (const color of ["#ffcc00", "red", "#12345"]) {
      expect(await setAccent(world, color)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(draftOf(world)?.route.accentColor ?? null).toBeNull();
  });

  it("clears it with null, so the route takes the space's colour again", async () => {
    const world = testWorld();
    await setAccent(world, "#6a2ea0");
    expect(await setAccent(world, null)).toMatchObject({ ok: true });
    expect(draftOf(world)?.route.accentColor).toBeNull();
  });
});

describe("lesson.read: the accent a student sees", () => {
  const read = (world: World) =>
    runAction(
      ACTIONS,
      "lesson.read",
      { enrollmentId: ENROLLMENT },
      testCtx("ui", world, "student-1"),
    );

  function withTopic(world: World, routeAccent: string | null, spaceBrand: string | null) {
    const version = world.versions.get(`${ROUTE}:1`);
    const space = world.spaces.get(SPACE);
    if (!(version && space)) {
      throw new Error("the world has no published route");
    }
    version.snapshot.route = { ...version.snapshot.route, accentColor: routeAccent };
    version.snapshot.lessons.push({
      id: "0192d3a0-0000-7000-8000-0000000000c1",
      moduleId: version.snapshot.modules[0]?.id ?? "",
      position: "V",
      title: { en: "A topic" },
    });
    world.spaces.set(SPACE, { ...space, brandColor: spaceBrand });
    return world;
  }

  it("is the version's own accent when the route has one", async () => {
    const answer = await read(withTopic(testWorld(), "#6a2ea0", "#0f766e"));
    expect(answer).toMatchObject({ ok: true, output: { accent: "#6a2ea0" } });
  });

  it("falls back to the space's brand colour, and to none", async () => {
    expect(await read(withTopic(testWorld(), null, "#0f766e"))).toMatchObject({
      ok: true,
      output: { accent: "#0f766e" },
    });
    expect(await read(withTopic(testWorld(), null, null))).toMatchObject({
      ok: true,
      output: { accent: null },
    });
  });
});
