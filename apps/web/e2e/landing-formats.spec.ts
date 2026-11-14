import { expect, type Page, test } from "@playwright/test";

// The landing's two new sections (landing/formats.tsx). The local catalog has published routes,
// so the real cards show and the example shapes do not; the empty catalog's examples are covered
// in test/storefront-home.test.tsx, since emptying the shared catalog here would break other files.
// Under reduced motion, no scene moves.

const FORMATS = ".fm-tile, .fm-tile *";

const running = (page: Page, selector: string) =>
  page.evaluate(
    (s) =>
      document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect).target?.matches?.(s))
        .map((a) => (a as CSSAnimation).animationName),
    selector,
  );

test("with published routes, the landing shows their real cards and no example", async ({
  page,
}) => {
  await page.goto("/es");
  await expect(page.getByRole("heading", { name: "Rutas para empezar" })).toBeVisible();
  await expect(page.locator("a.route-card").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cada ruta tiene su forma." })).toHaveCount(0);
  await expect(page.getByText("Ejemplo", { exact: true })).toHaveCount(0);
  await expect(page.locator(".fm-tile")).toHaveCount(5);
});

test("the formats' scenes play, and under reduced motion none does", async ({ page }) => {
  await page.goto("/es");
  await page.locator(".fm-bento").scrollIntoViewIfNeeded();
  expect((await running(page, FORMATS)).length).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/es");
  await page.locator(".fm-bento").scrollIntoViewIfNeeded();
  expect(await running(page, FORMATS)).toEqual([]);
});
