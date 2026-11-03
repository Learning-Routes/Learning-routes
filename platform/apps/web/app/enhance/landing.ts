import { enhanceClose } from "./close";
import { probeHere, threeIsWanted, whenIdle } from "./three-gate";

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

function askAWorker(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./webgl-probe.worker.ts", import.meta.url), {
      type: "module",
      name: anyGpu ? "any-gpu" : "real-gpu",
    });
    worker.onmessage = ({ data }: MessageEvent<boolean>) => {
      worker.terminate();
      resolve(data);
    };
    worker.onerror = reject;
  });
}

function hasWebGL(): Promise<boolean> {
  const here = () =>
    probeHere(() => {
      const canvas = document.createElement("canvas");
      const options = { failIfMajorPerformanceCaveat: !anyGpu };
      // Both ids give a WebGL context, which getContext's overloads can't tell with options.
      return (canvas.getContext("webgl2", options) ??
        canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    });
  return "OffscreenCanvas" in window ? askAWorker().catch(here) : Promise.resolve(here());
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
