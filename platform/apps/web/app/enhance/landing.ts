import { threeIsWanted, whenIdle } from "./three-gate";

whenIdle(
  {
    requestIdleCallback: window.requestIdleCallback?.bind(window),
    addEventListener: window.addEventListener.bind(window),
    isLoaded: document.readyState === "complete",
  },
  () => {
    const page = {
      matchMedia: window.matchMedia.bind(window),
      createCanvas: () => document.createElement("canvas"),
    };
    if (threeIsWanted(page)) {
      // A failed chunk is no failure for the visitor: the server HTML is the page.
      import("./three-parts").catch(() => undefined);
    }
  },
);
