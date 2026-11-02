import { describe, expect, it } from "vitest";
import { landingScene } from "../src/landing-scene";

const hero = { panel: 0, mobile: false, width: 1440, height: 836, done: 0 };
const NUMBER = /-?\d+(?:\.\d+)?/g;

const numbersIn = (d: string) => (d.match(NUMBER) ?? []).map(Number);

describe("the landing's map as flat shapes", () => {
  it("draws the three sheets, the route and every stop", () => {
    const scene = landingScene(hero);
    expect(scene.sheets).toHaveLength(3);
    expect(scene.sheets.filter((sheet) => sheet.locked)).toHaveLength(1);
    expect(landingScene({ ...hero, panel: 1, width: 720, height: 500 }).stops).toHaveLength(
      6 + 5 + 4,
    );
    expect(scene.discs).toHaveLength(3);
    expect(scene.route.startsWith("M")).toBe(true);
  });

  it("has one 'you are here', on the student's stop", () => {
    const scene = landingScene({ ...hero, done: 2 });
    const first = scene.stops.filter((stop) => stop.module === 0);
    expect(first.slice(0, 2).map((stop) => stop.state)).toEqual(["done", "done"]);
    expect(first[2]?.state).toBe("here");
    expect(scene.stops.filter((stop) => stop.state === "here")).toHaveLength(1);
  });

  it("marks each module's last stop as its exam", () => {
    const scene = landingScene(hero);
    expect(scene.stops.filter((stop) => stop.exam).map((stop) => stop.module)).toEqual([0, 1, 2]);
  });

  it("opens the dotted branch only when asked", () => {
    expect(landingScene(hero).branch).toEqual([]);
    const opened = landingScene({ ...hero, done: 2, fan: true });
    expect(opened.branch).toHaveLength(3);
    expect(opened.branchStops).toHaveLength(3);
  });

  it("leaves out what the camera can't see", () => {
    const close = { panel: 2, mobile: false, width: 720, height: 500, done: 2 };
    expect(landingScene(close).stops.length).toBeLessThan(6 + 5 + 4);
    expect(landingScene(close).track.length).toBeLessThan(landingScene(hero).track.length);
  });

  it("the route grows with the student", () => {
    const start = landingScene(hero).route.length;
    expect(landingScene({ ...hero, done: 3 }).route.length).toBeGreaterThan(start);
  });

  it("is the same every time, so the HTML is cacheable and the baselines are stable", () => {
    expect(landingScene(hero)).toEqual(landingScene(hero));
  });

  it("keeps the first stop on the stage, at both shapes", () => {
    for (const shape of [hero, { ...hero, mobile: true, width: 390, height: 520 }]) {
      const scene = landingScene(shape);
      const [x = -1, y = -1] = numbersIn(scene.stops[0]?.d ?? "");
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(shape.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(shape.height);
    }
  });
});
