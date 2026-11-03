import { at } from "@learning-routes/route-map/at-index";
import type { LandingModel } from "@learning-routes/route-map/landing-model";

// The story, a pure function of the scroll, from v1's controller.

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** How far along the itinerary the pin is, at this story time (scroll, from panel 1). */
export function tokenProgress(q: number): number {
  const panel = Math.floor(q);
  const t = q - panel;
  if (q < 1) {
    return 0;
  }
  if (panel === 1) {
    return lerp(0, 2, ease(clamp((t - 0.08) / 0.62)));
  }
  if (panel === 2) {
    return lerp(2, 4, ease(clamp((t - 0.32) / 0.42)));
  }
  if (panel === 3) {
    return lerp(4, 9, clamp((t - 0.05) / 0.7));
  }
  return 9;
}

export function tokenPosition(model: LandingModel, u: number) {
  const { itinerary } = model;
  const leg = Math.min(itinerary.length - 1, Math.floor(u));
  const fraction = u >= itinerary.length ? 1 : u - leg;
  return at(itinerary, leg).getPointAt(ease(clamp(fraction)));
}

/** Where a scroll offset, in stage heights past the pin, falls: panel plus progress within. */
export function storyTime(stageHeights: number, weights: readonly number[]): number {
  let y = stageHeights;
  if (y <= 0) {
    return 0;
  }
  for (const [i, weight] of weights.entries()) {
    if (y < weight) {
      return i + y / weight;
    }
    y -= weight;
  }
  return weights.length - 0.001;
}

/** How far in, in stage heights, a dot takes the reader: just past the panel's start. */
export function panelOffset(panel: number, weights: readonly number[]): number {
  const before = weights.slice(0, panel).reduce((sum, weight) => sum + weight, 0);
  return before + (panel ? 0.12 * (weights[panel] ?? 0) : 0);
}

/** Which panel's text shows: -1 while the camera moves between panels or the stage is unpinned. */
export function activePanel(time: number, isPinned: boolean, panels: number): number {
  const panel = Math.min(panels - 1, Math.floor(time));
  const within = time - panel;
  if (!isPinned) {
    return -1;
  }
  if (panel === 0) {
    return within < 0.86 ? 0 : -1;
  }
  return within > 0.03 && (within < 0.86 || panel === panels - 1) ? panel : -1;
}

/** A curve from the text to what it explains, in the text's own coordinates. */
export function leadPath(
  text: { width: number; height: number; headlineWidth: number; headlineMiddle: number },
  ax: number,
  ay: number,
): string {
  const { width, height, headlineWidth, headlineMiddle } = text;
  const across = (sx: number) => {
    const k = (ax - sx) * 0.55;
    return `M${sx} ${headlineMiddle}C${sx + k} ${headlineMiddle} ${ax - k} ${ay} ${ax} ${ay}`;
  };
  const down = (sx: number, sy: number) => {
    const k = (ay - sy) * 0.55;
    return `M${sx} ${sy}C${sx} ${sy + k} ${ax} ${ay - k} ${ax} ${ay}`;
  };
  if (ax > headlineWidth + 60) {
    return across(headlineWidth + 22);
  }
  if (ay > height + 30) {
    return down(Math.max(12, Math.min(ax, width * 0.3)), height + 18);
  }
  if (ay < -30) {
    return down(Math.max(12, Math.min(ax, headlineWidth - 12)), -18);
  }
  return across(-22);
}
