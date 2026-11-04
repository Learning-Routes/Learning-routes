import { anchorPoint, isPhone, spotFor } from "@learning-routes/route-map/landing-cameras";
import type { Point } from "@learning-routes/route-map/landing-curves";
import type { LandingModel } from "@learning-routes/route-map/landing-model";
import { layoutPanel, textWidth } from "@learning-routes/route-map/landing-placement";
import type { ExampleRoute, Placed, Projector, StageWords } from "./labels";
import { leadPath } from "./story";

// The panels' text on the map: where each one sits, and the line to what it explains.

export type PanelText = {
  element: HTMLElement;
  index: number;
  width: number;
  height: number;
  headlineWidth: number;
  headlineMiddle: number;
  anchor: Point;
  lead: Element | null;
  x: number;
  y: number;
};

export function required<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`the landing's stage has no ${selector}`);
  }
  return element;
}

/** The server HTML the stage works on. */
export function stagePage(journey: HTMLElement) {
  return {
    stage: required<HTMLElement>(journey, ".lp-stage"),
    canvas: required<HTMLCanvasElement>(journey, ".lp-world"),
    top: required<HTMLElement>(journey, ".lp-top"),
    dotsList: required<HTMLElement>(journey, ".lp-vdots ol"),
    tabs: [...journey.querySelectorAll<HTMLButtonElement>(".lp-opts button")],
    panels: [...journey.querySelectorAll<HTMLElement>(".lp-ann")],
    routes: JSON.parse(journey.dataset.routes ?? "{}") as Record<string, ExampleRoute>,
    words: JSON.parse(journey.dataset.words ?? "{}") as StageWords,
  };
}

/** The text as a headline over a narrower body, as it stands in the page. */
function measureShape(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  const extent = (node: Element) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.max(0, ...[...range.getClientRects()].map((r) => r.right - box.left));
  };
  const headline = required<HTMLElement>(element, "h1,h2");
  const right = extent(headline);
  let bodyWidth = 0;
  for (const p of element.querySelectorAll(":scope > p")) {
    bodyWidth = Math.max(bodyWidth, extent(p));
  }
  for (const action of element.querySelectorAll(".lp-acts > *")) {
    bodyWidth = Math.max(bodyWidth, action.getBoundingClientRect().right - box.left);
  }
  const split = headline.offsetHeight + 4;
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  const shape = [
    [0, 0, Math.ceil(right), split],
    [0, split, Math.ceil(bodyWidth || right), h],
  ] as const;
  return { w, h, right, headlineHeight: headline.offsetHeight, shape };
}

/** A panel gets its camera and slot from the placement package, then rides with that spot. */
export function layoutText(
  element: HTMLElement,
  index: number,
  model: LandingModel,
  width: number,
  height: number,
) {
  element.style.width = `${textWidth(index, width)}px`;
  // Measured at the origin, then put back: the hero stays on screen where it is.
  const shown = element.style.transform;
  element.style.transform = "translate(0px, 0px)";
  const { w, h, right, headlineHeight, shape } = measureShape(element);
  element.style.transform = shown;
  const laid = layoutPanel(model, index, width, height, { w, h, shape });
  element.dataset.lay = JSON.stringify({ hits: laid.slot.hits, x: laid.slot.x, y: laid.slot.y });
  const text: PanelText = {
    element,
    index,
    width: w,
    height: h,
    headlineWidth: right,
    headlineMiddle: headlineHeight / 2,
    anchor: laid.anchor,
    lead: element.querySelector(".lp-lead"),
    x: 0,
    y: 0,
  };
  return { text, rest: laid.rest };
}

export function layoutTexts(
  panels: HTMLElement[],
  model: LandingModel,
  width: number,
  height: number,
) {
  const laid = panels.map((element, index) => layoutText(element, index, model, width, height));
  return { texts: laid.map(({ text }) => text), rest: laid.map(({ rest }) => rest) };
}

/** Keeps the hero on its designed spot while the rest is laid out: the text never jumps. */
export function holdHero(hero: HTMLElement, stage: HTMLElement) {
  const width = stage.clientWidth;
  const { spot } = spotFor(0, isPhone(width));
  const x = isPhone(width) ? 20 : Math.round(spot[0] * width);
  const y = Math.round(Math.max(20, spot[1] * stage.clientHeight));
  hero.style.width = `${textWidth(0, width)}px`;
  hero.style.transform = `translate(${x}px, ${y}px)`;
  hero.classList.add("lp-on");
}

export function anchorOf(model: LandingModel, panel: number, width: number, token: Point) {
  const { anchor } = spotFor(panel, isPhone(width));
  return anchor ? anchorPoint(model, anchor, token) : null;
}

export function drawLead(text: PanelText, target: Point | null, project: Projector) {
  if (!(target && text.lead)) {
    return;
  }
  const seen = project(target);
  const ax = seen.x - text.x;
  const ay = seen.y - text.y;
  text.lead.querySelector("path")?.setAttribute("d", leadPath(text, ax, ay));
  for (const circle of text.lead.querySelectorAll("circle")) {
    circle.setAttribute("cx", ax.toFixed(1));
    circle.setAttribute("cy", ay.toFixed(1));
  }
}

/** Where names may not go: under the controls, or around the panel on show. */
export function roomFor(width: number, height: number, shown: PanelText | undefined): Placed {
  const control = isPhone(width)
    ? { x0: 0, y0: height - 70, x1: width, y1: height }
    : { x0: 0, y0: 0, x1: width, y1: 66 };
  if (!shown) {
    return { blocked: [control], taken: [] };
  }
  const around = (padX: number, padY: number) => ({
    x0: shown.x - padX,
    y0: shown.y - padY,
    x1: shown.x + shown.width + padX,
    y1: shown.y + shown.height + padY,
  });
  return { blocked: [control, around(24, 18)], taken: [around(12, 10)] };
}

/** Shows one panel; the others' links leave the tab order while they are hidden. */
export function showPanel(texts: PanelText[], panel: number) {
  for (const text of texts) {
    const isActive = text.index === panel;
    text.element.classList.toggle("lp-on", isActive);
    for (const link of text.element.querySelectorAll("a")) {
      link.tabIndex = isActive ? 0 : -1;
    }
  }
}

/** One dot per panel after the hero, each named for its panel. */
export function buildPanelDots(
  list: HTMLElement,
  panels: HTMLElement[],
  goTo: (panel: number) => void,
  signal: AbortSignal,
) {
  return panels.slice(1).map((panel, i) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", required(panel, "h2").textContent ?? "");
    button.addEventListener("click", () => goTo(i + 1), { signal });
    item.appendChild(button);
    list.appendChild(item);
    return button;
  });
}

export function markCurrentDot(dots: HTMLButtonElement[], panel: number) {
  dots.forEach((dot, n) => {
    if (n + 1 === panel) {
      dot.setAttribute("aria-current", "step");
    } else {
      dot.removeAttribute("aria-current");
    }
  });
}

/** Each panel's text rides with its spot on the map. */
export function rideWithSpots(texts: PanelText[], project: Projector) {
  for (const text of texts) {
    const seen = project(text.anchor);
    text.x = seen.x;
    text.y = seen.y;
    text.element.style.transform = `translate(${seen.x.toFixed(1)}px, ${seen.y.toFixed(1)}px)`;
  }
}
