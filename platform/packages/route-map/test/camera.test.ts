import { expect, test } from "vitest";
import {
  type Box,
  clampCamera,
  ensureVisible,
  fitCamera,
  leashRange,
  type Rect,
  revealTitle,
  safeRect,
  screenBox,
  zoomAbout,
} from "../src/camera";

// WP-37 §3.2-3.4. Camera math, pure. ONE safe area — the viewport minus the
// overlays — is what (c), Fit, the rail and focus-follows-camera all mean.
const DESKTOP: Rect = { left: 0, top: 0, width: 1440, height: 1000 };
const PHONE: Rect = { left: 0, top: 0, width: 390, height: 844 };
const TOPBAR: Rect = { left: 0, top: 0, width: 1440, height: 52 };
const CONTROLS: Rect = { left: 1290, top: 924, width: 134, height: 44 };
const RAIL: Rect = { left: 1415, top: 440, width: 10, height: 120 };

function expectInside(screen: Rect, safe: Rect): void {
  expect(screen.left).toBeGreaterThanOrEqual(safe.left - 0.01);
  expect(screen.top).toBeGreaterThanOrEqual(safe.top - 0.01);
  expect(screen.left + screen.width).toBeLessThanOrEqual(safe.left + safe.width + 0.01);
  expect(screen.top + screen.height).toBeLessThanOrEqual(safe.top + safe.height + 0.01);
}

// Ruby's assert_in_delta: |expected − actual| <= delta.
function expectNear(expected: number, actual: number, delta: number, message?: string): void {
  expect(Math.abs(expected - actual), message).toBeLessThanOrEqual(delta);
}

test("a full-width bar at the top insets the top", () => {
  const safe = safeRect(DESKTOP, [TOPBAR]);
  expect(safe).toEqual({ left: 0, top: 52, width: 1440, height: 948 });
});

test("each overlay insets the edge that costs the least, and overlays outside are ignored", () => {
  const outside = { left: 2000, top: 10, width: 50, height: 50 };
  const safe = safeRect(DESKTOP, [TOPBAR, CONTROLS, RAIL, outside]);
  expect(safe.top).toBe(52);
  expect(1000 - (safe.top + safe.height), "the controls inset the bottom").toBe(1000 - 924);
  expect(1440 - (safe.left + safe.width), "the rail insets the right").toBe(1440 - 1415);
  expect(safe.left).toBe(0);
});

test("on a phone the same overlays leave a usable rect", () => {
  const phoneControls = { left: 246, top: 784, width: 134, height: 44 };
  const phoneRail = { left: 365, top: 362, width: 10, height: 120 };
  const safe = safeRect(PHONE, [
    { left: 0, top: 0, width: 390, height: 72 },
    phoneControls,
    phoneRail,
  ]);
  expect(safe.width).toBeGreaterThanOrEqual(340);
  expect(safe.height).toBeGreaterThanOrEqual(700);
});

test("zooming about a point keeps that point fixed", () => {
  const cam = zoomAbout({ x: 100, y: 50, k: 1 }, { x: 400, y: 300 }, 1.5, { min: 0.1, max: 2 });
  const worldBefore = [(400 - 100) / 1.0, (300 - 50) / 1.0];
  expectNear(400, worldBefore[0] * cam.k + cam.x, 1e-6);
  expectNear(300, worldBefore[1] * cam.k + cam.y, 1e-6);
});

test("zoom is clamped", () => {
  expect(zoomAbout({ x: 0, y: 0, k: 1.8 }, { x: 0, y: 0 }, 4, { min: 0.1, max: 2 }).k).toBe(2);
});

test("fit puts the whole box inside the safe rect", () => {
  const safe = safeRect(DESKTOP, [TOPBAR]);
  const box = { x: -84, y: 0, w: 2400, h: 3000 };
  const cam = fitCamera(box, safe, { padding: 32, min: 0.05, max: 1 });
  const s = screenBox(cam, box);
  expectInside(s, safe);
});

test("ensureVisible moves an off-screen box just inside the safe rect", () => {
  const safe = safeRect(DESKTOP, [TOPBAR]);
  const box = { x: 3000, y: 2000, w: 168, h: 88 };
  const cam = ensureVisible({ x: 0, y: 0, k: 1 }, box, safe, 24);
  expectInside(screenBox(cam, box), safe);
});

// The route's title is the root block at the top of the world.
const TITLE: Box = { x: -180, y: 0, w: 360, h: 76 };

test("revealTitle brings a title half under the bar clear of it when the step stays in view", () => {
  const safe = safeRect(DESKTOP, [TOPBAR]);
  const step = { x: 0, y: 400, w: 40, h: 40 };
  const cam = revealTitle({ x: 0, y: 30, k: 1 }, TITLE, step, safe, 16);
  expect(TITLE.y + cam.y).toBe(52 + 16);
  expectInside(screenBox(cam, step), safe);
});

test("revealTitle leaves a clear title alone", () => {
  const safe = safeRect(DESKTOP, [TOPBAR]);
  expect(
    revealTitle({ x: 0, y: 100, k: 1 }, TITLE, { x: 0, y: 400, w: 40, h: 40 }, safe, 16),
  ).toEqual({ x: 0, y: 100, k: 1 });
});

test("when title and step cannot both fit, the step stays and the title goes wholly off the top", () => {
  const safe = safeRect({ left: 0, top: 0, width: 1440, height: 300 }, [TOPBAR]);
  const step = { x: 0, y: 200, w: 40, h: 40 };
  const cam = revealTitle({ x: 0, y: -24, k: 1 }, TITLE, step, safe, 16);
  expect(TITLE.y + TITLE.h + cam.y).toBe(0);
  expectInside(screenBox(cam, step), safe);
});

// STEP 38 §4, the leash: the content box plus a margin is the world; the
// camera never shows past it, and zoom runs from fit-to-width to 2× that.
const WORLD: Box = { x: -40, y: -40, w: 880, h: 2400 };

test("a drag of 10,000 px in any direction leaves the world covering the screen", () => {
  const safe = { ...DESKTOP, top: 52, height: 948 };
  const k = leashRange(WORLD, safe).min;
  for (const [dx, dy] of [
    [10_000, 0],
    [-10_000, 0],
    [0, 10_000],
    [0, -10_000],
    [10_000, 10_000],
  ]) {
    const cam = clampCamera({ x: dx, y: dy, k }, WORLD, safe);
    const s = screenBox(cam, WORLD);
    expect(s.top, `dragged ${dx},${dy}: a gap above the world`).toBeLessThanOrEqual(
      safe.top + 0.01,
    );
    expect(s.top + s.height, `dragged ${dx},${dy}: a gap below`).toBeGreaterThanOrEqual(
      safe.top + safe.height - 0.01,
    );
    expectNear(
      safe.left + safe.width / 2.0,
      s.left + s.width / 2.0,
      0.01,
      "the world fits the width, so it stays centred across it",
    );
  }
});

test("a world narrower than the screen at this zoom is centred, not pushed off", () => {
  const cam = clampCamera({ x: -5000, y: 0, k: 0.2 }, WORLD, DESKTOP);
  const s = screenBox(cam, WORLD);
  expectNear(720, s.left + s.width / 2.0, 0.01);
  expectNear(500, s.top + s.height / 2.0, 0.01);
});

test("zoom runs from fit-to-width to twice that", () => {
  const range = leashRange(WORLD, PHONE);
  expectNear(390.0 / 880, range.min, 1e-9);
  expectNear((2 * 390.0) / 880, range.max, 1e-9);
});

test("the fitted scale is held between the legible floor and 1", () => {
  const floor = 12 / 13.0;
  expectNear(
    floor,
    leashRange(WORLD, PHONE, { floor, ceiling: 1 }).min,
    1e-9,
    "a phone fit-to-width under the floor would make labels illegible",
  );
  expectNear(
    1,
    leashRange({ x: 0, y: 0, w: 600, h: 900 }, DESKTOP, { floor, ceiling: 1 }).min,
    1e-9,
    "a small route is not blown up past its drawn size",
  );
  expectNear(
    2,
    leashRange({ x: 0, y: 0, w: 600, h: 900 }, DESKTOP, { floor, ceiling: 1 }).max,
    1e-9,
  );
});
