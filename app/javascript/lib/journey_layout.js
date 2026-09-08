// Journey stage geometry. NO DOM, no Stimulus, no CSS — so it can be tested at
// 1, 7, 8, 20 and 43 topics without a browser.
//
// WP-35 §4. The old `getSatPositions` placed EVERY topic of a stage on one arc:
//
//   const arcSpan = Math.PI * 0.9
//   const angle = startAngle + (i / (count - 1)) * arcSpan
//
// The arc is ~523px long and a satellite is ~90px wide, so it holds about six.
// There was no rule for what happens after that, and production has a module
// with 43 steps: forty-three overlapping circles in one ring, labels stacked
// into a knot. The layout failed at 8 on a perfectly healthy route.
//
// The rule here is capacity, computed rather than guessed: how many satellites
// fit along the measured arc at the measured diameter. Whatever does not fit
// goes to a SPINE below the ring — a grid sized to the stage's own width, so it
// stays compact instead of becoming a 3000px column. Nothing is ever placed on
// top of anything else, at any count.

export const DEFAULTS = Object.freeze({
  ringRadius: 185,
  satelliteRadius: 40,
  // Breathing room between two satellite boxes, on the arc and in the spine.
  gap: 14,
  arcSpan: Math.PI * 0.9,
  // The stage's usable width; the spine wraps inside it.
  stageWidth: 720,
  // The centre circle the stage label sits in. `route_journey_controller.js`
  // draws it at r 52 and pulses it to 62; the spine must clear the LARGER one or
  // the pulse eats its first row. The hub is not a satellite, so nothing that
  // only looks at satellites can see a collision with it.
  hubRadius: 62,
  // Never shrink a satellite past this — a circle with a label has a floor.
  minSatelliteRadius: 22
});

// How many boxes of `diameter` fit along an arc of `radius * arcSpan`, leaving
// `gap` between neighbours. At least one: a stage with a single topic puts it on
// the ring, not in the spine.
export function ringCapacity({ ringRadius, satelliteRadius, gap, arcSpan } = DEFAULTS) {
  const arcLength = ringRadius * arcSpan;
  const slot = satelliteRadius * 2 + gap;
  return Math.max(1, Math.floor(arcLength / slot));
}

// Satellites shrink before they overflow, down to the floor. A stage of 8 on a
// ring that holds 6 looks better slightly smaller than split across two places.
export function fittedSatelliteRadius(count, options = DEFAULTS) {
  const { ringRadius, satelliteRadius, gap, arcSpan, minSatelliteRadius } = options;
  if (count <= 1) return satelliteRadius;

  const arcLength = ringRadius * arcSpan;
  const needed = (arcLength / count - gap) / 2;
  if (needed >= satelliteRadius) return satelliteRadius;
  return Math.max(minSatelliteRadius, Math.floor(needed));
}

// The whole layout for one stage.
//
// Returns satellites in the SAME ORDER they were given — the DOM is built in
// this order, so tab order follows the route's own order and reinforcement
// steps stay next to the step that triggered them.
export function layoutStage(count, overrides = {}) {
  const options = { ...DEFAULTS, ...overrides };
  const { ringRadius, gap, arcSpan, stageWidth } = options;

  if (count <= 0) {
    return {
      satellites: [], capacity: 0, satelliteRadius: options.satelliteRadius,
      hubRadius: options.hubRadius, box: emptyBox()
    };
  }

  const r = fittedSatelliteRadius(count, options);
  const capacity = ringCapacity({ ...options, satelliteRadius: r });
  const onRing = Math.min(count, capacity);
  const satellites = [];

  // ── The ring ──
  const startAngle = -Math.PI / 2 - arcSpan / 2;
  for (let i = 0; i < onRing; i++) {
    const angle = onRing === 1
      ? -Math.PI / 2
      : startAngle + (i / (onRing - 1)) * arcSpan;
    satellites.push({
      index: i,
      placement: "ring",
      r,
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius
    });
  }

  // ── The spine ──
  // A grid below the ring, as many columns as the stage width allows. One
  // column is a spine; several are a spine that does not run off the page.
  const overflow = count - onRing;
  if (overflow > 0) {
    const slot = r * 2 + gap;
    const columns = Math.max(1, Math.min(overflow, Math.floor(stageWidth / slot)));

    // Where the spine may start.
    //
    // It used to be `Math.max(ringBottom, ringRadius * Math.sin(-Math.PI / 2)) + slot`,
    // whose second term is always -ringRadius and therefore never won — so it
    // reduced to `ringBottom + slot`. The ring spans -171° to -9°, so its LOWEST
    // satellites sit at y ≈ -29, not at the bottom of the circle, and the first
    // spine row landed at y ≈ +29: on top of the hub and across the stage label.
    //
    // Two constraints now, and the row starts below both: clear of the ring's
    // lowest satellite, and clear of the hub.
    const ringBottom = ringRadius * Math.sin(startAngle + arcSpan);
    const firstRow = Math.max(ringBottom + slot, options.hubRadius + gap + r);

    for (let k = 0; k < overflow; k++) {
      const column = k % columns;
      const row = Math.floor(k / columns);
      const rowWidth = Math.min(columns, overflow - row * columns) * slot - gap;
      const left = -rowWidth / 2 + r;
      satellites.push({
        index: onRing + k,
        placement: "spine",
        r,
        x: left + column * slot,
        y: firstRow + row * slot
      });
    }
  }

  return {
    satellites,
    capacity,
    satelliteRadius: r,
    // Reported so callers and tests use the radius the layout cleared, rather
    // than a second copy of the number that can drift from it.
    hubRadius: options.hubRadius,
    box: boxFor(satellites)
  };
}

// The stage box every satellite must fit inside. The caller sizes the element
// from this, so "inside the stage box" is true by construction rather than by
// hope.
export function boxFor(satellites) {
  if (satellites.length === 0) return emptyBox();

  const left = Math.min(...satellites.map((s) => s.x - s.r));
  const right = Math.max(...satellites.map((s) => s.x + s.r));
  const top = Math.min(...satellites.map((s) => s.y - s.r));
  const bottom = Math.max(...satellites.map((s) => s.y + s.r));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function emptyBox() {
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
}

// Do two satellite BOXES overlap? Boxes, not circles: the label and the ring
// live in the square, and two circles that merely touch still collide visually.
export function boxesIntersect(a, b) {
  return Math.abs(a.x - b.x) < a.r + b.r && Math.abs(a.y - b.y) < a.r + b.r;
}

export function anyOverlap(satellites) {
  for (let i = 0; i < satellites.length; i++) {
    for (let j = i + 1; j < satellites.length; j++) {
      if (boxesIntersect(satellites[i], satellites[j])) return [satellites[i], satellites[j]];
    }
  }
  return null;
}
