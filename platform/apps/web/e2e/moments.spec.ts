import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";

// Each page's one moment (Platform STEP 6 §3), and its switch: without `moment` on the page's
// root the page is quiet. Under reduced motion, nothing moves (motion-and-layout.spec.ts).

const CATALOG = `${DEV}/es/explorar`;
const ROUTE = `${creatorHost("mariana-ortega")}/portugues-para-viajar`;
const VIEW_TIMELINE = "view()";

const running = (page: Page, selector: string) =>
  page.evaluate(
    (s) =>
      document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect).target?.matches?.(s))
        .map((a) => (a as CSSAnimation).animationName),
    selector,
  );

test("catalog: a card's line draws and a gold dot runs it, on hover and on keyboard focus", async ({
  page,
}) => {
  await page.goto(CATALOG);
  const card = page.locator(".route-card").first();
  await card.hover();
  expect(await running(page, ".route-line-way")).toContain("route-line-draw");
  expect(await running(page, ".route-line-runner")).toContain("route-line-run");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await card.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".route-card:focus-visible")).toHaveCount(1);
});

test("catalog: no card fades in on scroll, and each is named for the page transition", async ({
  page,
}) => {
  await page.goto(CATALOG);
  expect(await running(page, ".route-card, .catalog-grid > li")).toEqual([]);
  const names = await page.locator(".catalog-grid > li").evaluateAll((items) =>
    items.map((item) => ({
      wanted: (item as HTMLElement).dataset.vt,
      got: getComputedStyle(item).viewTransitionName,
    })),
  );
  expect(names.length).toBeGreaterThan(0);
  for (const { wanted, got } of names) {
    expect(got).toBe(wanted);
  }
});

test("the pages between them ask for the browser's page transition", async ({ page }) => {
  await page.goto(CATALOG);
  const asked = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) =>
      [...sheet.cssRules].some((rule) => rule.cssText.includes("@view-transition")),
    ),
  );
  expect(asked).toBe(true);
});

test("creator: their routes are woven into a figure, drawn once on load", async ({ page }) => {
  await page.goto(creatorHost("mariana-ortega"));
  await expect(page.locator(".creator-weave")).toBeVisible();
  expect(await page.locator(".creator-weave path").count()).toBeGreaterThan(1);
  expect(await running(page, ".creator-weave path")).toContain("creator-weave-draw");
});

test("creator: one route gets one bold line", async ({ page }) => {
  await page.goto(creatorHost("andres-mora"));
  await expect(page.locator(".creator-weave-one path")).toHaveCount(1);
});

test("route: the rail and the stations follow the scroll, and the start card stays put", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(ROUTE);
  const timeline = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector(".journey-stations") as Element, "::before")
        .animationTimeline,
  );
  expect(timeline).toBe(VIEW_TIMELINE);
  await page.evaluate(() => window.scrollTo(0, 400));
  const top = await page
    .locator(".start-card")
    .evaluate((card) => card.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(64);
});

test("the switch: without `moment` on the root the catalog is quiet and the weave is gone", async ({
  page,
}) => {
  await page.goto(CATALOG);
  await page.evaluate(() => document.querySelector(".moment")?.classList.remove("moment"));
  await page.locator(".route-card").first().hover();
  expect(await running(page, ".route-line-way, .route-line-runner")).toEqual([]);
  await page.goto(creatorHost("mariana-ortega"));
  await page.evaluate(() => document.querySelector(".moment")?.classList.remove("moment"));
  await expect(page.locator(".creator-weave")).toBeHidden();
});
