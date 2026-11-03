// When three.js may load on the landing (ADR 0008): after the first paint, only with
// WebGL, and never under reduced motion. Everything else keeps the server HTML.

type Page = {
  matchMedia: (query: string) => { matches: boolean };
  createCanvas: () => { getContext: (kind: "webgl2" | "webgl") => unknown };
};

export function threeIsWanted({ matchMedia, createCanvas }: Page): boolean {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    const canvas = createCanvas();
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Idle = {
  // Safari may not have it, so `load` stands in.
  requestIdleCallback?: (run: () => void) => unknown;
  addEventListener: (type: "load", run: () => void, options: { once: true }) => void;
  complete: boolean;
};

export function whenIdle(
  { requestIdleCallback, addEventListener, complete }: Idle,
  run: () => void,
) {
  if (requestIdleCallback) {
    requestIdleCallback(run);
  } else if (complete) {
    run();
  } else {
    addEventListener("load", run, { once: true });
  }
}
