// When three.js may load on the landing (ADR 0008): after the first paint, only with
// WebGL, and never under reduced motion. Everything else keeps the server HTML.

type WebGLProbe = {
  getExtension: (name: "WEBGL_lose_context") => { loseContext: () => void } | null;
};

type Page = {
  matchMedia: (query: string) => { matches: boolean };
  createCanvas: () => { getContext: (kind: "webgl2" | "webgl") => WebGLProbe | null };
};

export function threeIsWanted({ matchMedia, createCanvas }: Page): boolean {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    const canvas = createCanvas();
    const probe = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    // The scene makes its own context, and browsers limit how many can live.
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
    return probe !== null;
  } catch {
    return false;
  }
}

type Idle = {
  // Safari has none yet, so there `load` alone decides.
  requestIdleCallback?: (run: () => void) => unknown;
  addEventListener: (type: "load", run: () => void, options: { once: true }) => void;
  isLoaded: boolean;
};

/** After `load`, so nothing competes with the first paint, and then when the page is idle. */
export function whenIdle(
  { requestIdleCallback, addEventListener, isLoaded }: Idle,
  run: () => void,
) {
  const idle = () => (requestIdleCallback ? requestIdleCallback(run) : run());
  if (isLoaded) {
    idle();
  } else {
    addEventListener("load", idle, { once: true });
  }
}
