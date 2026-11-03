import { enhanceClose } from "./close";
import { probe, threeIsWanted, whenIdle } from "./three-gate";

// The landing's one script (ADR 0008). Everything here adds motion to server HTML that
// already works: if any of it fails or never runs, the page stays as it is.

const journey = document.querySelector<HTMLElement>(".lp-journey");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const close = document.querySelector(".lp-final");
if (close) {
  enhanceClose(close, reduceMotion);
}

function stayStatic() {
  if (journey) {
    journey.dataset.stage = "static";
  }
}

// `#mapa` asks for the map even without a real GPU: the browser tests need it, on runners with none.
const anyGpu = window.location.hash === "#mapa";

const PROBE_LIMIT_MS = 5000;

/** The worker's answer, or null when it can't tell: then this thread asks instead. */
function askAWorker(): Promise<boolean | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./webgl-probe.worker.ts", import.meta.url), {
      type: "module",
      name: anyGpu ? "any-gpu" : "real-gpu",
    });
    const finish = (answer: boolean | null) => {
      clearTimeout(limit);
      worker.terminate();
      resolve(answer);
    };
    const limit = setTimeout(() => finish(null), PROBE_LIMIT_MS);
    worker.onmessage = ({ data }: MessageEvent<boolean | null>) => finish(data);
    worker.onerror = () => finish(null);
    worker.onmessageerror = () => finish(null);
  });
}

function askHere(): boolean {
  const canvas = document.createElement("canvas");
  const options = { failIfMajorPerformanceCaveat: !anyGpu };
  // Both ids give a WebGL context, which getContext's overloads can't tell with options.
  const context = (canvas.getContext("webgl2", options) ??
    canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
  return context ? probe(context, anyGpu) : false;
}

async function hasWebGL(): Promise<boolean> {
  const answer = "OffscreenCanvas" in window ? await askAWorker() : null;
  return answer ?? askHere();
}

async function start() {
  const page = { matchMedia: window.matchMedia.bind(window), hasWebGL };
  // Taking `moment` off the page's root turns the stage off (Platform STEP 6 §4).
  if (!(journey?.closest(".moment") && (await threeIsWanted(page)))) {
    stayStatic();
    return;
  }
  const { LandingStage } = await import("./stage/stage");
  await new LandingStage(journey).start();
}

whenIdle(
  {
    requestIdleCallback: window.requestIdleCallback?.bind(window),
    addEventListener: window.addEventListener.bind(window),
    isLoaded: document.readyState === "complete",
  },
  () => {
    start().catch(stayStatic);
  },
);
