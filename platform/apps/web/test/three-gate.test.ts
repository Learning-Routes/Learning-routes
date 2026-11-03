import { describe, expect, test, vi } from "vitest";
import { threeIsWanted, whenIdle } from "../app/enhance/three-gate";

const page = ({ reduce = false, webgl = true, throws = false } = {}) => ({
  matchMedia: () => ({ matches: reduce }),
  createContext: () => {
    if (throws) {
      throw new Error("blocked");
    }
    return webgl ? { getExtension: () => null } : null;
  },
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
