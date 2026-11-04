import { expect, test } from "@playwright/test";
import { creatorHost } from "./screens";

// A creator's page and a route's page, on the creator's own host (Platform STEP 4 §5),
// against the local database and its invented fixtures. Through the browser, which
// resolves [slug].localhost by itself.

const MARIANA = creatorHost("mariana-ortega");
const ROUTE = `${MARIANA}/portugues-para-viajar`;
const RUTA = /\/empezar\?ruta=[0-9a-f-]{36}$/;
const NO_JS_MODULE = /Primeros pasos/;
const JSON_LD = 'script[type="application/ld+json"]';

test.describe("with no JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the creator's page shows who they are and their routes", async ({ page }) => {
    await page.goto(MARIANA);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mariana Ortega");
    await expect(page.getByText("Habla portugués en tu próximo viaje.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Hecho con Learning Routes" })).toBeVisible();
    await page.getByRole("link", { name: "Portugués para viajar" }).click();
    expect(new URL(page.url()).pathname).toBe("/portugues-para-viajar");
  });

  test("the route's page says what it holds, and how to start", async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portugués para viajar");
    await expect(
      page.getByText("3 módulos y 14 temas. Para empezar desde cero. En español."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: NO_JS_MODULE })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Examen final" })).toBeVisible();
    await expect(page.getByText("pagas una vez por la ruta: 29,00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Empezar gratis" })).toHaveAttribute("href", RUTA);
  });
});

test("a route's page is cached, tagged, and the same for every visitor", async ({
  page,
  context,
}) => {
  const plain = await page.goto(ROUTE);
  const headers = plain?.headers() ?? {};
  expect(headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
  expect(headers["cache-tag"]).toContain("space:");
  expect(headers["cache-tag"]).toContain("route:");
  expect(headers["set-cookie"]).toBeUndefined();
  const first = await plain?.text();
  await context.addCookies([{ name: "lr_theme", value: "dark", url: MARIANA }]);
  const again = await page.goto(ROUTE);
  expect(await again?.text()).toBe(first);
});

test("an unknown slug is 404, and an archived space is 410", async ({ page }) => {
  expect((await page.goto(creatorHost("nadie-se-llama-asi")))?.status()).toBe(404);
  expect((await page.goto(creatorHost("espacio-cerrado")))?.status()).toBe(410);
  expect((await page.goto(`${creatorHost("espacio-cerrado")}/su-ruta`))?.status()).toBe(410);
  expect((await page.goto(`${MARIANA}/no-existe`))?.status()).toBe(404);
});

test("a draft, an unpublished change and an archived route never appear", async ({ page }) => {
  await page.goto(creatorHost("andres-mora"));
  const html = await page.content();
  expect(html).toContain("Guitarra desde cero");
  expect(html).not.toContain("Título que nadie publicó");
  expect(html).not.toContain("Borrador que nadie debe ver");
  expect(html).not.toContain("Ruta archivada");
  expect((await page.goto(`${creatorHost("andres-mora")}/guitarra-sin-publicar`))?.status()).toBe(
    404,
  );
  expect((await page.goto(`${creatorHost("andres-mora")}/ruta-archivada`))?.status()).toBe(404);
});

test("the brand colour is on the primary action, with no inline style", async ({ page }) => {
  await page.goto(ROUTE);
  const action = page.getByRole("link", { name: "Empezar gratis" });
  await expect(action).toHaveCSS("background-color", "rgb(18, 124, 118)");
  expect(await page.locator("[style]").count()).toBe(0);
});

test("a route's page has its canonical URL, Open Graph and a Course, and only real hreflangs", async ({
  page,
}) => {
  await page.goto(ROUTE);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", ROUTE);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Portugués para viajar",
  );
  const course = JSON.parse((await page.locator(JSON_LD).textContent()) ?? "{}");
  expect(course).toMatchObject({ "@type": "Course", name: "Portugués para viajar" });
  const languages = await page
    .locator('link[rel="alternate"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("hreflang")));
  expect(languages).toEqual(["es", "x-default"]);
});

test("each host has its own sitemap", async ({ page }) => {
  const own = await page.goto(`${MARIANA}/sitemap.xml`);
  expect(own?.headers()["content-type"]).toContain("application/xml");
  const text = (await own?.text()) ?? "";
  expect(text).toContain(`<loc>${ROUTE}</loc>`);
  expect(text).not.toContain("calculo-sin-miedo");
  const platform = await page.goto(`${creatorHost("").replace("//.", "//")}/sitemap.xml`);
  expect(await platform?.text()).toContain("/es/explorar");
});

test("the catalog's card reaches the route's one page", async ({ page }) => {
  await page.goto("http://localhost:4174/es/explorar");
  await page.getByRole("link", { name: "Portugués para viajar" }).click();
  await expect(page).toHaveURL(ROUTE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portugués para viajar");
});

test("no page takes a colour that is not one", async ({ request }) => {
  const origin = "http://localhost:4174";
  expect((await request.get(`${origin}/_brand/127c76.css`)).status()).toBe(200);
  for (const name of ["red.css", "127c76", "127c76.css.js", "127c7g.css"]) {
    expect((await request.get(`${origin}/_brand/${name}`)).status(), name).toBe(404);
  }
});

test("nobody reaches the internal paths directly", async ({ request }) => {
  expect((await request.get("http://localhost:4174/_creador/mariana-ortega")).status()).toBe(404);
});
