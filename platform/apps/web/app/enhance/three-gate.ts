// When three.js may load on the landing (ADR 0008): after the first paint, only with
// WebGL, and never under reduced motion. Everything else keeps the server HTML.

type Page = {
  matchMedia: (query: string) => { matches: boolean };
  hasWebGL: () => Promise<boolean>;
};

export async function threeIsWanted({ matchMedia, hasWebGL }: Page): Promise<boolean> {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    return await hasWebGL();
  } catch {
    return false;
  }
}

type WebGLProbe = {
  getExtension: (name: "WEBGL_lose_context") => { loseContext: () => void } | null;
};

/** On the main thread, for a browser that can't ask from a worker. The scene makes its own. */
export function probeHere(createContext: () => WebGLProbe | null): boolean {
  const probe = createContext();
  probe?.getExtension("WEBGL_lose_context")?.loseContext();
  return probe !== null;
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
