import { expect, test } from "@playwright/test";

const SCRIPT = /<script\b[^>]*>/g;
const ENHANCEMENT = /^<script type="module" src="\/enhance\/[a-z-]+\.js"[^>]*>$/;
const COOKIE = /cookie/i;

for (const path of ["/es", "/es/explorar"]) {
  test(`${path} blocks nothing: at most module scripts of our own, no React, no preload`, async ({
    request,
  }) => {
    const html = await (await request.get(path)).text();

    expect(html).not.toContain("modulepreload");
    expect(html).not.toContain("window.__reactRouter");
    for (const [tag] of html.matchAll(SCRIPT)) {
      expect(tag).toMatch(ENHANCEMENT);
    }
  });

  test(`${path} works with JavaScript off: its text and links are in the HTML`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enseñar", exact: true }).first()).toBeVisible();
    await context.close();
  });
}

test("an app page is hydrated", async ({ page, request }) => {
  const html = await (await request.get("/studio")).text();
  expect(html).toContain('type="module"');

  await page.goto("/studio");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
});

test("a storefront page is cached at the edge and is the same for every visitor", async ({
  request,
}) => {
  const plain = await request.get("/es");
  expect(plain.headers()["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
  expect(plain.headers()["cache-tag"]).toContain("catalog");
  expect(plain.headers()["cache-tag"]).toContain("route:");
  expect(plain.headers()["set-cookie"]).toBeUndefined();
  expect(plain.headers().vary ?? "").not.toMatch(COOKIE);
  const withCookies = await request.get("/es", {
    headers: { cookie: "lr_theme=dark; other=1", "accept-language": "fr" },
  });
  expect(await withCookies.text()).toBe(await plain.text());
});

test("an app page is never kept at the edge", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.headers()["cache-control"] ?? "").not.toContain("s-maxage");
  expect(response.headers()["cache-tag"]).toBeUndefined();
});

test("the landing shows up to three approved routes, and never one that is not", async ({
  request,
}) => {
  const html = await (await request.get("/es")).text();
  expect(html).toContain("Rutas para empezar");
  expect(html).not.toContain("Portugués para el trabajo");
  expect(html).not.toContain("Borrador que nadie debe ver");
});

test("the landing's font never holds up its first paint or moves it", async ({ page }) => {
  await page.goto("/es");
  const headline = page.getByRole("heading", { level: 1 });
  const fallback = await page.evaluate(
    () => getComputedStyle(document.querySelector("h1") as Element).fontFamily,
  );
  expect(fallback).toContain("Archivo Fallback");
  await expect(headline).toBeVisible();
});
