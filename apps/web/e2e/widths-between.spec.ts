import { expect, test } from "@playwright/test";
import { DEV, SCREENS } from "./screens";

// The visual baselines stand at 390 and 1440 px. These hold what broke between them: a laptop
// window that shares the screen, a small tablet, and a catalog with a single route in it.

test.use({ locale: "es-ES" });

test("a route alone on the landing keeps a card's width", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(`${DEV}/es`);
  const cards = page.locator(".landing-routes-grid > li");
  await cards.first().scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    for (const card of [...document.querySelectorAll(".landing-routes-grid > li")].slice(1)) {
      card.remove();
    }
  });
  await expect(cards).toHaveCount(1);
  const box = await cards.first().boundingBox();
  expect(box?.width).toBeLessThan(420);
  expect(box?.height).toBeLessThan(700);
});

test("the catalog shows two routes across on a small tablet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`${DEV}/es/explorar`);
  const cards = page.locator(".catalog-grid > li");
  const [first, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(first?.y).toBe(second?.y);
  expect(first?.height).toBeLessThan(700);
});

test("in a laptop window the frame stands at the side, and says the way on once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await SCREENS["my-routes"]?.(page);
  const frame = page.locator(".shell");
  const title = page.getByRole("heading", { level: 1 });
  // At the side: the frame is as tall as the window and the page starts to its right.
  expect((await frame.boundingBox())?.height).toBe(800);
  expect((await title.boundingBox())?.x).toBeGreaterThan(270);
  // Mis rutas opens with the route one is on, so the frame does not repeat it.
  await expect(page.locator(".shell-on")).toBeHidden();
  const edge = (await title.boundingBox())?.x;
  await page.goto(`${DEV}/avisos`);
  await expect(page.locator(".shell-on")).toBeVisible();
  // And a narrow page starts at the same edge as a wide one.
  expect((await page.getByRole("heading", { level: 1 }).boundingBox())?.x).toBe(edge);
});
