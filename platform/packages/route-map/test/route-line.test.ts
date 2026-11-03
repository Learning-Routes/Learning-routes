import { describe, expect, it } from "vitest";
import { routeLine } from "../src/route-line";

const NUMBER = /-?\d+(?:\.\d+)?/g;

describe("a route's own line (Platform STEP 4 §3.2)", () => {
  it("stays in its box, whatever the route's size", () => {
    for (const counts of [[], [1], [3, 5, 6], Array(40).fill(200), [0, 0, 0]]) {
      const numbers = (routeLine(counts, "seed").path.match(NUMBER) ?? []).map(Number);
      expect(numbers.length).toBeGreaterThan(0);
      for (const value of numbers) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(320);
      }
    }
  });

  it("is the same every time for the same route", () => {
    expect(routeLine([3, 5], "a")).toEqual(routeLine([3, 5], "a"));
  });

  it("differs by shape, and between two routes of the same shape", () => {
    const seen = new Set(
      [[2], [2, 4], [2, 4, 6], [6, 4, 2], [3, 3, 3, 3], [9, 1]].map(
        (counts) => routeLine(counts, "same").path,
      ),
    );
    expect(seen.size).toBe(6);
    const seeds = new Set(
      ["a", "b", "c", "d", "e", "f"].map((seed) => routeLine([3, 5, 6], seed).path),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("starts and ends where the card's marks go", () => {
    const line = routeLine([3, 5], "a");
    expect(line.path.startsWith(`M ${line.start.x} ${line.start.y}`)).toBe(true);
    expect(line.path.endsWith(`${line.end.x} ${line.end.y}`)).toBe(true);
  });
});
