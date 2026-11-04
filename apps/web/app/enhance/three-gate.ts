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

export const SOFTWARE_RENDERERS = [
  "swiftshader",
  "llvmpipe",
  "softpipe",
  "software",
  "microsoft basic render driver",
];

/** A browser that hides its renderer's name counts as having a GPU: most of them do. */
function isSoftwareRenderer(name: string): boolean {
  const lower = name.toLowerCase();
  return SOFTWARE_RENDERERS.some((word) => lower.includes(word));
}

export type WebGLProbe = Pick<WebGLRenderingContext, "getExtension" | "getParameter">;

/**
 * Asks one context what it runs on, then releases it: the scene makes its own. Without a real GPU
 * the map would crawl and block the page, so that answers no, unless the page asks anyway.
 */
export function probe(context: WebGLProbe, anyGpu: boolean): boolean {
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return anyGpu || !isSoftwareRenderer(renderer);
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
