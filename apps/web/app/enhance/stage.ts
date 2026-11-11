import { drawJourney } from "./journey";

// The stage's one script (ADR 0008): a card's first tap on touch, and the route's curved line.
// Everything here adds motion to server HTML that already works, so if it never runs the page
// stays as it is. Reduced motion keeps the page complete and still.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Touch has no hover: a card's first tap runs its gold dot, and the second opens it. */
function runOnFirstTap() {
  let armed: Element | null = null;
  document.addEventListener("pointerdown", (event) => {
    const card = (event.target as Element | null)?.closest(".moment .route-card");
    if (event.pointerType !== "touch" || !card || card === armed) {
      return;
    }
    armed?.classList.remove("touched");
    armed = card;
    card.classList.add("touched");
    card.addEventListener("click", (click) => click.preventDefault(), { once: true });
  });
}
if (!reduceMotion) {
  runOnFirstTap();
}

const journey = document.querySelector<HTMLElement>(".moment .journey-stops");
if (journey) {
  drawJourney(journey, reduceMotion);
}
