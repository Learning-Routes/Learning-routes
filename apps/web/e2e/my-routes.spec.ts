import { expect, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// Mis rutas and admin need a session (Platform STEP 4 §6.2, §6.4).

test.use({ locale: "es-ES" });

const OPEN_ROUTE = `${creatorHost("mariana-ortega")}/portugues-para-viajar`;

test("with no session, Mis rutas asks to sign in", async ({ page }) => {
  await page.goto(`${DEV}/mis-rutas`);
  await expect(page).toHaveURL(`${DEV}/sign-in`);
});

test("with no enrollment, it says so and links to the catalog", async ({ page, context }) => {
  await signInContext(context, newAddress("vacio"));
  await page.goto(`${DEV}/mis-rutas`);
  await expect(page.getByText("Todavía no estudias ninguna ruta.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar rutas" })).toHaveAttribute(
    "href",
    `${DEV}/es/explorar`,
  );
  await expect(page.getByRole("link", { name: "Enseñar" })).toHaveCount(0);
});

test("a route that does not exist shows a plain message and a way back", async ({ page }) => {
  await page.goto(`${DEV}/empezar?ruta=${crypto.randomUUID()}`);
  await expect(page.getByText("Esta ruta no está disponible")).toBeVisible();
  await page.goto(`${DEV}/empezar?ruta=nonsense`);
  await expect(page.getByRole("link", { name: "Ver las rutas" })).toBeVisible();
});

test("another site's link never enrolls by itself: it asks first", async ({ page, context }) => {
  await signInContext(context, newAddress("otro-sitio"));
  await page.goto(OPEN_ROUTE);
  const href = await page.getByRole("link", { name: "Empezar gratis" }).getAttribute("href");
  await page.route("https://otro-sitio.example/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<a id="go" href="${href}">go</a>` }),
  );
  await page.goto("https://otro-sitio.example/");
  await page.locator("#go").click();
  await page.getByRole("button", { name: "Empezar esta ruta" }).click();
  await expect(page).toHaveURL(`${DEV}/mis-rutas`);
  await expect(page.getByRole("heading", { name: "Portugués para viajar" })).toBeVisible();
});

test("a person who is not an operator gets 404 on admin", async ({ page, context }) => {
  await page.goto(`${DEV}/admin`);
  await expect(page).toHaveURL(`${DEV}/sign-in`);
  await signInContext(context, newAddress("no-operador"));
  expect((await page.goto(`${DEV}/admin`))?.status()).toBe(404);
});

test("a form on a creator's page cannot post to admin", async ({ request }) => {
  const response = await request.post(`${DEV}/admin`, {
    headers: { origin: creatorHost("mariana-ortega") },
    form: { intent: "feature", id: crypto.randomUUID(), position: "1" },
  });
  expect(response.ok()).toBe(false);
});
