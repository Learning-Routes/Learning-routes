import { describe, expect, it } from "vitest";
import type { ActorKind } from "../../src/actions/actor";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { cleanText } from "../../src/community/text";
import { memoryTenancy, ROUTE, SPACE, testCtx, testWorld } from "./test-ctx";

// A route's community, as core decides it (Platform STEP 17). Who may see which row is row-level
// security's, and apps/api/test/db/community.test.ts holds it on Postgres; here, what the actions
// themselves refuse and keep.

const OWNER = "0192d3a0-0000-7000-8000-00000000c0a1";
const S1 = "0192d3a0-0000-7000-8000-00000000c0b1";
const S2 = "0192d3a0-0000-7000-8000-00000000c0b2";
const S3 = "0192d3a0-0000-7000-8000-00000000c0b3";
const S4 = "0192d3a0-0000-7000-8000-00000000c0b4";
const NOW = Date.UTC(2026, 10, 16, 12);
const IN_ROUTE = new Set(
  ["list", "post", "reply", "useful", "delete", "report", "pin", "answer", "hide"].map(
    (name) => `community.${name}`,
  ),
);
const tenancy = memoryTenancy({
  rows: { [`route:${ROUTE}`]: SPACE },
  roles: {
    [`${SPACE}:${OWNER}`]: "owner",
    [`${SPACE}:${S1}`]: "student",
    [`${SPACE}:${S2}`]: "student",
    [`${SPACE}:${S3}`]: "student",
    [`${SPACE}:${S4}`]: "student",
  },
});

function community() {
  const world = testWorld();
  world.community.readers.set(ROUTE, new Set([S1, S2, S3, S4]));
  world.community.creators.set(ROUTE, new Set([OWNER]));
  for (const [userId, role] of [
    [OWNER, "owner"],
    [S1, "student"],
    [S2, "student"],
    [S3, "student"],
    [S4, "student"],
  ] as const) {
    world.members.set(`${SPACE}:${userId}`, { spaceId: SPACE, userId, role });
  }
  let now = NOW;
  const as = (userId: string, name = "Ana Prueba", via: ActorKind = "ui") => {
    const ctx = testCtx(via, world, userId, { tenancy, now });
    ctx.actor.name = name;
    return (action: string, input: object) =>
      runAction(ACTIONS, action, IN_ROUTE.has(action) ? { routeId: ROUTE, ...input } : input, ctx);
  };
  return { world, as, later: (ms: number) => (now += ms) };
}

const output = <T>(result: { ok: boolean }) => (result as { ok: true; output: T }).output;
const post = { kind: "question", body: "¿Cómo se dice «gracias»?" };

describe("writing in a route's community", () => {
  it("keeps the text as written, without control characters or direction marks", async () => {
    const { as } = community();
    const result = await as(S1)("community.post", {
      kind: "note",
      body: "  hola\u0000 ‮mundo\r\nadiós\t \u0007 ",
    });
    expect(output<{ body: string }>(result).body).toBe("hola mundo\nadiós");
    expect(cleanText("<script>x</script>")).toBe("<script>x</script>");
  });

  it("takes 1 to 2,000 characters, once cleaned", async () => {
    const { as } = community();
    const write = as(S1);
    expect(await write("community.post", { kind: "win", body: "\u0000 \u0001" })).toMatchObject({
      code: "invalid_input",
    });
    expect(await write("community.post", { kind: "win", body: "a".repeat(2_001) })).toMatchObject({
      code: "invalid_input",
    });
    expect(await write("community.post", { kind: "win", body: "a".repeat(2_000) })).toMatchObject({
      ok: true,
    });
    expect(await write("community.post", { kind: "rant", body: "a" })).toMatchObject({
      code: "invalid_input",
    });
  });

  it("shows a name, never an address", async () => {
    const { as } = community();
    const byName = output<{ authorName: string }>(await as(S1)("community.post", post));
    expect(byName.authorName).toBe("Ana Prueba");
    const byAddress = await as(S2, "ana@example.com")("community.post", post);
    expect(output<{ authorName: string }>(byAddress).authorName).toBe("");
  });

  it("answers not_found to anyone with no place in the route, and comes only through the app", async () => {
    const { as } = community();
    expect(await as("stranger")("community.list", {})).toMatchObject({ code: "not_found" });
    expect(await as("stranger")("community.post", post)).toMatchObject({ code: "not_found" });
    expect(await as(S1, "Ana", "mcp")("community.post", post)).toMatchObject({
      code: "forbidden",
    });
  });
});

describe("the community's limits", () => {
  it("takes ten posts an hour per person, then says so with rate_limited", async () => {
    const { as, later } = community();
    const write = as(S1);
    for (let n = 0; n < 10; n += 1) {
      expect(await write("community.post", post)).toMatchObject({ ok: true });
    }
    expect(await write("community.post", post)).toMatchObject({ code: "rate_limited" });
    later(3_600_001);
    expect(await as(S1)("community.post", post)).toMatchObject({ ok: true });
  });

  it("takes thirty replies an hour, and five reports", async () => {
    const { as } = community();
    const target = output<{ id: string }>(await as(S2)("community.post", post));
    const write = as(S1);
    for (let n = 0; n < 30; n += 1) {
      expect(await write("community.reply", { postId: target.id, body: `sí ${n}` })).toMatchObject({
        ok: true,
      });
    }
    expect(await write("community.reply", { postId: target.id, body: "otra" })).toMatchObject({
      code: "rate_limited",
    });

    const own = as(S2);
    const posts = [];
    for (let n = 0; n < 6; n += 1) {
      posts.push(output<{ id: string }>(await own("community.post", post)).id);
    }
    const report = as(S3);
    for (const id of posts.slice(0, 5)) {
      expect(await report("community.report", { postId: id, reason: "spam" })).toMatchObject({
        ok: true,
      });
    }
    expect(await report("community.report", { postId: posts[5], reason: "spam" })).toMatchObject({
      code: "rate_limited",
    });
  });
});

describe("replies, blocks and deleting", () => {
  it("are one level deep", async () => {
    const { as } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    const reply = output<{ id: string }>(
      await as(S2)("community.reply", { postId: top.id, body: "Obrigado." }),
    );
    expect(await as(S1)("community.reply", { postId: reply.id, body: "x" })).toMatchObject({
      code: "not_found",
    });
  });

  it("a blocked person stops being seen, and cannot reply to the one who blocked them", async () => {
    const { as, world } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    await as(S2)("community.post", { kind: "note", body: "de student-2" });
    expect(await as(S1)("community.block", { userId: S2, blocked: true })).toMatchObject({
      ok: true,
    });
    expect(await as(S2)("community.reply", { postId: top.id, body: "hola" })).toMatchObject({
      code: "not_found",
    });
    const seen = output<{ items: { authorId: string }[] }>(await as(S1)("community.list", {}));
    expect(seen.items.map((item) => item.authorId)).toEqual([S1]);
    expect(world.community.blocks.size).toBe(1);
  });

  it("a deleted post keeps its replies, and says who wrote it no more", async () => {
    const { as } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    await as(S2)("community.reply", { postId: top.id, body: "Obrigado." });
    expect(await as(S2)("community.delete", { postId: top.id })).toMatchObject({
      code: "not_found",
    });
    expect(await as(S1)("community.delete", { postId: top.id })).toMatchObject({
      ok: true,
    });
    const [item] = output<{
      items: { body: string | null; authorName: string; replies: unknown[] }[];
    }>(await as(S3)("community.list", {})).items;
    expect(item).toMatchObject({ body: null, authorName: "", isDeleted: true });
    expect(item?.replies).toHaveLength(1);
  });
});

describe("looking after a community", () => {
  it("pinning, answering and hiding are a creator's: a learner hears creator_required", async () => {
    const { as } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    const reply = output<{ id: string }>(
      await as(S2)("community.reply", { postId: top.id, body: "Obrigado." }),
    );
    expect(await as(S1)("community.pin", { postId: top.id, pinned: true })).toMatchObject({
      code: "creator_required",
    });
    expect(await as(OWNER)("community.pin", { postId: top.id, pinned: true })).toMatchObject({
      ok: true,
    });
    expect(await as(OWNER)("community.answer", { replyId: reply.id, answer: true })).toMatchObject({
      ok: true,
    });
    expect(await as(OWNER)("community.answer", { replyId: top.id, answer: true })).toMatchObject({
      code: "invalid",
    });
    const kinds = output<{ items: { kind: string }[] }>(await as(S1)("notification.list", {}));
    expect(kinds.items.map((n) => n.kind).sort()).toEqual(["pinned", "reply"]);
    const answered = output<{ items: { kind: string }[] }>(await as(S2)("notification.list", {}));
    expect(answered.items.map((n) => n.kind)).toEqual(["answer"]);
  });

  it("a hidden item stays visible to its author and the creators, marked hidden", async () => {
    const { as } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    await as(OWNER)("community.hide", { postId: top.id, hidden: true });
    const list = async (who: string) =>
      output<{ items: { isHidden: boolean }[] }>(await as(who)("community.list", {})).items;
    expect(await list(S1)).toMatchObject([{ isHidden: true }]);
    expect(await list(OWNER)).toMatchObject([{ isHidden: true }]);
    expect(await list(S2)).toEqual([]);
  });

  it("three people's open reports hide an item until it is reviewed; one person counts once", async () => {
    const { as } = community();
    const top = output<{ id: string }>(await as(S1)("community.post", post));
    const report = (who: string) =>
      as(who)("community.report", { postId: top.id, reason: "abuse" });
    await report(S2);
    expect(await report(S2)).toMatchObject({ code: "conflict" });
    await report(S3);
    const seen = async () => output<{ items: unknown[] }>(await as(S4)("community.list", {})).items;
    expect(await seen()).toHaveLength(1);
    await report(S4);
    expect(await seen()).toEqual([]);
    expect(await as(S1)("community.report", { postId: top.id, reason: "spam" })).toMatchObject({
      code: "not_found",
    });
  });
});

describe("a learner's milestones", () => {
  it("are off until they turn sharing on", async () => {
    const { as } = community();
    expect(output<{ sharesMilestones: boolean }>(await as(S1)("profile.get", {}))).toEqual({
      displayName: null,
      sharesMilestones: false,
    });
    expect(
      await as(S1)("profile.update", { sharesMilestones: true, displayName: "a@b.c" }),
    ).toMatchObject({ code: "invalid_input" });
    expect(
      output(await as(S1)("profile.update", { sharesMilestones: true, displayName: "Ana" })),
    ).toEqual({ displayName: "Ana", sharesMilestones: true });
  });
});
