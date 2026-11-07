import { describe, expect, it } from "vitest";
import { signatureOf, withFrames } from "../src/frames";

const SECRET = "test-only-content-secret-0123456789abcdef";
const ENV = { CONTENT_ORIGIN: "https://content.example.test", CONTENT_SIGNING_SECRET: SECRET };
const NOW = 1_800_000_000;
const ID = "0192d3a0-0000-7000-8000-000000000001";
const DRAFT = `/d/${ID}/${ID}/${"a".repeat(64)}.html`;
const PUBLISHED = `/p/${ID}/${ID}/${"a".repeat(64)}.html`;

describe("a lesson's frames", () => {
  it("signs as the content host checks: the vector apps/content/test/content.test.ts holds", async () => {
    expect(await signatureOf(SECRET, "/d/x", NOW)).toBe(
      "Jk2OoF0SYoRh9OvAqE8qiDv-PAAjZ7_359ZnleZCSnI",
    );
  });

  it("signs a draft's frame for half an hour, and leaves a published one plain", async () => {
    const output = { view: { blocks: [{ frame: DRAFT }, { frame: PUBLISHED }, {}] } };
    await withFrames(ENV, "route.preview", output, NOW);
    const expires = NOW + 1800;
    expect(output.view.blocks).toEqual([
      {
        frame: `${ENV.CONTENT_ORIGIN}${DRAFT}?e=${expires}&s=${await signatureOf(SECRET, DRAFT, expires)}`,
      },
      { frame: `${ENV.CONTENT_ORIGIN}${PUBLISHED}` },
      {},
    ]);
  });

  it("reads a student's lesson, and touches no other action's answer", async () => {
    const lesson = { blocks: [{ frame: PUBLISHED }] };
    await withFrames(ENV, "lesson.read", lesson, NOW);
    expect(lesson.blocks[0]?.frame).toBe(`${ENV.CONTENT_ORIGIN}${PUBLISHED}`);
    const other = { blocks: [{ frame: DRAFT }] };
    await withFrames(ENV, "route.get", other, NOW);
    expect(other.blocks[0]?.frame).toBe(DRAFT);
    await withFrames(ENV, "route.preview", { view: null }, NOW);
  });

  it("signs nothing but a creation's own path", async () => {
    const odd = { view: { blocks: [{ frame: `/d/${ID}/../x.html` }, { frame: "/d/x" }] } };
    await withFrames(ENV, "route.preview", odd, NOW);
    expect(odd.view.blocks).toEqual([{}, {}]);
  });
});
