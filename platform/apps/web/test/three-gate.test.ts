import { describe, expect, test, vi } from "vitest";
import { threeIsWanted, whenIdle } from "../app/enhance/three-gate";

const page = ({ reduce = false, webgl = true, throws = false } = {}) => ({
  matchMedia: () => ({ matches: reduce }),
  createCanvas: () => ({
    getContext: () => {
      if (throws) {
        throw new Error("blocked");
      }
      return webgl ? {} : null;
    },
  }),
});

describe("threeIsWanted", () => {
  test("yes with WebGL and motion allowed", () => {
    expect(threeIsWanted(page())).toBe(true);
  });
  test("no under reduced motion", () => {
    expect(threeIsWanted(page({ reduce: true }))).toBe(false);
  });
  test("no without WebGL", () => {
    expect(threeIsWanted(page({ webgl: false }))).toBe(false);
  });
  test("no when asking for WebGL throws", () => {
    expect(threeIsWanted(page({ throws: true }))).toBe(false);
  });
});

describe("whenIdle", () => {
  test("waits for requestIdleCallback where it exists", () => {
    const run = vi.fn();
    const requestIdleCallback = vi.fn();
    whenIdle({ requestIdleCallback, addEventListener: vi.fn(), complete: true }, run);
    expect(run).not.toHaveBeenCalled();
    requestIdleCallback.mock.calls[0]?.[0]();
    expect(run).toHaveBeenCalledOnce();
  });
  test("without it, waits for load", () => {
    const run = vi.fn();
    const addEventListener = vi.fn();
    whenIdle({ addEventListener, complete: false }, run);
    expect(run).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith("load", run, { once: true });
  });
  test("without it, runs at once when the page has already loaded", () => {
    const run = vi.fn();
    whenIdle({ addEventListener: vi.fn(), complete: true }, run);
    expect(run).toHaveBeenCalledOnce();
  });
});
