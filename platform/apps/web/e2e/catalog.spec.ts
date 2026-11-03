import { expect, test } from "@playwright/test";
import { DEV } from "./screens";

// The catalog, against the local database and its invented fixtures (Platform STEP 4 §3).

const CATALOG = `${DEV}/es/explorar`;
const CARDS = ".route-card";
const PORTUGUESE_CARD = /Portugués para viajar/;

test.describe("with no JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("lists only approved routes, and links each to its creator's host", async ({ page }) => {
    await page.goto(CATALOG);
    const titles = await page.locator(`${CARDS} h2`).allTextContents();
    expect(titles).toEqual(
      expect.arrayContaining(["Portugués para viajar", "Cálculo sin miedo", "Guitarra desde cero"]),
    );
    // Requested, and never published: neither is listed.
    expect(titles).not.toContain("Portugués para el trabajo");
    expect(titles).not.toContain("Borrador que nadie debe ver");
    await expect(page.getByRole("link", { name: PORTUGUESE_CARD })).toHaveAttribute(
      "href",
      "http://mariana-ortega.localhost:4174/portugues-para-viajar",
    );
  });

  test("searches through the plain form", async ({ page }) => {
    await page.goto(CATALOG);
    await page.getByLabel("Buscar rutas").fill("guitara");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.locator(`${CARDS} h2`)).toHaveText(["Guitarra desde cero"]);
    expect(new URL(page.url()).searchParams.get("q")).toBe("guitara");
  });

  test("filters through plain links, and clears them", async ({ page }) => {
    await page.goto(CATALOG);
    await page.getByRole("link", { name: "Música" }).click();
    await expect(page.locator(`${CARDS} h2`)).toHaveText(["Guitarra desde cero"]);
    await page.getByRole("link", { name: "Negocios" }).click();
    await expect(page.getByText("No encontramos rutas de Negocios")).toBeVisible();
    await page.getByRole("link", { name: "Quitar los filtros" }).click();
    expect(new URL(page.url()).search).toBe("");
  });

  test("says when a search finds nothing", async ({ page }) => {
    await page.goto(`${CATALOG}?q=zzzzzz`);
    await expect(page.getByText("No encontramos rutas para «zzzzzz»")).toBeVisible();
  });
});

test("is cached and names its tags", async ({ request }) => {
  const response = await request.get(CATALOG);
  expect(response.headers()["cache-control"]).toContain("s-maxage=300");
  expect(response.headers()["cache-tag"]).toContain("catalog");
  expect(response.headers()["cache-tag"]).toContain("route:");
});

test("/explorar goes to the source locale's catalog", async ({ request }) => {
  const response = await request.get(`${DEV}/explorar`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/es/explorar");
});

test("a locale that does not exist has no catalog", async ({ request }) => {
  expect((await request.get(`${DEV}/xx/explorar`)).status()).toBe(404);
});
