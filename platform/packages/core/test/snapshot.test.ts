import { describe, expect, it } from "vitest";
import { SNAPSHOT_FORMAT, upcastSnapshot } from "../src/content/snapshot";

const ROUTE_ID = "0190f3a0-0000-7000-8000-000000000001";
const MODULE_ID = "0190f3a0-0000-7000-8000-000000000002";
const LESSON_ID = "0190f3a0-0000-7000-8000-000000000003";
const BLOCK_ID = "0190f3a0-0000-7000-8000-000000000004";

// Format 1, as route.publish writes it (Platform STEP 2 §2.10).
const FORMAT_1 = {
  route: {
    id: ROUTE_ID,
    slug: "first-route",
    title: { en: "First route" },
    description: null,
    sourceLocale: "en",
    access: "open",
    pricing: "free",
  },
  modules: [{ id: MODULE_ID, position: "V", title: { en: "Module" } }],
  lessons: [{ id: LESSON_ID, moduleId: MODULE_ID, position: "V", title: { en: "Lesson" } }],
  prerequisites: [],
  blocks: [
    { id: BLOCK_ID, lessonId: LESSON_ID, position: "V", kind: "concept", data: { title: "Hi" } },
  ],
};

describe("upcastSnapshot (Platform STEP 2 §2.10)", () => {
  it("writes format 1 today", () => {
    expect(SNAPSHOT_FORMAT).toBe(1);
  });

  it("format 1: reads a snapshot as written, keeping every id", () => {
    expect(upcastSnapshot(1, FORMAT_1)).toEqual(FORMAT_1);
  });

  it("format 1: refuses a snapshot that does not match it", () => {
    expect(() => upcastSnapshot(1, { ...FORMAT_1, modules: "none" })).toThrow();
    expect(() => upcastSnapshot(1, { ...FORMAT_1, extra: true })).toThrow();
    // Positions are keys keyBetween can insert next to; "a0" ends in its zero digit.
    const badPosition = { ...FORMAT_1.modules[0], position: "a0" };
    expect(() => upcastSnapshot(1, { ...FORMAT_1, modules: [badPosition] })).toThrow();
  });

  it("refuses a format it does not know, rather than guessing", () => {
    expect(() => upcastSnapshot(0, FORMAT_1)).toThrow(RangeError);
    expect(() => upcastSnapshot(2, FORMAT_1)).toThrow(RangeError);
  });
});
