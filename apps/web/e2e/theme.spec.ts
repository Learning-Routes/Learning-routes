import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const DEV = "http://localhost:4174";
const ANY = /.*/;

test("the components page does not exist in production, and does in development", async ({
  request,
}) => {
  expect((await request.get("/studio/_design")).status()).toBe(404);
  expect((await request.get(`${DEV}/studio/_design`)).status()).toBe(200);
});

test("the toggle works with no script, is one cookie for every host, and comes back to the page", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(`${DEV}/studio/_design`);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", ANY);

  await page.getByRole("button", { name: "Cambiar a modo oscuro" }).click();
  await expect(page).toHaveURL(`${DEV}/studio/_design`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const [cookie] = await context.cookies();
  expect(cookie).toMatchObject({ name: "lr_theme", value: "dark", domain: "localhost" });

  await page.getByRole("button", { name: "Cambiar a modo claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await context.close();
});

test("with no choice the page follows the system, before first paint and with no script", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto(`${DEV}/studio/_design`);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", ANY);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(21, 14, 28)");
  await context.close();
});

test("the web Worker's logs carry no URLs: a query could hold anything", async () => {
  const config = readFileSync("wrangler.jsonc", "utf8");
  expect(config).toContain('"invocation_logs": false');
});

test("a storefront page stays one page for everyone: the theme is added on the way out", async ({
  request,
}) => {
  const dark = await request.get(`${DEV}/es`, { headers: { cookie: "lr_theme=dark" } });
  expect(await dark.text()).toContain('data-theme="dark"');
  // The same cached page, asked without a choice, carries none.
  const plain = await request.get(`${DEV}/es`, { headers: { cookie: "" } });
  expect(await plain.text()).not.toContain("data-theme");
});

test("the platform's host answers the switch, for every host, and only sends back to ours", async ({
  request,
}) => {
  const response = await request.post(`${DEV}/theme`, {
    form: { theme: "dark", next: "https://elsewhere.example/" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(`${DEV}/`);
  expect(response.headers()["set-cookie"]).toContain("lr_theme=dark");
});
