import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// A topic (docs/design/reference/vision/pages.html, "Un tema"): the real content of the route the
// student enrolled in. Reading only: saving progress waits for Platform STEP 8.

test.use({ locale: "es-ES" });

const option = (page: Page, text: string) => page.locator(".lesson-option", { hasText: text });

async function onTheFirstTopic(page: Page) {
  await signInContext(page.context(), newAddress("lee"));
  await page.goto(`${creatorHost("mariana-ortega")}/portugues-para-viajar`);
  await page.getByRole("link", { name: "Empezar gratis" }).click();
  await page.getByRole("link", { name: "Seguir", exact: true }).first().click();
  await page.locator(".lesson-title").waitFor();
}

test("a wrong answer shakes, a right one moves the gold dot on and offers the next topic", async ({
  page,
}) => {
  await onTheFirstTopic(page);
  await expect(page.getByText("Módulo 1, tema 1 de 5")).toBeVisible();
  const here = () => page.locator(".lesson-here").getAttribute("cx");
  const start = await here();

  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.getByText("Elige una respuesta para comprobarla.")).toBeVisible();

  await option(page, "Por lo más difícil.").click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.locator(".lesson-option.is-wrong")).toHaveCount(1);
  await expect(page.locator(".lesson-done-band")).toHaveCount(0);

  await option(page, "Por lo que vas a usar mañana.").click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.locator(".lesson-option.is-right")).toHaveCount(1);
  await expect(page.getByText("Tema hecho.")).toBeVisible();
  expect(await here()).not.toBe(start);

  await page.getByRole("link", { name: "Siguiente tema" }).click();
  await expect(page.getByText("Módulo 1, tema 2 de 5")).toBeVisible();
});

test("says plainly that progress is not saved yet, and Mis rutas stays where it was", async ({
  page,
}) => {
  await onTheFirstTopic(page);
  await option(page, "Por lo que vas a usar mañana.").click();
  await page.getByRole("button", { name: "Comprobar" }).click();
  await expect(page.getByText("Por ahora tu avance no se guarda.")).toBeVisible();
  await page.getByRole("link", { name: "Salir" }).click();
  await expect(page.getByText("Vas en el tema 1 de 14.").first()).toBeVisible();
});

test("another person's enrollment does not exist, and a topic past the end neither", async ({
  page,
  browser,
}) => {
  await onTheFirstTopic(page);
  const mine = page.url().split("?")[0] as string;
  expect((await page.goto(`${mine}?tema=9999`))?.status()).toBe(404);

  const stranger = await browser.newContext();
  const theirs = await stranger.newPage();
  await signInContext(stranger, newAddress("ajena"));
  expect((await theirs.goto(mine))?.status()).toBe(404);
  await stranger.close();
});

test("with no space yet, connecting an assistant offers two ways forward", async ({ page }) => {
  await signInContext(page.context(), newAddress("sin-espacio"));
  await page.goto(`${DEV}/ensenar/conecta`);
  await expect(page.getByRole("link", { name: "Quiero enseñar" })).toHaveAttribute(
    "href",
    "/quiero-ensenar",
  );
  await expect(page.getByRole("link", { name: "Volver a Mis rutas" })).toHaveAttribute(
    "href",
    "/mis-rutas",
  );
});
