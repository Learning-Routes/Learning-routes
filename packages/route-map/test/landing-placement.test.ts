import { describe, expect, test } from "vitest";
import { at } from "../src/at-index";
import { isPhone, restingCamera, shotFor, spotFor, stageCamera } from "../src/landing-cameras";
import { buildLandingModel } from "../src/landing-model";
import { layoutPanel, type TextShape } from "../src/landing-placement";
import shapes from "./fixtures/landing-text-shapes.json";

// v1's test (STEP 41 §2.2), with v1's measured text shapes: the placement must keep
// every panel's text clear of the map. e2e/landing-stage.spec.ts holds the same for the
// real copy in a browser.

type Measured = { stage: number[]; texts: { w: number; h: number; shape: number[][] }[] };
const LOCALES = shapes as unknown as Record<string, Record<string, Measured>>;
const VIEWPORTS = ["1440x900", "1280x720", "1024x768", "1920x1080", "768x1024", "390x844"];
const model = buildLandingModel();

function layout({ stage, texts }: Measured) {
  const [width = 0, height = 0] = stage;
  return texts.map(({ w, h, shape }, panel) => {
    const text = { w, h, shape: shape as unknown as TextShape };
    return layoutPanel(model, panel, width, height, text);
  });
}

describe.each(Object.keys(LOCALES))("%s", (locale) => {
  test.each(VIEWPORTS)("at %s every panel's text overlaps nothing", (viewport) => {
    const laid = layout(LOCALES[locale]?.[viewport] as Measured);
    expect(laid.map(({ slot }) => slot.hits)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test.each([...VIEWPORTS, "360x740"])(
    "at %s the hero stays where the page drew it, so the map never moves it",
    (viewport) => {
      const measured = LOCALES[locale]?.[viewport] as Measured;
      const [width = 0, height = 0] = measured.stage;
      const { spot } = spotFor(0, isPhone(width));
      const hero = at(layout(measured), 0).slot;
      expect(hero.x).toBeCloseTo(isPhone(width) ? 20 : spot[0] * width);
      expect(hero.y).toBeCloseTo(spot[1] * height);
    },
  );

  test("at 360x740 the hero clears the map because the camera gives way", () => {
    const laid = layout(LOCALES[locale]?.["360x740"] as Measured);
    expect(laid.map(({ slot }) => slot.hits)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(at(laid, 0).pullBack).toBeGreaterThan(1);
    expect(at(laid, 0).pullBack).toBeLessThanOrEqual(1.55);
  });
});

test("a point on the sheets' plane projects to the screen and back", () => {
  const camera = stageCamera(restingCamera(shotFor(2, false), 1440 / 836), 1440, 836);
  const p = at(model.modules[0].heads, 2);
  const seen = camera.project(p);
  const back = camera.hitPlane(seen.x, seen.y, p.y);
  expect(seen.x).toBeGreaterThan(0);
  expect(seen.x).toBeLessThan(1440);
  expect(seen.y).toBeGreaterThan(0);
  expect(seen.y).toBeLessThan(836);
  expect(back.x).toBeCloseTo(p.x, 6);
  expect(back.y).toBeCloseTo(p.y, 6);
  expect(back.z).toBeCloseTo(p.z, 6);
});

test("the map keeps its shape: six, five and four stops, three modules, extra practice under step 3", () => {
  expect(model.modules.map(({ heads }) => heads.length)).toEqual([6, 5, 4]);
  expect(model.extra.stops).toHaveLength(3);
  expect(model.modules.map(({ isLocked }) => isLocked)).toEqual([false, false, true]);
  expect(model.route).toHaveLength(3 + 6 + 5 + 4);
  expect(model.itinerary).toHaveLength(9);
});
