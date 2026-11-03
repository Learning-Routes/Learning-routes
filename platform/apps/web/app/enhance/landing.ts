import { enhanceClose } from "./close";
import { threeIsWanted, whenIdle } from "./three-gate";

// The landing's one script (ADR 0008). Everything here adds motion to server HTML that
// already works: if any of it fails or never runs, the page stays as it is.

const journey = document.querySelector<HTMLElement>(".lp-journey");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const close = document.querySelector(".lp-final");
if (close) {
  enhanceClose(close, new AbortController().signal, reduceMotion);
}

function stayStatic() {
  if (journey) {
    journey.dataset.stage = "static";
  }
}

whenIdle(
  {
    requestIdleCallback: window.requestIdleCallback?.bind(window),
    addEventListener: window.addEventListener.bind(window),
    isLoaded: document.readyState === "complete",
  },
  () => {
    const page = {
      matchMedia: window.matchMedia.bind(window),
      createContext: () => {
        const canvas = document.createElement("canvas");
        return canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      },
    };
    // Taking `moment` off the page's root turns the stage off (Platform STEP 6 §4).
    if (!(journey?.closest(".moment") && threeIsWanted(page))) {
      stayStatic();
      return;
    }
    import("./stage/stage")
      .then(({ LandingStage }) => new LandingStage(journey).start())
      .catch(stayStatic);
  },
);
