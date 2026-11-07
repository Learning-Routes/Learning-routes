import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { redact } from "../../src/actions/redact";
import { ACTIONS } from "../../src/actions/registry";
import { SPACE_QUOTA_BYTES } from "../../src/content/creations";
import { ROUTE, SPACE, STAFF, testCtx, testWorld, type World } from "./test-ctx";

// creation.upload and asset.upload (Platform STEP 9 §2), on the in-memory twin.

const MODULE = "0192d3a0-0000-7000-8000-0000000000c1";
const LESSON = "0192d3a0-0000-7000-8000-0000000000c2";
const PIANO = "<!doctype html><title>Piano</title><script>new AudioContext()</script>";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function withLesson(): World {
  const world = testWorld();
  const draft = world.drafts.get(ROUTE);
  if (!draft) {
    throw new Error("the test world has its route");
  }
  draft.modules.push({ id: MODULE, position: "V", title: { es: "Uno" } });
  draft.lessons.push({
    id: LESSON,
    moduleId: MODULE,
    position: "V",
    title: { es: "Tema" },
    archived: false,
  });
  return world;
}

const upload = (world: World, extra: Record<string, unknown>, userId: string = STAFF.owner) =>
  runAction(
    ACTIONS,
    "creation.upload",
    { routeId: ROUTE, expectedRevision: 0, title: { es: "Piano" }, source: PIANO, ...extra },
    testCtx("mcp", world, userId),
  );

describe("creation.upload", () => {
  it("adds an interactive block naming the file by its hash, and the same file twice is one block", async () => {
    const world = withLesson();
    const first = await upload(world, { lessonId: LESSON });
    expect(first).toMatchObject({ ok: true, output: { repeated: false, revision: 1 } });
    const block = world.drafts.get(ROUTE)?.blocks.at(-1);
    expect(block).toMatchObject({ kind: "interactive", lessonId: LESSON });
    const hash = String(block?.data.creation);
    expect((first as { output: { key: string } }).output.key).toBe(
      `draft/${SPACE}/${ROUTE}/${hash}.html`,
    );
    const again = await upload(world, { lessonId: LESSON, expectedRevision: 1 });
    expect(again).toMatchObject({ ok: true, output: { repeated: true } });
    expect(world.drafts.get(ROUTE)?.blocks).toHaveLength(1);
    expect(world.files.size).toBe(1);
  });

  it("replaces a block's file and keeps the block, its place and what the creator wrote", async () => {
    const world = withLesson();
    await upload(world, { lessonId: LESSON, description: { es: "Toca" }, shape: "wide" });
    const blockId = String(world.drafts.get(ROUTE)?.blocks.at(-1)?.id);
    const before = world.drafts.get(ROUTE)?.blocks.at(-1)?.data.creation;
    const newer = `${PIANO}<p>v2</p>`;
    const answer = await upload(world, {
      blockId,
      expectedRevision: 1,
      title: undefined,
      source: newer,
    });
    expect(answer).toMatchObject({ ok: true, output: { blockId, lessonId: LESSON, revision: 2 } });
    const blocks = world.drafts.get(ROUTE)?.blocks ?? [];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.data).toMatchObject({
      title: { es: "Piano" },
      description: { es: "Toca" },
      shape: "wide",
    });
    expect(blocks[0]?.data.creation).not.toBe(before);
    expect((answer as { output: { key: string } }).output.key).toBe(
      `draft/${SPACE}/${ROUTE}/${blocks[0]?.data.creation}.html`,
    );
    expect(world.files.size).toBe(2);
    const same = await upload(world, { blockId, expectedRevision: 2, source: newer });
    expect(same).toMatchObject({ ok: true, output: { repeated: true, revision: 2 } });
  });

  it("replaces only an interactive block of this route, and names one block or one lesson", async () => {
    const world = withLesson();
    const stranger = "0192d3a0-0000-7000-8000-0000000000ff";
    expect(await upload(world, { blockId: stranger })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await upload(world, { blockId: stranger, lessonId: LESSON })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(await upload(world, { lessonId: LESSON, title: undefined })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("can make the lesson it goes in", async () => {
    const world = withLesson();
    const answer = await upload(world, { moduleId: MODULE, lessonTitle: { es: "Piano" } });
    expect(answer).toMatchObject({ ok: true, output: { revision: 2 } });
    expect(world.drafts.get(ROUTE)?.lessons).toHaveLength(2);
  });

  it("keeps the source as given, and says what it cannot do here", async () => {
    const world = withLesson();
    const source = `${PIANO}<script>fetch("https://example.com"); localStorage.x = 1</script>`;
    const answer = await upload(world, { lessonId: LESSON, source });
    const { limits } = (answer as { output: { limits: string[] } }).output;
    expect(limits.join(" ")).toContain("internet");
    expect(limits.join(" ")).toContain("navegador");
  });

  it("refuses a file over 2 MB, a missing place, a stale revision and anyone outside", async () => {
    const world = withLesson();
    const big = `<p>${"é".repeat(1_100_000)}</p>`;
    expect(await upload(world, { lessonId: LESSON, source: big })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(await upload(world, {})).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await upload(world, { lessonId: MODULE })).toMatchObject({ code: "not_found" });
    expect(await upload(world, { lessonId: LESSON, expectedRevision: 9 })).toMatchObject({
      code: "conflict",
    });
    expect(await upload(world, { lessonId: LESSON }, STAFF.assistant)).toMatchObject({
      code: "forbidden",
    });
    expect(await upload(world, { lessonId: LESSON }, "stranger")).toMatchObject({
      code: "not_found",
    });
    expect(world.files.size).toBe(0);
  });

  it("refuses past the space's quota", async () => {
    const world = withLesson();
    world.files.set(`${SPACE}:full`, {
      spaceId: SPACE,
      key: "full",
      kind: "asset",
      contentType: "image/png",
      bytes: SPACE_QUOTA_BYTES,
    });
    const answer = await upload(world, { lessonId: LESSON });
    expect(answer).toMatchObject({ ok: false, code: "invalid" });
    expect(world.drafts.get(ROUTE)?.blocks).toHaveLength(0);
  });

  it("is the only way an interactive block is made", async () => {
    const world = withLesson();
    const block = { type: "interactive", creation: "a".repeat(64) };
    const answer = await runAction(
      ACTIONS,
      "blocks.add",
      { routeId: ROUTE, expectedRevision: 0, lessonId: LESSON, blocks: [block] },
      testCtx("mcp", world, STAFF.owner),
    );
    expect(answer).toMatchObject({ ok: false, code: "invalid" });
  });

  it("publishing names the creations to copy", async () => {
    const world = withLesson();
    await upload(world, { lessonId: LESSON });
    const published = await runAction(
      ACTIONS,
      "route.publish",
      { routeId: ROUTE, expectedRevision: 1 },
      testCtx("mcp", world, STAFF.owner),
    );
    expect((published as { output: { creations: string[] } }).output.creations).toHaveLength(1);
  });
});

describe("asset.upload", () => {
  const send = (world: World, file: Uint8Array, userId: string = STAFF.owner) =>
    runAction(ACTIONS, "asset.upload", { spaceId: SPACE, file }, testCtx("mcp", world, userId));

  it("keeps a file by what its bytes are, once", async () => {
    const world = testWorld();
    const answer = await send(world, PNG);
    expect(answer).toMatchObject({
      ok: true,
      output: { contentType: "image/png", kind: "image", bytes: PNG.length },
    });
    expect((answer as { output: { key: string } }).output.key).toMatch(
      new RegExp(`^a/${SPACE}/[0-9a-f]{64}\\.png$`),
    );
    await send(world, PNG);
    expect(world.files.size).toBe(1);
  });

  it("refuses what it cannot name, and a member who cannot edit", async () => {
    const world = testWorld();
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(await send(world, html)).toMatchObject({ ok: false, code: "invalid" });
    expect(await send(world, PNG, STAFF.assistant)).toMatchObject({ code: "forbidden" });
    expect(world.files.size).toBe(0);
  });

  it("never logs the bytes", () => {
    expect(redact({ spaceId: SPACE, file: PNG })).toEqual({ spaceId: SPACE, file: "[redacted]" });
  });
});

describe("block.remove", () => {
  it("takes a block out of the draft, once, for an editor only", async () => {
    const world = withLesson();
    await upload(world, { lessonId: LESSON });
    const blockId = String(world.drafts.get(ROUTE)?.blocks.at(-1)?.id);
    const remove = (expectedRevision: number, userId: string) =>
      runAction(
        ACTIONS,
        "block.remove",
        { routeId: ROUTE, expectedRevision, blockId },
        testCtx("ui", world, userId),
      );
    expect(await remove(1, STAFF.assistant)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await remove(0, STAFF.owner)).toMatchObject({ ok: false, code: "conflict" });
    expect(await remove(1, STAFF.owner)).toMatchObject({ ok: true, output: { revision: 2 } });
    expect(world.drafts.get(ROUTE)?.blocks).toEqual([]);
    expect(await remove(2, STAFF.owner)).toMatchObject({ ok: false, code: "not_found" });
  });
});
