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

test("an operator invites an application, and it moves to those invited", async ({
  page,
  context,
}) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  const row = page.locator(".admin-item").filter({ hasText: "Lucía Vega" });
  await row.getByRole("button", { name: "Enviar invitación", exact: true }).click();
  await expect(row.getByRole("button", { name: "Enviar invitación", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Reenviar invitación" })).toBeVisible();
  await expect(row.getByRole("link", { name: "Crear un espacio" })).toBeVisible();
});

test("an operator reads what is published, never a draft's edit", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  await expect(page.getByText("Guitarra desde cero, Andrés Mora")).toBeVisible();
  expect(await page.content()).not.toContain("Título que nadie publicó");
});

test("an operator creates a space for someone who has signed in, and only for them", async ({
  page,
  context,
  browser,
}) => {
  const owner = newAddress("duena");
  const ownerContext = await browser.newContext({ locale: "es-ES" });
  await signInContext(ownerContext, owner);
  await ownerContext.close();

  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  const slug = `espacio-${crypto.randomUUID().slice(0, 8)}`;

  await page.goto(`${DEV}/admin/crear-espacio`);
  await page.getByLabel("Nombre del espacio").fill("Espacio de prueba");
  await page.getByLabel("Dirección").fill(slug);
  await page.getByLabel("Correo de quien lo dirige").fill(newAddress("nadie"));
  await page.getByRole("button", { name: "Crear el espacio" }).click();
  await expect(
    page.getByText(
      "Esa persona todavía no ha entrado nunca. Pídele que entre una vez con su correo.",
    ),
  ).toBeVisible();

  await page.getByLabel("Dirección").fill("docs");
  await page.getByLabel("Correo de quien lo dirige").fill(owner);
  await page.getByRole("button", { name: "Crear el espacio" }).click();
  await expect(page.getByText("Esa dirección no se puede usar.")).toBeVisible();

  await page.getByLabel("Dirección").fill(slug);
  await page.getByRole("button", { name: "Crear el espacio" }).click();
  await expect(page.getByText(`Espacio creado: ${slug}.`)).toBeVisible();

  const opened = await page.goto(creatorHost(slug));
  expect(opened?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Espacio de prueba");
});

test("an invited application fills in the form", async ({ page, context }) => {
  const operator = newAddress("operador");
  await signInContext(context, operator);
  makeOperator(operator);
  await page.goto(`${DEV}/admin`);
  const row = page.locator(".admin-item").filter({ hasText: "Diego Ramos" });
  await row.getByRole("link", { name: "Crear un espacio" }).click();
  await expect(page.getByLabel("Nombre del espacio")).toHaveValue("Diego Ramos");
  await expect(page.getByLabel("Dirección")).toHaveValue("diego-ramos");
  await expect(page.getByLabel("Correo de quien lo dirige")).toHaveValue("diego.ramos@example.com");
});

test("a person who is not an operator gets 404 on creating a space", async ({ page, context }) => {
  await signInContext(context, newAddress("no-operador"));
  expect((await page.goto(`${DEV}/admin/crear-espacio`))?.status()).toBe(404);
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
