import type { Camera, Vector3 } from "three";

const TOP_BAR = 74;
const NARROW = 720;

// Map labels as page text (Platform STEP 10): crisp at any size, readable by the browser's own
// tools, and placed each frame over the point of the scene they belong to.

export interface Marker {
  element: HTMLElement;
  position: Vector3;
}

export function strong(text: string) {
  const bold = document.createElement("b");
  bold.textContent = text;
  return bold;
}

export class Markers {
  readonly list: Marker[] = [];

  constructor(private readonly overlay: HTMLElement) {}

  add(position: Vector3, className: string, label: string | null, sublabel?: string) {
    const element = document.createElement("div");
    element.className = "studio-mark is-entering";
    const dot = document.createElement("span");
    dot.className = className;
    element.appendChild(dot);
    if (label) {
      const text = document.createElement("span");
      text.className = "studio-label";
      text.appendChild(strong(label));
      if (sublabel) {
        text.appendChild(document.createTextNode(sublabel));
      }
      element.appendChild(text);
    }
    this.overlay.appendChild(element);
    requestAnimationFrame(() => element.classList.remove("is-entering"));
    const marker = { element, position: position.clone() };
    this.list.push(marker);
    return marker;
  }

  drop(marker: Marker) {
    marker.element.remove();
    const index = this.list.indexOf(marker);
    if (index >= 0) {
      this.list.splice(index, 1);
    }
  }
}

/** Where a point of the scene lands on the page, and whether it is in front of the camera. */
function toScreen(point: Vector3, camera: Camera) {
  const p = point.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    isAhead: p.z < 1,
  };
}

/** Moves every marker; one under the top bar or the subtitles is hidden, never drawn over them. */
export function placeMarkers(markers: readonly Marker[], camera: Camera, floor: number) {
  const width = window.innerWidth;
  for (const marker of markers) {
    const s = toScreen(marker.position, camera);
    const isShown = s.isAhead && s.x > -40 && s.x < width + 40 && s.y > TOP_BAR && s.y < floor;
    marker.element.style.transform = `translate3d(${s.x}px,${s.y}px,0)`;
    marker.element.style.visibility = isShown ? "visible" : "hidden";
  }
}

/** A fork's chip, above its branch's end and kept inside the screen. */
export function placeChip(chip: HTMLElement, anchor: Vector3, camera: Camera) {
  const s = toScreen(anchor, camera);
  const half = chip.offsetWidth / 2;
  const x = Math.min(window.innerWidth - half - 16, Math.max(half + 16, s.x));
  chip.style.transform = `translate3d(${x - half}px,${s.y - 44}px,0)`;
}

/** A pinned preview beside its station, above the subtitles, with a leader line to the station. */
export function placeNote(
  pin: { element: HTMLElement; leader: HTMLElement },
  anchor: Vector3,
  camera: Camera,
  floor: number,
) {
  const s = toScreen(anchor, camera);
  const { element, leader } = pin;
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  if (window.innerWidth < NARROW) {
    // A phone has no room beside the station: the preview sits above the subtitles instead.
    element.style.transform = `translate3d(16px,${Math.max(90, floor - h - 12)}px,0)`;
    leader.style.width = "0px";
    return;
  }
  const x = s.x + 70 + w > window.innerWidth - 20 ? s.x - w - 70 : s.x + 70;
  const y = Math.max(90, Math.min(floor - h - 20, s.y - h / 2));
  element.style.transform = `translate3d(${x}px,${y}px,0)`;
  const dx = (x > s.x ? x : x + w) - s.x;
  const dy = y + 40 - s.y;
  leader.style.width = `${Math.hypot(dx, dy)}px`;
  leader.style.transform = `translate3d(${s.x}px,${s.y}px,0) rotate(${Math.atan2(dy, dx)}rad)`;
}

/** A fork's label on the map. The same choice is a real button under the subtitles, so this one stays out of the tab order. */
export function makeChip(
  label: string,
  on: { choose: () => void; enter: () => void; leave: () => void },
) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "studio-branch";
  chip.tabIndex = -1;
  chip.setAttribute("aria-hidden", "true");
  chip.textContent = label;
  chip.addEventListener("click", on.choose);
  chip.addEventListener("pointerenter", on.enter);
  chip.addEventListener("pointerleave", on.leave);
  return chip;
}
