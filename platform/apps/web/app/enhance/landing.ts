import { threeIsWanted, whenIdle } from "./three-gate";

whenIdle(
  {
    requestIdleCallback: window.requestIdleCallback?.bind(window),
    addEventListener: window.addEventListener.bind(window),
    complete: document.readyState === "complete",
  },
  () => {
    const page = {
      matchMedia: window.matchMedia.bind(window),
      createCanvas: () => document.createElement("canvas"),
    };
    if (threeIsWanted(page)) {
      void import("./three-parts");
    }
  },
);
