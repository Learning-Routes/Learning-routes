// The route page's moment (docs/design/VISION.md): the route draws itself as you scroll, and the
// station at the middle of the screen lights up. The stations are server HTML with their own
// marks; this lays a curved line through them, measured from where they really are.

const SVG = "http://www.w3.org/2000/svg";
const WIDTH = 96;
const SWAY = 20;
const SWING = 0.5;
const MIDDLE_OF_SCREEN = 0.55;

const svgElement = (name: string, attributes: Record<string, string | number>) => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
};

interface Point {
  x: number;
  y: number;
}

/** A smooth line through the stations (Catmull-Rom), and its length at each one. */
function lineThrough(points: readonly Point[]) {
  const probe = svgElement("path", {}) as SVGPathElement;
  const first = points[0] as Point;
  let d = `M${first.x} ${first.y}`;
  const lengths = [0];
  for (let index = 0; index < points.length - 1; index++) {
    const before = points[Math.max(0, index - 1)] as Point;
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    const after = points[Math.min(points.length - 1, index + 2)] as Point;
    d += `C${from.x + (to.x - before.x) / 6} ${from.y + (to.y - before.y) / 6},${to.x - (after.x - from.x) / 6} ${to.y - (after.y - from.y) / 6},${to.x} ${to.y}`;
    probe.setAttribute("d", d);
    lengths.push(probe.getTotalLength());
  }
  return { d, lengths };
}

function markFor(point: Point, kind: string) {
  if (kind === "exam") {
    return svgElement("rect", {
      class: "journey-mark journey-mark-exam",
      x: point.x - 10,
      y: point.y - 10,
      width: 20,
      height: 20,
      rx: 3,
      transform: `rotate(45 ${point.x} ${point.y})`,
    });
  }
  if (kind === "module") {
    const group = svgElement("g", { class: "journey-mark journey-mark-module" });
    group.appendChild(svgElement("circle", { cx: point.x, cy: point.y, r: 11 }));
    group.appendChild(
      svgElement("circle", { class: "journey-core", cx: point.x, cy: point.y, r: 4 }),
    );
    return group;
  }
  return svgElement("circle", {
    class: "journey-mark journey-mark-topic",
    cx: point.x,
    cy: point.y,
    r: 5,
  });
}

/** Measures the stations where they really are, and lays the line and its marks through them. */
function layout(svg: SVGSVGElement, list: HTMLElement, items: readonly HTMLElement[]) {
  svg.replaceChildren();
  const top = list.getBoundingClientRect().top;
  const height = list.offsetHeight;
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${height}`);
  svg.setAttribute("height", String(height));
  const points = items.map((item, index) => {
    const name = item.querySelector<HTMLElement>(".journey-name") ?? item;
    const box = name.getBoundingClientRect();
    return { x: WIDTH / 2 + Math.sin(index * SWING) * SWAY, y: box.top + box.height / 2 - top };
  });
  const { d, lengths } = lineThrough(points);
  const lit = svgElement("path", { class: "journey-lit", d }) as SVGPathElement;
  const total = lengths.at(-1) ?? 0;
  lit.setAttribute("stroke-dasharray", String(total));
  const marks = points.map((point, index) => markFor(point, items[index]?.dataset.kind ?? ""));
  for (const part of [svgElement("path", { class: "journey-track", d }), lit, ...marks]) {
    svg.appendChild(part);
  }
  return { lit, total, lengths, points, marks, height };
}

/** Lights the line and the stations as far as `reached`, and the one at the middle in gold. */
function lightUpTo(
  reached: number,
  { lit, total, lengths, points, marks, height }: ReturnType<typeof layout>,
  items: readonly HTMLElement[],
  reduceMotion: boolean,
) {
  let at = 0;
  while (at < points.length - 1 && (points[at + 1] as Point).y <= reached) {
    at++;
  }
  const here = points[at] as Point;
  const next = points[Math.min(at + 1, points.length - 1)] as Point;
  const part =
    next.y > here.y ? Math.max(0, Math.min(1, (reached - here.y) / (next.y - here.y))) : 1;
  const from = lengths[at] ?? 0;
  const to = lengths[Math.min(at + 1, lengths.length - 1)] ?? from;
  lit.setAttribute("stroke-dashoffset", String(total - (from + (to - from) * part)));
  items.forEach((item, index) => {
    const on = (points[index] as Point).y <= reached + 1;
    const middle = !reduceMotion && index === at && reached < height - 2;
    item.classList.toggle("journey-lit-stop", on);
    item.classList.toggle("journey-middle", middle);
    marks[index]?.classList.toggle("is-lit", on);
    marks[index]?.classList.toggle("is-middle", middle);
  });
}

export function drawJourney(list: HTMLElement, reduceMotion: boolean) {
  const svg = svgElement("svg", { class: "journey-line", "aria-hidden": "true" }) as SVGSVGElement;
  list.parentElement?.insertBefore(svg, list);
  list.parentElement?.classList.add("journey-drawn");
  const items = [...list.children] as HTMLElement[];
  let state = layout(svg, list, items);

  const onScroll = () => {
    const middle = window.innerHeight * MIDDLE_OF_SCREEN - svg.getBoundingClientRect().top;
    const reached = reduceMotion ? state.height : Math.max(0, Math.min(state.height, middle));
    lightUpTo(reached, state, items, reduceMotion);
  };
  const relayout = () => {
    state = layout(svg, list, items);
    onScroll();
  };
  // Once the fonts land: the stations' heights depend on them.
  void document.fonts.ready.then(relayout);
  onScroll();
  window.addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
  window.addEventListener("resize", relayout);
}
