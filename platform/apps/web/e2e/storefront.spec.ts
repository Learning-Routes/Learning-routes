import { expect, test } from "@playwright/test";

const SCRIPT = /<script\b[^>]*>/g;

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
