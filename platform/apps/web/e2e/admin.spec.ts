import { expect, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { makeOperator, newAddress, signInContext } from "./session";

// Admin, as an operator, against the real local API and database (Platform STEP 4 §6.4,
// §7.4). The cache is real too, and a local purge is a no-op, so each read of a public page
// after a change uses a URL nothing has kept yet: in production the purge is what clears it.

test.use({ locale: "es-ES" });

const FRESH = () => `fresco=${crypto.randomUUID()}`;
const SEARCH = "Ruta para aprobar";

test("an operator approves a listing, and it appears in the catalog", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/es/explorar?q=${encodeURIComponent(SEARCH)}&${FRESH()}`);
  await expect(page.getByRole("heading", { name: SEARCH })).toHaveCount(0);

  await page.goto(`${DEV}/admin`);
  await expect(page.getByRole("heading", { name: "Quieren enseñar" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: `${SEARCH}, Profe Tomás` });
  await row.getByLabel("Nota para quien creó la ruta").fill("Todo en orden");
  await row.getByRole("button", { name: "Aprobar" }).click();
  await expect(
    page
      .locator(".admin-item")
      .filter({ hasText: SEARCH })
      .getByLabel("Lugar en «Rutas para empezar»"),
  ).toBeVisible();

  await page.goto(`${DEV}/es/explorar?q=${encodeURIComponent(SEARCH)}&${FRESH()}`);
  await expect(page.getByRole("heading", { name: SEARCH })).toBeVisible();
});

test("an operator chooses the landing's routes, and takes them off", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  const row = page.locator(".admin-item").filter({ hasText: "Cálculo sin miedo" });
  await row.getByLabel("Lugar en «Rutas para empezar»").selectOption("1");
  await row.getByRole("button", { name: "Guardar lugar" }).click();
  await expect(row.getByLabel("Lugar en «Rutas para empezar»")).toHaveValue("1");

  await page.goto(`${DEV}/es?${FRESH()}`);
  const cards = page.locator(".landing-routes .route-card");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Cálculo sin miedo");

  await page.goto(`${DEV}/admin`);
  await row.getByLabel("Lugar en «Rutas para empezar»").selectOption("");
  await row.getByRole("button", { name: "Guardar lugar" }).click();
  await expect(row.getByLabel("Lugar en «Rutas para empezar»")).toHaveValue("");
});

test("an operator decides an application, and it leaves the list", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  const row = page.locator(".admin-item").filter({ hasText: "Lucía Vega" });
  await row.getByRole("button", { name: "Marcar como invitada" }).click();
  await expect(row).toHaveCount(0);
});

test("an operator reads what is published, never a draft's edit", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  await expect(page.getByText("Guitarra desde cero, Andrés Mora")).toBeVisible();
  expect(await page.content()).not.toContain("Título que nadie publicó");
});

test("a member's address never appears on a public page", async ({ page }) => {
  for (const url of [
    `${DEV}/es/explorar`,
    creatorHost("mariana-ortega"),
    `${creatorHost("mariana-ortega")}/portugues-para-viajar`,
  ]) {
    await page.goto(url);
    expect(await page.content(), url).not.toContain("@example.com");
  }
});
