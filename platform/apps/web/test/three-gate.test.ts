import { describe, expect, test, vi } from "vitest";
import { probeHere, threeIsWanted, whenIdle } from "../app/enhance/three-gate";

const page = ({ reduce = false, webgl = true, fails = false } = {}) => ({
  matchMedia: () => ({ matches: reduce }),
  hasWebGL: () => (fails ? Promise.reject(new Error("blocked")) : Promise.resolve(webgl)),
});

describe("threeIsWanted", () => {
  test("yes with WebGL and motion allowed", async () => {
    expect(await threeIsWanted(page())).toBe(true);
  });
  test("no under reduced motion, without even asking for WebGL", async () => {
    const hasWebGL = vi.fn();
    const matchMedia = () => ({ matches: true });
    expect(await threeIsWanted({ matchMedia, hasWebGL })).toBe(false);
    expect(hasWebGL).not.toHaveBeenCalled();
  });
  test("no without WebGL", async () => {
    expect(await threeIsWanted(page({ webgl: false }))).toBe(false);
  });
  test("no when asking for WebGL fails", async () => {
    expect(await threeIsWanted(page({ fails: true }))).toBe(false);
  });
});

describe("probeHere", () => {
  test("releases the context it made", () => {
    const loseContext = vi.fn();
    expect(probeHere(() => ({ getExtension: () => ({ loseContext }) }))).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });
  test("says no when there is none", () => {
    expect(probeHere(() => null)).toBe(false);
  });
});

describe("whenIdle", () => {
  const load = (addEventListener: ReturnType<typeof vi.fn>) =>
    addEventListener.mock.calls[0]?.[1]();

  test("waits for load, then for requestIdleCallback", () => {
    const run = vi.fn();
    const addEventListener = vi.fn();
    const requestIdleCallback = vi.fn();
    whenIdle({ requestIdleCallback, addEventListener, isLoaded: false }, run);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    load(addEventListener);
    expect(run).not.toHaveBeenCalled();
    requestIdleCallback.mock.calls[0]?.[0]();
    expect(run).toHaveBeenCalledOnce();
  });
  test("without requestIdleCallback, load alone decides", () => {
    const run = vi.fn();
    const addEventListener = vi.fn();
    whenIdle({ addEventListener, isLoaded: false }, run);
    expect(run).not.toHaveBeenCalled();
    load(addEventListener);
    expect(run).toHaveBeenCalledOnce();
  });
  test("runs at once when the page has already loaded and has no idle callback", () => {
    const run = vi.fn();
    whenIdle({ addEventListener: vi.fn(), isLoaded: true }, run);
    expect(run).toHaveBeenCalledOnce();
  });
});
