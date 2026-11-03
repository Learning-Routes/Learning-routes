import type { Point } from "@learning-routes/route-map/landing-curves";
import { type PerspectiveCamera, Vector3 } from "three";
import type { Projector } from "./labels";

// What ties the stage to the page: its events, and turning map points into stage pixels.

/** Lets the browser paint and answer input between two long steps. */
export const nextTask = () => new Promise((resolve) => setTimeout(resolve));

type Handlers = {
  setOnScreen: (isOnScreen: boolean) => void;
  wake: () => void;
  resize: () => void;
  repaintTheme: () => void;
  /** `keepsPage`: the page may come back from the back/forward cache. */
  leave: (keepsPage: boolean) => void;
  pickRoute: (key: string) => void;
};

/** Every listener ends with the signal. Returns the observer, which the caller disconnects. */
export function listenToPage(
  journey: HTMLElement,
  tabs: HTMLButtonElement[],
  signal: AbortSignal,
  on: Handlers,
) {
  const observer = new IntersectionObserver(([entry]) =>
    on.setOnScreen(entry?.isIntersecting ?? true),
  );
  observer.observe(journey);
  document.addEventListener("visibilitychange", on.wake, { signal });
  let resizeTimer = 0;
  const debounced = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(on.resize, 120);
  };
  window.addEventListener("resize", debounced, { signal });
  // Without waiting for the observer: jumping back to the top must never find the hero empty.
  const scrolled = () => {
    const box = journey.getBoundingClientRect();
    on.setOnScreen(box.bottom > 0 && box.top < window.innerHeight);
  };
  window.addEventListener("scroll", scrolled, { signal, passive: true });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", on.repaintTheme, { signal });
  window.addEventListener("pagehide", (event) => on.leave(event.persisted), { signal });
  window.addEventListener("pageshow", on.wake, { signal });
  for (const tab of tabs) {
    tab.addEventListener("click", () => on.pickRoute(tab.dataset.route ?? ""), { signal });
  }
  return observer;
}

export function projectorFor(camera: PerspectiveCamera, stage: HTMLElement): Projector {
  const projected = new Vector3();
  return (p: Point) => {
    const seen = projected.set(p.x, p.y, p.z).project(camera);
    return {
      x: ((seen.x + 1) / 2) * stage.clientWidth,
      y: ((1 - seen.y) / 2) * stage.clientHeight,
      isVisible: seen.z < 1 && seen.z > -1,
    };
  };
}

/** How wide a radius on the map is drawn on the stage. */
export const radiusOn = (project: Projector) => (p: Point, radius: number) => {
  const center = project(p);
  const b = project({ x: p.x + radius, y: p.y, z: p.z });
  const c = project({ x: p.x, y: p.y, z: p.z + radius });
  return Math.max(
    Math.hypot(b.x - center.x, b.y - center.y),
    Math.hypot(c.x - center.x, c.y - center.y),
  );
};

export function markRoute(tabs: HTMLButtonElement[], key: string) {
  for (const tab of tabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.route === key));
  }
}

/** Back to the server HTML: the stacked panels, as if the stage never ran. */
export function undoStage(journey: HTMLElement, panels: HTMLElement[]) {
  journey.classList.remove("lp-gl");
  journey.style.height = "";
  for (const panel of panels) {
    panel.classList.remove("lp-on");
    panel.style.width = "";
    panel.style.transform = "";
  }
}
