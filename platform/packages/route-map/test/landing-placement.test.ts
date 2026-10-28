import { expect, test } from "vitest";
import { at } from "../src/at-index";
import { camera, camFor, restFor } from "../src/landing-camera";
import { buildModel } from "../src/landing-model";
import { layoutPanel } from "../src/landing-placement";
import SHAPES from "./fixtures/landing-text-shapes.json" with { type: "json" };

// STEP 41 §2.2, the owner's main point: each panel's text sits on a free spot of
// the map — never over a stop or its name, a leg, the fan, a sheet's edge, a
// module chip, the root title or the stage's controls. Run against the real
// geometry, with the text shapes the landing measures (headline over body), in
// both locales; fixtures/landing-text-shapes.json is re-measured whenever the
// landing's copy or type changes (a system test reading each text's data-lay).
const VIEWPORTS = ["1440x900", "1280x720", "1024x768", "1920x1080", "768x1024", "390x844"];

interface TextShape {
  w: number;
  h: number;
  shape: number[][];
}

interface Viewport {
  stage: number[];
  texts: TextShape[];
}

const SHAPE_SETS: Record<string, Record<string, Viewport>> = SHAPES;

function viewportOf(locale: string, viewport: string): Viewport {
  const found = SHAPE_SETS[locale]?.[viewport];
  if (!found) {
    throw new Error(`no text shapes for ${locale} at ${viewport}`);
  }
  return found;
}

function layout(viewport: Viewport): { hits: number; d: number }[] {
  const [w, h] = [at(viewport.stage, 0), at(viewport.stage, 1)];
  const model = buildModel();
  return viewport.texts.map((t, i) => {
    const l = layoutPanel(model, i, w, h, t.w, t.h, t.shape);
    return { hits: l.slot.hits, d: l.d };
  });
}

for (const locale of ["es", "en"]) {
  for (const viewport of VIEWPORTS) {
    test(`${locale} at ${viewport}: every panel's text overlaps nothing`, () => {
      const laid = layout(viewportOf(locale, viewport));
      laid.forEach((l, i) => {
        expect(
          l.hits,
          `panel ${i} covers ${l.hits} points of the map at ${viewport} (${locale})`,
        ).toBe(0);
      });
    });
  }

  // The reference left the hero 4 points over the origin marker here.
  test(`${locale} at 360x740: the hero clears the map; the camera gives way to do it`, () => {
    const laid = layout(viewportOf(locale, "360x740"));
    expect(laid.map((l) => l.hits)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(at(laid, 0).d, "the hero only clears by pulling the camera back").toBeGreaterThan(1);
    expect(at(laid, 0).d, "the camera pulls back no further than ×1.55").toBeLessThanOrEqual(1.55);
  });
}

test("a point on the sheets' plane projects to the screen and back", () => {
  const model = buildModel();
  const Wd = 1440;
  const H = 836;
  const r = restFor(camFor(2, false), Wd / H);
  const cam = camera(r.pos, r.tgt, Wd, H);
  const p = at(at(model.mods, 0).heads, 2);
  const s = cam.project(p);
  const back = cam.hitPlane(s.x, s.y, p.y);
  expect(s.x >= 0 && s.x <= 1440 && s.y >= 0 && s.y <= 836, "step 3 is on screen at panel 2").toBe(
    true,
  );
  for (const k of ["x", "y", "z"] as const) {
    expect(Math.abs(p[k] - back[k])).toBeLessThanOrEqual(1e-6);
  }
});

test("the map is WP-37b's: six and five stops, three modules, the fan of three under step 3", () => {
  const model = buildModel();
  expect(model.mods.map((md) => md.heads.length)).toEqual([6, 5, 4]);
  expect(at(model.mods, 0).fan?.kids.length).toBe(3);
  expect(model.mods.map((md) => !!md.locked)).toEqual([false, false, true]);
  expect(model.route.length, "a spine leg per module, then that module's legs").toBe(3 + 6 + 5 + 4);
  expect(model.itinerary.length).toBe(9);
});
