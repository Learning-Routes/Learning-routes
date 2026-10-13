// WP-37 §3.2-3.4 — camera math for the journey map. Pure: no DOM.
//
// A camera is { x, y, k }: a world point p appears at p * k + (x, y) in
// viewport-local pixels. World boxes are { x, y, w, h } (from
// journey_map_layout.js); screen rects are { left, top, width, height }.

// THE SAFE AREA. Everything that asks "is it on screen?" — the initial camera,
// Fit, the rail, focus-follows-camera — means the viewport MINUS the overlays
// drawn over it (the fixed topbar, the controls, the rail, the list link). Each
// overlay insets the one viewport edge it costs the least to clear, measured as
// a fraction of that dimension: a full-width bar insets the top, a corner button
// group the nearer short side, a thin rail the right.
export function safeRect(viewport, overlays = []) {
  const inset = { top: 0, bottom: 0, left: 0, right: 0 };
  const vRight = viewport.left + viewport.width;
  const vBottom = viewport.top + viewport.height;
  for (const o of overlays) {
    if (!o || o.width <= 0 || o.height <= 0) continue;
    const oRight = o.left + o.width;
    const oBottom = o.top + o.height;
    if (oRight <= viewport.left || o.left >= vRight || oBottom <= viewport.top || o.top >= vBottom) continue;
    const options = [
      ["top", oBottom - viewport.top, viewport.height],
      ["bottom", vBottom - o.top, viewport.height],
      ["left", oRight - viewport.left, viewport.width],
      ["right", vRight - o.left, viewport.width]
    ];
    const [side, amount] = options.reduce((best, c) => (c[1] / c[2] < best[1] / best[2] ? c : best));
    inset[side] = Math.max(inset[side], amount);
  }
  return {
    left: viewport.left + inset.left,
    top: viewport.top + inset.top,
    width: Math.max(0, viewport.width - inset.left - inset.right),
    height: Math.max(0, viewport.height - inset.top - inset.bottom)
  };
}

export function clampScale(k, { min = 0.05, max = 2 } = {}) {
  return Math.min(max, Math.max(min, k));
}

export function centerOn(point, safe, k) {
  return { x: safe.left + safe.width / 2 - point.x * k, y: safe.top + safe.height / 2 - point.y * k, k };
}

const centerOf = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

export function fitCamera(box, safe, { padding = 32, min = 0.05, max = 1 } = {}) {
  const k = clampScale(
    Math.min((safe.width - 2 * padding) / box.w, (safe.height - 2 * padding) / box.h),
    { min, max }
  );
  return centerOn(centerOf(box), safe, k);
}

export function zoomAbout(camera, point, factor, range) {
  const k = clampScale(camera.k * factor, range);
  const wx = (point.x - camera.x) / camera.k;
  const wy = (point.y - camera.y) / camera.k;
  return { x: point.x - wx * k, y: point.y - wy * k, k };
}

export function screenBox(camera, box) {
  return { left: box.x * camera.k + camera.x, top: box.y * camera.k + camera.y,
           width: box.w * camera.k, height: box.h * camera.k };
}

// The smallest camera move that brings `box` inside the safe rect (with margin).
// A box larger than the rect is aligned to its top-left.
export function ensureVisible(camera, box, safe, margin = 24) {
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

// §3.4. Fit the current module, never zoomed past 1x and never below the scale
// that keeps labels legible. If the whole module fits at that scale, centre it;
// otherwise centre the current node. With no module (nothing readable), centre
// the given node — the root — at 1x.
export function initialCamera({ moduleBox, node, safe, minScale, padding = 24 }) {
  if (!moduleBox) return centerOn(centerOf(node), safe, 1);
  const fit = Math.min((safe.width - 2 * padding) / moduleBox.w, (safe.height - 2 * padding) / moduleBox.h);
  const k = clampScale(fit, { min: minScale, max: 1 });
  const fits = moduleBox.w * k <= safe.width - 2 * padding + 0.5 &&
               moduleBox.h * k <= safe.height - 2 * padding + 0.5;
  return centerOn(centerOf(fits ? moduleBox : node), safe, k);
}
