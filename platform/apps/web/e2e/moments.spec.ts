import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";

// Each page's one moment (Platform STEP 6 §3), and its switch: without `moment` on the page's
// root the page is quiet. Under reduced motion, nothing moves (motion-and-layout.spec.ts).

const CATALOG = `${DEV}/es/explorar`;
const ROUTE = `${creatorHost("mariana-ortega")}/portugues-para-viajar`;

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
  expect(await running(page, ".rf-drawn")).toContain("route-line-draw");
  expect(await running(page, ".rf-runner")).toContain("route-line-run");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
  for (let press = 0; press < 30; press++) {
    await page.keyboard.press("Tab");
    if (await page.locator(".route-card:focus-visible").count()) {
      break;
    }
  }
  await expect(page.locator(".route-card:focus-visible")).toHaveCount(1);
  expect(await running(page, ".rf-drawn")).toContain("route-line-draw");
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
  expect(await page.locator(".creator-weave .weave-over").count()).toBeGreaterThan(1);
  expect(await running(page, ".creator-weave .weave-over")).toContain("rf-trace");
});

test("creator: one route gets one bold line", async ({ page }) => {
  await page.goto(creatorHost("andres-mora"));
  await expect(page.locator(".creator-weave-one .weave-over")).toHaveCount(1);
});

test("route: the line lights as you scroll, one station in gold, and the start card stays put", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(ROUTE);
  await expect(page.locator(".journey-drawn .journey-lit")).toHaveCount(1);
  const lit = () => page.locator(".journey-lit-stop").count();
  const before = await lit();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(lit).toBeGreaterThan(before);
  await expect(page.locator(".journey-middle")).toHaveCount(1);
  const top = await page
    .locator(".start-card")
    .evaluate((card) => card.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
});

test("route: with no script, every station is still there with its own mark", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(ROUTE);
  await expect(page.locator(".journey-stop-exam")).toBeVisible();
  expect(await page.locator(".journey-stop").count()).toBeGreaterThan(5);
  await context.close();
});

test("every route line has its real shape: a ring per module, a dot per topic, one diamond", async ({
  page,
}) => {
  await page.goto(CATALOG);
  const card = page.locator(".route-card").first();
  await expect(card.locator(".rf-exam")).toHaveCount(1);
  expect(await card.locator(".rf-ring").count()).toBeGreaterThan(0);
  expect(await card.locator(".rf-topic").count()).toBeGreaterThan(0);
});

test("the page opens once: words rise and lines trace; a filter's new page does not", async ({
  page,
}) => {
  await page.goto(CATALOG);
  expect(await running(page, ".w > span")).toContain("word-rise");
  expect(await running(page, ".rf-track")).toContain("rf-trace");
  await page.goto(`${CATALOG}?tema=idiomas`);
  await expect(page.locator("main.opening")).toHaveCount(0);
  expect(await running(page, ".w > span")).toEqual([]);
});

test("the active filter is one pill, named so it slides from choice to choice", async ({
  page,
}) => {
  await page.goto(CATALOG);
  await expect(page.locator(".catalog-topic-pill")).toHaveCount(1);
  const name = await page
    .locator(".catalog-topic-pill")
    .evaluate((pill) => getComputedStyle(pill).viewTransitionName);
  expect(name).toBe("topic-pill");
});

test("titles have depth, and the pointer moves the light without lifting it above the title", async ({
  page,
}) => {
  await page.goto(CATALOG);
  const title = page.locator("h1.depth-1");
  expect(await title.evaluate((h1) => getComputedStyle(h1).textShadow)).not.toBe("none");
  const lightY = () =>
    page.evaluate(() => document.documentElement.style.getPropertyValue("--light-y"));
  await page.mouse.move(100, 100);
  await page.mouse.move(1000, 700);
  await expect.poll(lightY).not.toBe("");
  expect(Number(await lightY())).toBeGreaterThan(0);
});

test("the switch: without `moment` on the root the catalog is quiet and the weave is gone", async ({
  page,
}) => {
  await page.goto(CATALOG);
  await page.evaluate(() => document.querySelector(".moment")?.classList.remove("moment"));
  await page.locator(".route-card").first().hover();
  expect(await running(page, ".rf-drawn, .rf-runner")).toEqual([]);
  await page.goto(creatorHost("mariana-ortega"));
  await page.evaluate(() => document.querySelector(".moment")?.classList.remove("moment"));
  await expect(page.locator(".creator-weave")).toBeHidden();
});
