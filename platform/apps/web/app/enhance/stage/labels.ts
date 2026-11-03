import { at } from "@learning-routes/route-map/at-index";
import type { Point } from "@learning-routes/route-map/landing-curves";
import type { LandingModel } from "@learning-routes/route-map/landing-model";

// The names on the map: aria-hidden, drawn over the canvas, by priority, never under the
// controls or the text and never on each other. From v1's controller.

export type ExampleRoute = { title: string; modules: [string, string[]][] };
export type StageWords = {
  yourRoute: string;
  here: string;
  free: string;
  /** {n} */
  module: string;
  /** {done}, {total} */
  progress: string;
  /** {count} */
  topics: string;
  extraNames: string[];
};

export const LOCK_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const ESCAPED = /[&<>"']/g;
export const escapeHtml = (text: string) => text.replace(ESCAPED, (c) => ESCAPES[c] ?? c);

const FILLED = /\{(\w+)\}/g;
export const fillIn = (template: string, values: Record<string, string | number>) =>
  template.replace(FILLED, (_, key: string) => String(values[key] ?? ""));

type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Projector = (p: Point) => { x: number; y: number; isVisible: boolean };
export type Placed = { blocked: Rect[]; taken: Rect[] };
type Mode = "center" | "left" | "above" | "below";
type Place = { element: HTMLElement; at: Point; opacity: number; mode: Mode; offset?: number };

const overlaps = (a: Rect, b: Rect) => a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;

function positionFor(
  { mode, offset = 0 }: Place,
  seen: { x: number; y: number },
  w: number,
  h: number,
  stageWidth: number,
) {
  if (mode === "center") {
    return { x: seen.x - w / 2, y: seen.y - h / 2 };
  }
  if (mode === "left") {
    return { x: seen.x - 10, y: seen.y - h / 2 };
  }
  if (mode === "above") {
    return { x: seen.x - w * 0.2, y: seen.y - h - 14 };
  }
  return { x: Math.min(stageWidth - w - 6, Math.max(6, seen.x - w / 2)), y: seen.y + offset };
}

/** Puts one name at its point. A solid name reserves its room, and hides if it has none. */
export function placeLabel(
  place: Place,
  project: Projector,
  stageWidth: number,
  placed: Placed,
  isSolid = true,
) {
  const { element, opacity } = place;
  const seen = project(place.at);
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  const { x, y } = positionFor(place, seen, w, h, stageWidth);
  element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  let shows =
    opacity > 0 &&
    seen.isVisible &&
    !placed.blocked.some((b) => seen.x > b.x0 && seen.x < b.x1 && seen.y > b.y0 && seen.y < b.y1);
  if (shows && isSolid) {
    const room = { x0: x - 4, y0: y - 2, x1: x + w + 4, y1: y + h + 2 };
    if (placed.taken.some((b) => overlaps(b, room))) {
      shows = false;
    } else {
      placed.taken.push(room);
    }
  }
  element.style.opacity = String(shows ? opacity : 0);
}

const label = (parent: HTMLElement, className: string, html = "") => {
  const element = document.createElement("div");
  element.className = className;
  element.innerHTML = html;
  parent.appendChild(element);
  return element;
};

type StepLabel = {
  moduleIndex: number;
  index: number;
  element: HTMLElement;
  number: HTMLElement;
  name: string;
  html: string;
};

export function buildLabels(parent: HTMLElement, model: LandingModel, words: StageWords) {
  const [first, second] = model.modules;
  const step = (moduleIndex: number) => (_: Point, index: number) => ({
    moduleIndex,
    index,
    element: label(parent, "lp-ml"),
    number: label(parent, "lp-mn", String(index + 1)),
    name: "",
    html: "",
  });
  return {
    root: label(parent, "lp-mr"),
    chips: model.modules.map(() => ({ element: label(parent, "lp-mc"), html: "" })),
    steps: [...first.heads.map(step(0)), ...second.heads.map(step(1))] as StepLabel[],
    extras: words.extraNames.map((name) => label(parent, "lp-ml lp-r", escapeHtml(name))),
    modules: [0, 1].map(() => label(parent, "lp-ml")),
  };
}
export type Labels = ReturnType<typeof buildLabels>;

/** Writes one example route's names into the labels. */
export function showRoute(labels: Labels, route: ExampleRoute, words: StageWords) {
  labels.root.innerHTML = `<small>${escapeHtml(words.yourRoute)}</small><b>${escapeHtml(route.title)}</b>`;
  labels.modules.forEach((element, i) => {
    element.innerHTML = `<b>${escapeHtml(at(route.modules, i)[0])}</b>`;
  });
  for (const step of labels.steps) {
    step.name = at(at(route.modules, step.moduleIndex)[1], step.index);
    step.html = "";
  }
  for (const chip of labels.chips) {
    chip.html = "";
  }
}
