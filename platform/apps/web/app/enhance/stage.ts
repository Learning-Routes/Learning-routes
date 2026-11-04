import { drawJourney } from "./journey";

// The stage's one script (ADR 0008): the light that follows the pointer, and the route's curved line.
// Everything here adds motion to server HTML that already works, so if it never runs the page
// stays as it is. Reduced motion keeps the page complete and still.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const stage = document.querySelector<HTMLElement>(".stage");
const QUARTER_ON_SCREEN = 0.35;
/** The extrusion always falls downward, and the light only ever moves a little. */
const LOWEST = Math.PI * 0.2;
const HIGHEST = Math.PI * 0.8;
const EASE = 0.3;

function followThePointer() {
  let angle = Math.PI * 0.3;
  let frame = 0;
  const follow = (event: PointerEvent) => {
    const towards = Math.atan2(
      event.clientY - window.innerHeight * QUARTER_ON_SCREEN,
      event.clientX - window.innerWidth / 2,
    );
    const away = (towards + Math.PI + Math.PI * 2) % (Math.PI * 2);
    // Pointer below the light: stay on the side the extrusion already falls towards.
    const falling =
      away <= Math.PI
        ? Math.max(LOWEST, Math.min(HIGHEST, away))
        : Math.cos(away) > 0
          ? LOWEST
          : HIGHEST;
    angle += (falling - angle) * EASE;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty("--light-x", Math.cos(angle).toFixed(3));
      root.style.setProperty("--light-y", Math.sin(angle).toFixed(3));
      if (stage) {
        const box = stage.getBoundingClientRect();
        stage.style.setProperty("--pointer-x", `${event.clientX - box.left}px`);
        stage.style.setProperty("--pointer-y", `${event.clientY - box.top}px`);
      }
    });
  };
  window.addEventListener("pointermove", follow, { passive: true });
}

if (!reduceMotion) {
  followThePointer();
}
const journey = document.querySelector<HTMLElement>(".moment .journey-stops");
if (journey) {
  drawJourney(journey, reduceMotion);
}
