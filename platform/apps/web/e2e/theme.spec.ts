import { expect, test } from "@playwright/test";

const DEV = "http://localhost:4174";
const ANY = /.*/;

test("the components page does not exist in production, and does in development", async ({
  request,
}) => {
  expect((await request.get("/studio/_design")).status()).toBe(404);
  expect((await request.get(`${DEV}/studio/_design`)).status()).toBe(200);
});

test("the toggle works with no script, stays on its host, and comes back to the page", async ({
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

test("a storefront's HTML never varies by the cookie", async ({ request }) => {
  const plain = await request.get("/es");
  const withCookie = await request.get("/es", { headers: { cookie: "lr_theme=dark" } });
  expect(await withCookie.text()).not.toContain("data-theme");
  expect(await plain.text()).not.toContain("data-theme");
});

test("a host that is not the app's gets no theme cookie", async ({ request }) => {
  const response = await request.post("/theme", {
    form: { theme: "dark", next: "/es" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});
