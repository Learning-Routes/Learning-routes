import { expect, type Page, test } from "@playwright/test";
import { DEV } from "./screens";
import { clearLimits, linkFor, newAddress, signInContext } from "./session";

// The whole path, in the browser, against the real local API and database (Platform STEP 4
// §7.3): landing, catalog, search, route page, "Empezar gratis", sign-in with the link from
// the dev sender, enrolled, the route in Mis rutas.

test.use({ locale: "es-ES" });

const TITLE = "Guitarra desde cero";
const ROUTE_PAGE = /\/guitarra-desde-cero$/;

async function toRoutePage(page: Page) {
  await page.goto(`${DEV}/es`);
  await page.getByRole("link", { name: "Explorar rutas" }).first().click();
  await expect(page).toHaveURL(`${DEV}/es/explorar`);
  await page.getByLabel("Buscar rutas").fill("guitarra");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("link", { name: TITLE }).click();
  await expect(page).toHaveURL(ROUTE_PAGE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
}

test("a new person goes from the landing to enrolled", async ({ page }) => {
  clearLimits();
  const email = newAddress("camino");
  await toRoutePage(page);
  await page.getByRole("link", { name: "Empezar gratis" }).click();

  // Says which route they are joining, and the id is in no link the email carries.
  const heading = page.getByRole("heading", { name: `Vas a empezar ${TITLE}` });
  await expect(heading).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  const joining = new URL(page.url()).searchParams.get("ruta") ?? "";
  await page.getByLabel("Tu correo").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();

  const link = await linkFor(email);
  expect(joining).not.toBe("");
  expect(link).not.toContain(joining);

  await page.goto(link);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(`${DEV}/mis-rutas`);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.locator(".my-route").getByText("Con Andrés Mora")).toBeVisible();
  await page.getByRole("link", { name: "Seguir", exact: true }).click();
  await expect(page.locator(".lesson-title")).toBeVisible();
});

test("with a session already open, the same path skips sign-in", async ({ page, context }) => {
  await signInContext(context, newAddress("con-sesion"));
  await toRoutePage(page);
  await page.getByRole("link", { name: "Empezar gratis" }).click();
  await expect(page).toHaveURL(`${DEV}/mis-rutas`);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
});

test("enrolling twice lands in the same place, with one enrollment", async ({ page, context }) => {
  await signInContext(context, newAddress("dos-veces"));
  for (const _ of [1, 2]) {
    await toRoutePage(page);
    await page.getByRole("link", { name: "Empezar gratis" }).click();
    await expect(page).toHaveURL(`${DEV}/mis-rutas`);
  }
  await expect(page.getByRole("heading", { name: TITLE })).toHaveCount(1);
});
