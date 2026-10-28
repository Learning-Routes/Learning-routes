import { expect, test } from "vitest";
import { tiltFor } from "../src/card_tilt";

// STEP 41 §1.3: a card you can act on tilts towards the pointer, at most 3°,
// and its highlight follows the pointer. Pure, like the journey modules.

test("the centre is flat, with the highlight on it", () => {
  expect(tiltFor(0.5, 0.5)).toEqual({ rx: 0, ry: 0, mx: 50, my: 50 });
});

test("the corners lean towards the pointer, never past 3 degrees", () => {
  const topRight = tiltFor(1, 0);
  const bottomLeft = tiltFor(0, 1);

  expect([topRight.rx, topRight.ry]).toEqual([2.5, 3]);
  expect([bottomLeft.rx, bottomLeft.ry]).toEqual([-2.5, -3]);
});

test("a pointer outside the card counts as its edge", () => {
  expect(tiltFor(1.4, -0.3)).toEqual(tiltFor(1, 0));
});
