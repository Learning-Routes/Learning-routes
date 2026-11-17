import { describe, expect, it } from "vitest";
import { milestoneAfter } from "../../src/actions/community-milestone";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import type { Snapshot } from "../../src/content/snapshot";
import { memoryTenancy, ROUTE, SPACE, testCtx, testWorld } from "./test-ctx";

// One's own side of the community, the operator's review, a post's topic and milestones
// (Platform STEP 17), as core decides them. The fences: apps/api/test/db/community.test.ts.

const ANA = "0192d3a0-0000-7000-8000-00000000d0b1";
const BETO = "0192d3a0-0000-7000-8000-00000000d0b2";
const OPERATOR = "0192d3a0-0000-7000-8000-00000000d0f1";
const LESSON = "0192d3a0-0000-7000-8000-00000000d0c1";
const MODULE = "0192d3a0-0000-7000-8000-0000000000a1";

function community() {
  const world = testWorld();
  world.community.readers.set(ROUTE, new Set([ANA, BETO]));
  world.community.liveSpaces.add(SPACE);
  world.operators.add(OPERATOR);
  for (const userId of [ANA, BETO]) {
    world.members.set(`${SPACE}:${userId}`, { spaceId: SPACE, userId, role: "student" });
  }
  const base = memoryTenancy({
    rows: { [`route:${ROUTE}`]: SPACE },
    roles: { [`${SPACE}:${ANA}`]: "student", [`${SPACE}:${BETO}`]: "student" },
  });
  const tenancy = { ...base, isOperator: async (userId: string) => userId === OPERATOR };
  const as = (userId: string) => {
    const ctx = testCtx("ui", world, userId, { tenancy });
    return (action: string, input: object) => runAction(ACTIONS, action, input, ctx);
  };
  return { world, as, ctx: (userId: string) => testCtx("ui", world, userId, { tenancy }) };
}

const output = <T>(result: unknown) => (result as { output: T }).output;
const note = { routeId: ROUTE, kind: "note", body: "Una nota" };

describe("one's own account in the community", () => {
  it("follows a live space, and nothing else", async () => {
    const { as } = community();
    expect(await as(ANA)("community.follow", { spaceId: SPACE, follow: true })).toMatchObject({
      ok: true,
      output: { space: SPACE, follow: true },
    });
    expect(
      await as(ANA)("community.follow", { spaceId: crypto.randomUUID(), follow: true }),
    ).toMatchObject({ code: "not_found" });
    expect(await as(ANA)("community.follow", { spaceId: SPACE, follow: false })).toMatchObject({
      ok: true,
    });
  });

  it("blocks someone else, never oneself, and can unblock", async () => {
    const { as, world } = community();
    expect(await as(ANA)("community.block", { userId: ANA, blocked: true })).toMatchObject({
      code: "invalid",
    });
    await as(ANA)("community.block", { userId: BETO, blocked: true });
    await as(ANA)("community.block", { userId: BETO, blocked: false });
    expect(world.community.blocks.size).toBe(0);
  });

  it("reads a feed of the routes one is in, newest first, a page at a time", async () => {
    const { as } = community();
    for (const body of ["uno", "dos", "tres"]) {
      await as(BETO)("community.post", { ...note, body });
    }
    const first = output<{ items: { body: string }[]; next: unknown }>(
      await as(ANA)("community.feed", { limit: 2 }),
    );
    expect(first.items).toHaveLength(2);
    expect(first.next).not.toBeNull();
    const rest = output<{ items: unknown[]; next: unknown }>(
      await as(ANA)("community.feed", { before: first.next, limit: 2 }),
    );
    expect(rest).toMatchObject({ items: [{}], next: null });
  });

  it("marks the notifications named, or all of them", async () => {
    const { as } = community();
    const post = output<{ id: string }>(await as(ANA)("community.post", note));
    for (const body of ["sí", "no"]) {
      await as(BETO)("community.reply", { routeId: ROUTE, postId: post.id, body });
    }
    const listed = output<{ items: { id: string }[]; unread: number }>(
      await as(ANA)("notification.list", {}),
    );
    expect(listed.unread).toBe(2);
    expect(await as(ANA)("notification.read", { ids: [listed.items[0]?.id] })).toMatchObject({
      output: { read: [listed.items[0]?.id] },
    });
    expect(output<{ unread: number }>(await as(ANA)("notification.list", {})).unread).toBe(1);
    expect(await as(ANA)("notification.read", {})).toMatchObject({ output: { read: "all" } });
    expect(output<{ unread: number }>(await as(ANA)("notification.list", {})).unread).toBe(0);
  });

  it("changes one setting of the profile at a time, and asks for at least one", async () => {
    const { as } = community();
    expect(await as(ANA)("profile.update", {})).toMatchObject({ code: "invalid_input" });
    await as(ANA)("profile.update", { displayName: "Ana" });
    expect(output(await as(ANA)("profile.update", { sharesMilestones: true }))).toEqual({
      displayName: "Ana",
      sharesMilestones: true,
    });
    expect(output(await as(ANA)("profile.update", { displayName: "" }))).toEqual({
      displayName: null,
      sharesMilestones: true,
    });
  });

  it("marks a post useful once per person, and takes the mark back", async () => {
    const { as } = community();
    const post = output<{ id: string }>(await as(ANA)("community.post", note));
    const mark = (on: boolean) =>
      as(BETO)("community.useful", { routeId: ROUTE, postId: post.id, on });
    await mark(true);
    await mark(true);
    const seen = async () =>
      output<{ items: { usefulCount: number }[] }>(
        await as(ANA)("community.list", { routeId: ROUTE }),
      ).items[0]?.usefulCount;
    expect(await seen()).toBe(1);
    await mark(false);
    expect(await seen()).toBe(0);
    expect(
      await as(BETO)("community.useful", { routeId: ROUTE, postId: crypto.randomUUID(), on: true }),
    ).toMatchObject({ code: "not_found" });
  });
});

describe("a post's topic", () => {
  it("is a lesson of the route's published version, or the post is refused", async () => {
    const { as, world } = community();
    expect(await as(ANA)("community.post", { ...note, lessonId: LESSON })).toMatchObject({
      code: "not_found",
    });
    const version = world.versions.get(`${ROUTE}:1`);
    version?.snapshot.lessons.push({
      id: LESSON,
      moduleId: MODULE,
      position: "V",
      title: { en: "L" },
    });
    expect(await as(ANA)("community.post", { ...note, lessonId: LESSON })).toMatchObject({
      ok: true,
      output: { lessonId: LESSON },
    });
  });
});

describe("the operator's review", () => {
  it("is the operator's alone, and a ban stops the author writing", async () => {
    const { as, world } = community();
    const post = output<{ id: string }>(await as(ANA)("community.post", note));
    expect(await as(ANA)("community.reports", {})).toMatchObject({ code: "not_found" });
    expect(output(await as(OPERATOR)("community.reports", {}))).toEqual([]);
    expect(
      await as(OPERATOR)("community.moderate", { postId: crypto.randomUUID(), decision: "hide" }),
    ).toMatchObject({ code: "not_found" });
    expect(
      await as(OPERATOR)("community.moderate", { postId: post.id, decision: "ban" }),
    ).toMatchObject({ ok: true });
    expect(world.community.bans.has(ANA)).toBe(true);
    expect(await as(ANA)("community.post", note)).toMatchObject({ code: "forbidden" });
    expect(
      await as(OPERATOR)("community.moderate", { postId: post.id, decision: "restore" }),
    ).toMatchObject({ ok: true });
  });
});

describe("a milestone", () => {
  const snapshot = {
    modules: [
      { id: "m2", position: "W", title: { en: "Two" } },
      { id: "m1", position: "V", title: { en: "One" } },
    ],
    lessons: [
      { id: "l1", moduleId: "m2", position: "V", title: { en: "A" } },
      { id: "l2", moduleId: "m2", position: "W", title: { en: "B" } },
    ],
  } as unknown as Snapshot;
  const done = (lessonId: string) => ({
    enrollmentId: "e",
    lessonId,
    status: "completed" as const,
    completedAt: 1,
    blocks: [],
  });

  it("is posted when a module's last topic is finished, numbered as the route shows it", async () => {
    const { ctx, world } = community();
    const anaCtx = ctx(ANA);
    await anaCtx.repos.community.setProfile(ANA, { sharesMilestones: true });
    const place = { spaceId: SPACE, routeId: ROUTE, snapshot };
    await milestoneAfter(anaCtx, anaCtx.repos, place, "l1", []);
    expect(world.community.items.size).toBe(0);
    await milestoneAfter(anaCtx, anaCtx.repos, place, "l2", [done("l1")]);
    expect([...world.community.items.values()]).toMatchObject([
      { kind: "milestone", moduleNumber: 2, body: null },
    ]);
  });

  it("is not posted while sharing is off, nor for a topic the route does not have", async () => {
    const { ctx, world } = community();
    const anaCtx = ctx(ANA);
    const place = { spaceId: SPACE, routeId: ROUTE, snapshot };
    await milestoneAfter(anaCtx, anaCtx.repos, place, "l2", [done("l1")]);
    await anaCtx.repos.community.setProfile(ANA, { sharesMilestones: true });
    await milestoneAfter(anaCtx, anaCtx.repos, place, "nope", []);
    expect(world.community.items.size).toBe(0);
  });
});
