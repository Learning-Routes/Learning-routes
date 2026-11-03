import { LOCALES } from "@learning-routes/core/locales";
import { expect, type Page, test } from "@playwright/test";

// The annotated map (Platform STEP 6 §2), in a real browser with WebGL.

const SEARCH = /\/es\/explorar\?q=guitarra/;
const IDEA_SEARCH = /\/es\/explorar\?q=Guitarra/;
const DRAWN = /lp-drawn/;
const SETTLED = /on|static/;
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];

async function openStage(page: Page, path = "/es") {
  await page.goto(`${path}#mapa`);
  await expect(page.locator(".lp-journey")).toHaveAttribute("data-stage", "on", {
    timeout: 30_000,
  });
  await page.evaluate(() => document.fonts.ready);
}

for (const size of SIZES) {
  for (const locale of LOCALES) {
    test(`${locale} at ${size.width}: each panel's text sits clear of the map`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: size, locale });
      const page = await context.newPage();
      await openStage(page, `/${locale}`);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".lp-ann")].map(
          (panel) => JSON.parse(panel.dataset.lay ?? "{}").hits,
        ),
      );
      expect(hits).toEqual([0, 0, 0, 0, 0, 0]);
      await context.close();
    });
  }
}

test("the map arrives without moving the hero, and within the strict CSP", async ({ page }) => {
  const refused: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      refused.push(message.text());
    }
  });
  await page.goto("/es#mapa");
  const before = await page.getByRole("heading", { level: 1 }).boundingBox();
  await expect(page.locator(".lp-journey")).toHaveAttribute("data-stage", "on", {
    timeout: 30_000,
  });
  const after = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(40);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(40);
  expect(refused).toEqual([]);
});

test("three.js loads only after the first paint", async ({ page }) => {
  const stage: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/stage-")) {
      stage.push(request.url());
    }
  });
  await page.goto("/es#mapa", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".lp-journey")).toHaveAttribute("data-stage", "on", {
    timeout: 30_000,
  });
  expect(stage).toHaveLength(1);
});

for (const [name, setUp] of [
  ["reduced motion", { reducedMotion: "reduce" as const }],
  ["no WebGL", {}],
] as const) {
  test(`${name}: three.js never loads, and every panel is there to read`, async ({ browser }) => {
    const context = await browser.newContext(setUp);
    const page = await context.newPage();
    if (name === "no WebGL") {
      await page.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => null;
        Reflect.deleteProperty(window, "OffscreenCanvas");
      });
    }
    const stage: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/assets/stage-")) {
        stage.push(request.url());
      }
    });
    await page.goto("/es#mapa");
    await expect(page.locator(".lp-journey")).toHaveAttribute("data-stage", "static");
    expect(stage).toEqual([]);
    await expect(page.getByRole("heading", { level: 2, name: "Un tema a la vez" })).toBeVisible();
    await expect(page.locator(".lp-world")).toBeHidden();
    await context.close();
  });
}

test("without a real GPU the page stays on its text, unless #mapa asks for the map", async ({
  page,
}) => {
  await page.goto("/es");
  const stage = page.locator(".lp-journey");
  await expect(stage).toHaveAttribute("data-stage", SETTLED, { timeout: 30_000 });
  const hasGpu = await page.evaluate(() => {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const lower = name.toLowerCase();
    return !["swiftshader", "llvmpipe", "software"].some((word) => lower.includes(word));
  });
  await expect(stage).toHaveAttribute("data-stage", hasGpu ? "on" : "static");
});

test("the example tabs change the map, and the panels' links only take focus when shown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStage(page);
  const stage = await page
    .locator(".lp-journey")
    .evaluate((journey) => journey.getBoundingClientRect().top);
  await page.evaluate((y) => window.scrollTo(0, window.scrollY + y + innerHeight * 2), stage);
  const python = page.getByRole("button", { name: "Python", exact: true });
  await expect(python).toBeVisible();
  await python.click();
  await expect(python).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".lp-mr b")).toHaveText("Python desde cero");
  await expect(page.locator(".lp-ann").last().getByRole("link")).toHaveAttribute("tabindex", "-1");
});

test("the map's names and canvas are hidden from assistive technology", async ({ page }) => {
  await openStage(page);
  await expect(page.locator(".lp-world")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".lp-labels")).toHaveAttribute("aria-hidden", "true");
});

test("the field searches the catalog, with and without JavaScript", async ({ browser }) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({
      javaScriptEnabled,
      reducedMotion: "reduce",
      locale: "es-ES",
    });
    const page = await context.newPage();
    await page.goto("/es");
    await page.locator("#lp-want").fill("guitarra");
    await page.getByRole("button", { name: "Buscar rutas" }).click();
    await expect(page).toHaveURL(SEARCH);
    await context.close();
  }
});

test("an idea fills the field, and without JavaScript it is a link to the search", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce", locale: "es-ES" });
  const page = await context.newPage();
  await page.goto("/es");
  await page.getByRole("link", { name: "Guitarra para empezar" }).click();
  await expect(page.locator("#lp-want")).toHaveValue("Guitarra");
  await context.close();
  const plain = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
  const noScript = await plain.newPage();
  await noScript.goto("/es");
  await noScript.getByRole("link", { name: "Guitarra para empezar" }).click();
  await expect(noScript).toHaveURL(IDEA_SEARCH);
  await plain.close();
});

test("asking draws the first module with the words on its chip, then searches", async ({
  page,
}) => {
  await openStage(page);
  await page.locator("#lp-want").fill("guitarra");
  await page.getByRole("button", { name: "Buscar rutas" }).click();
  await expect(page.locator(".lp-c1 b")).toHaveText("Guitarra");
  await expect(page.locator(".lp-plan")).toHaveClass(DRAWN);
  await expect(page).toHaveURL(SEARCH);
});

test("leaving the page disposes the stage and keeps no script error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openStage(page);
  await page.getByRole("link", { name: "Explorar rutas" }).first().click();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
