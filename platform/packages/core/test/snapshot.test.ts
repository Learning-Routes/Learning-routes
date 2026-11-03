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
  it("writes format 2 today", () => {
    expect(SNAPSHOT_FORMAT).toBe(2);
  });

  it("format 1: reads a snapshot as today's, keeping every id, with no price and the plainest facts", () => {
    expect(upcastSnapshot(1, FORMAT_1)).toEqual({
      ...FORMAT_1,
      route: {
        ...FORMAT_1.route,
        topic: "otros",
        level: "inicial",
        priceMinor: null,
        currency: null,
      },
    });
  });

  it("format 2: carries the route's topic, level and price (Platform STEP 4 §2.2)", () => {
    const route = {
      ...FORMAT_1.route,
      topic: "musica",
      level: "avanzado",
      priceMinor: 2900,
      currency: "EUR",
    };
    expect(upcastSnapshot(2, { ...FORMAT_1, route }).route).toEqual(route);
    expect(() => upcastSnapshot(2, FORMAT_1)).toThrow();
    expect(() =>
      upcastSnapshot(2, { ...FORMAT_1, route: { ...route, topic: "cooking" } }),
    ).toThrow();
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
    expect(() => upcastSnapshot(3, FORMAT_1)).toThrow(RangeError);
  });
});
