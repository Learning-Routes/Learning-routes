import { describe, expect, it } from "vitest";
import { braidShapes, routeShape } from "../src/route-shape";

const box = { width: 340, height: 150 };
const LESSONS = [5, 4, 5];
const WHOLE_PATH = /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+)+$/;

describe("routeShape", () => {
  it("has a ring per module and a dot per topic, and no exam nobody wrote", () => {
    const { stations } = routeShape(LESSONS, "pt", box);
    expect(stations.filter((s) => s.kind === "module")).toHaveLength(3);
    expect(stations.filter((s) => s.kind === "topic")).toHaveLength(14);
    expect(stations.map((s) => s.kind)).not.toContain("exam");
    expect(stations[0]?.kind).toBe("module");
  });

  it("numbers the topics in order", () => {
    const topics = routeShape(LESSONS, "pt", box).stations.filter((s) => s.kind === "topic");
    expect(topics.map((s) => s.topic)).toEqual([...Array(14).keys()]);
  });

  it("spaces stations evenly along the line, whatever its bends", () => {
    const { stations } = routeShape(LESSONS, "pt", box);
    const gaps = stations.slice(1).map((s, i) => s.at - (stations[i]?.at ?? 0));
    const between = gaps.filter((_, i) => {
      const [a, b] = [stations[i]?.kind, stations[i + 1]?.kind];
      return a === "topic" && b === "topic";
    });
    for (const gap of between) {
      expect(gap).toBeCloseTo(between[0] ?? 0, 6);
    }
    // A module takes more room than a topic.
    expect(gaps[0]).toBeGreaterThan(between[0] ?? 0);
    expect(stations.at(-1)?.at).toBeCloseTo(1, 6);
    expect(stations[0]?.at).toBe(0);
  });

  it("is the same shape every time, and another route's is different", () => {
    expect(routeShape(LESSONS, "pt", box)).toEqual(routeShape(LESSONS, "pt", box));
    expect(routeShape(LESSONS, "other", box).path).not.toBe(routeShape(LESSONS, "pt", box).path);
    expect(routeShape([6, 5, 6, 5], "pt", box).stations).toHaveLength(26);
  });

  it("stays inside its box, across and down", () => {
    const seeds = ["a", "b", "c", "d", "e", "f"];
    for (const seed of seeds) {
      for (const station of routeShape([6, 6, 6], seed, box).stations) {
        expect(station.x).toBeGreaterThanOrEqual(0);
        expect(station.x).toBeLessThanOrEqual(box.width);
        expect(station.y).toBeGreaterThanOrEqual(0);
        expect(station.y).toBeLessThanOrEqual(box.height);
      }
    }
    const down = routeShape([3], "a", { width: 96, height: 600, across: false }).stations;
    expect(down.at(-1)?.y).toBeGreaterThan(down[0]?.y ?? 0);
  });

  it("makes a valid path with no holes in it", () => {
    const { path } = routeShape([1], "a", box);
    expect(path).toMatch(WHOLE_PATH);
  });

  it("keeps a wide figure smooth without a thousand points", () => {
    const { path } = routeShape(LESSONS, "pt", { width: 1200, height: 140 });
    const points = path.split("L").length;
    expect(points).toBeGreaterThan(80);
    expect(points).toBeLessThanOrEqual(241);
  });
});

describe("braidShapes", () => {
  const routes = [
    { lessons: [5, 4], seed: "one" },
    { lessons: [3], seed: "two" },
    { lessons: [4, 4, 4], seed: "three" },
  ];

  it("gives each route its own line, with only rings on it", () => {
    const lines = braidShapes(routes, { width: 560, height: 680 });
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((line) => line.path)).size).toBe(3);
    expect(lines[0]?.stations.map((s) => s.kind)).toEqual(["module", "module"]);
  });

  it("stays inside the figure", () => {
    for (const line of braidShapes(routes, { width: 560, height: 680 })) {
      for (const station of line.stations) {
        expect(station.x).toBeGreaterThanOrEqual(0);
        expect(station.x).toBeLessThanOrEqual(560);
      }
    }
  });
});
