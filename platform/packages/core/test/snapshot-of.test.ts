import { describe, expect, it } from "vitest";
import { snapshotOf } from "../src/content/snapshot";

describe("snapshotOf: a draft's content, as a version stores it", () => {
  it("keeps the content and its ids, and drops the draft's own fields", () => {
    const content = {
      route: {
        id: "0192d3a0-0000-7000-8000-000000000001",
        slug: "r",
        title: { en: "R" },
        description: null,
        sourceLocale: "en" as const,
        access: "open" as const,
        pricing: "free" as const,
      },
      modules: [],
      lessons: [],
      prerequisites: [],
      blocks: [],
    };
    const draft = { ...content, spaceId: "s", revision: 4, latestPublishedVersion: null };
    expect(snapshotOf(draft)).toEqual(content);
  });
});
