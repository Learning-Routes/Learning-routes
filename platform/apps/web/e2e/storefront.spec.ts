import { expect, test } from "@playwright/test";

const SCRIPT = /<script\b[^>]*>/g;
const COOKIE = /cookie/i;

test("the storefront ships no script at all: no React, no preload, no theme.js", async ({
  request,
}) => {
  const html = await (await request.get("/es")).text();

  expect(html).not.toContain('type="module"');
  expect(html).not.toContain("modulepreload");
  expect(html.match(SCRIPT)).toBeNull();
});

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
  expect(plain.headers()["cache-tag"]).toBe("catalog");
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
