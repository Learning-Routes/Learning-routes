// WP-37 §3.2-3.4 — camera math for the route map. Pure: no DOM.
//
// A camera is { x, y, k }: a world point p appears at p * k + (x, y) in
// viewport-local pixels. World boxes are { x, y, w, h } (from
// layout.ts); screen rects are { left, top, width, height }.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ScaleRange {
  min?: number;
  max?: number;
}

type Side = "top" | "bottom" | "left" | "right";

// THE SAFE AREA. Everything that asks "is it on screen?" — the initial camera,
// Fit, the rail, focus-follows-camera — means the viewport MINUS the overlays
// drawn over it (the fixed topbar, the controls, the rail, the list link). Each
// overlay insets the one viewport edge it costs the least to clear, measured as
// a fraction of that dimension: a full-width bar insets the top, a corner button
// group the nearer short side, a thin rail the right.
export function safeRect(viewport: Rect, overlays: (Rect | null | undefined)[] = []): Rect {
  const inset: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  const vRight = viewport.left + viewport.width;
  const vBottom = viewport.top + viewport.height;
  for (const o of overlays) {
    if (!o || o.width <= 0 || o.height <= 0) continue;
    const oRight = o.left + o.width;
    const oBottom = o.top + o.height;
    if (oRight <= viewport.left || o.left >= vRight || oBottom <= viewport.top || o.top >= vBottom)
      continue;
    const options: [Side, number, number][] = [
      ["top", oBottom - viewport.top, viewport.height],
      ["bottom", vBottom - o.top, viewport.height],
      ["left", oRight - viewport.left, viewport.width],
      ["right", vRight - o.left, viewport.width],
    ];
    const [side, amount] = options.reduce((best, c) =>
      c[1] / c[2] < best[1] / best[2] ? c : best,
    );
    inset[side] = Math.max(inset[side], amount);
  }
  return {
    left: viewport.left + inset.left,
    top: viewport.top + inset.top,
    width: Math.max(0, viewport.width - inset.left - inset.right),
    height: Math.max(0, viewport.height - inset.top - inset.bottom),
  };
}

export function clampScale(k: number, { min = 0.05, max = 2 }: ScaleRange = {}): number {
  return Math.min(max, Math.max(min, k));
}

export function centerOn(point: Point, safe: Rect, k: number): Camera {
  return {
    x: safe.left + safe.width / 2 - point.x * k,
    y: safe.top + safe.height / 2 - point.y * k,
    k,
  };
}

const centerOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

export function fitCamera(
  box: Box,
  safe: Rect,
  { padding = 32, min = 0.05, max = 1 }: { padding?: number } & ScaleRange = {},
): Camera {
  const k = clampScale(
    Math.min((safe.width - 2 * padding) / box.w, (safe.height - 2 * padding) / box.h),
    { min, max },
  );
  return centerOn(centerOf(box), safe, k);
}

export function zoomAbout(
  camera: Camera,
  point: Point,
  factor: number,
  range?: ScaleRange,
): Camera {
  const k = clampScale(camera.k * factor, range);
  const wx = (point.x - camera.x) / camera.k;
  const wy = (point.y - camera.y) / camera.k;
  return { x: point.x - wx * k, y: point.y - wy * k, k };
}

export function screenBox(camera: Camera, box: Box): Rect {
  return {
    left: box.x * camera.k + camera.x,
    top: box.y * camera.k + camera.y,
    width: box.w * camera.k,
    height: box.h * camera.k,
  };
}

// The smallest camera move that brings `box` inside the safe rect (with margin).
// A box larger than the rect is aligned to its top-left.
export function ensureVisible(camera: Camera, box: Box, safe: Rect, margin = 24): Camera {
  const s = screenBox(camera, box);
  const L = safe.left + margin;
  const R = safe.left + safe.width - margin;
  const T = safe.top + margin;
  const B = safe.top + safe.height - margin;
  let dx = 0;
  let dy = 0;
  if (s.width > R - L || s.left < L) dx = L - s.left;
  else if (s.left + s.width > R) dx = R - (s.left + s.width);
  if (s.height > B - T || s.top < T) dy = T - s.top;
  else if (s.top + s.height > B) dy = B - (s.top + s.height);
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

// The opening shows the route's title below the top bar whenever the current
// step stays in view too. When both cannot fit, the step wins and the title
// goes wholly off the top (above y = 0), never half under the bar.
export function revealTitle(
  camera: Camera,
  title: Box,
  step: Box,
  safe: Rect,
  margin = 16,
): Camera {
  const k = camera.k;
  const want = safe.top + margin - (title.y * k + camera.y);
  if (want <= 0) return camera;
  const room = safe.top + safe.height - margin - ((step.y + step.h) * k + camera.y);
  if (want <= room) return { ...camera, y: camera.y + want };
  const under = (title.y + title.h) * k + camera.y;
  const headroom = step.y * k + camera.y - (safe.top + margin);
  return { ...camera, y: camera.y - Math.max(0, Math.min(under, headroom)) };
}

// STEP 38 §4, the leash. `world` is the content box plus a margin. Zoom runs
// from the fitted scale to twice that; nothing beyond. The fitted scale is
// fit-to-width, held between the legible floor (labels never under 12 px, the
// WP-37b rule) and 1 (a small route is not blown up past its drawn size).
export function leashRange(
  world: Box,
  safe: Rect,
  { floor = 0, ceiling = Infinity }: { floor?: number; ceiling?: number } = {},
): { min: number; max: number } {
  const fit = Math.min(ceiling, Math.max(floor, safe.width / world.w));
  return { min: fit, max: 2 * fit };
}

// The camera never shows past the world: on an axis where the world is larger
// than the safe rect it covers the rect; where it is smaller it is centred.
export function clampCamera(camera: Camera, world: Box, safe: Rect): Camera {
  const axis = (
    pos: number,
    start: number,
    size: number,
    safeStart: number,
    safeSize: number,
  ): number => {
    const span = size * camera.k;
    if (span <= safeSize) return safeStart + (safeSize - span) / 2 - start * camera.k;
    const max = safeStart - start * camera.k;
    const min = safeStart + safeSize - (start + size) * camera.k;
    return Math.min(max, Math.max(min, pos));
  };
  return {
    k: camera.k,
    x: axis(camera.x, world.x, world.w, safe.left, safe.width),
    y: axis(camera.y, world.y, world.h, safe.top, safe.height),
  };
}
