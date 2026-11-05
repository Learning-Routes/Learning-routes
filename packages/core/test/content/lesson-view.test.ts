import { describe, expect, it } from "vitest";
import { lessonView, placeInRoute } from "../../src/content/lesson-view";
import type { Snapshot } from "../../src/content/snapshot";

const id = (n: number) => `0192d3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const lesson = (n: number, module: number) => ({
  id: id(100 + n),
  moduleId: id(module),
  position: `V${n}`,
  title: { es: `Tema ${n}` },
});
const blocks = [
  { kind: "concept", data: { type: "concept", body: { es: "Lee esto" } } },
  { kind: "video", data: { type: "video", url: "https://example.com/a" } },
  { kind: "check", data: { type: "check", question: { es: "¿Sí?" }, options: [] } },
].map((block, n) => ({ ...block, id: id(200 + n), lessonId: id(101), position: `V${n + 1}` }));

const snapshot = (pricing: "free" | "paid"): Snapshot =>
  ({
    route: { id: id(1), title: { es: "La ruta" }, sourceLocale: "es", pricing },
    modules: [
      { id: id(10), position: "V1", title: { es: "Uno" } },
      { id: id(20), position: "V2", title: { es: "Dos" } },
    ],
    lessons: [lesson(1, 10), lesson(2, 10), lesson(3, 20)],
    prerequisites: [],
    blocks,
  }) as unknown as Snapshot;

describe("lessonView", () => {
  it("says where the topic is, in its module and in the route", () => {
    expect(lessonView(snapshot("free"), 2)).toMatchObject({
      locked: false,
      title: { es: "Tema 2" },
      moduleNumber: 1,
      topicInModule: 2,
      topicsInModule: 2,
      topicNumber: 2,
      topicTotal: 3,
      lessonsPerModule: [2, 1],
      next: { number: 3, title: { es: "Tema 3" } },
    });
  });

  it("has no next topic at the end of the route", () => {
    expect(lessonView(snapshot("free"), 3)?.next).toBeNull();
  });

  it("sends every block the creator wrote, whatever its kind", () => {
    expect(lessonView(snapshot("free"), 1)?.blocks.map((block) => block.kind)).toEqual([
      "concept",
      "video",
      "check",
    ]);
  });

  it("serves the first module of a paid route, and nothing past it", () => {
    expect(lessonView(snapshot("paid"), 2)?.locked).toBe(false);
    const locked = lessonView(snapshot("paid"), 3);
    expect(locked).toMatchObject({ locked: true, blocks: [], topicNumber: 3 });
  });

  it("has nothing for a topic the route does not have", () => {
    expect(lessonView(snapshot("free"), 4)).toBeNull();
    expect(lessonView(snapshot("free"), 0)).toBeNull();
  });
});

describe("placeInRoute", () => {
  it("is the first topic not finished, wherever the finished ones are", () => {
    const s = snapshot("free");
    expect(placeInRoute(s, [])).toEqual({ number: 1, title: { es: "Tema 1" }, finished: false });
    expect(placeInRoute(s, [id(101), id(103)]).number).toBe(2);
  });

  it("has no title for a route with no topics, so nobody is sent to one", () => {
    expect(placeInRoute({ modules: [], lessons: [] }, [])).toEqual({
      number: 1,
      title: null,
      finished: false,
    });
  });

  it("goes by module first, whatever order the lessons are stored in", () => {
    const s = snapshot("free");
    const shuffled = { ...s, lessons: [...s.lessons].reverse() };
    expect(placeInRoute(shuffled, []).title).toEqual({ es: "Tema 2" });
  });

  it("is the last one once all are finished, so the route can be reviewed", () => {
    expect(placeInRoute(snapshot("free"), [id(101), id(102), id(103)])).toEqual({
      number: 3,
      title: { es: "Tema 3" },
      finished: true,
    });
  });
});
