import { expect, test } from "@playwright/test";
import { DEV } from "./screens";
import { newAddress, stubTurnstile } from "./session";

// "Quiero enseñar" (Platform STEP 4 §6.3), against the real local API and database, with
// Siteverify answering Cloudflare's published test key.

test.use({ locale: "es-ES" });

const PAGE = `${DEV}/quiero-ensenar`;
const CHALLENGE = /challenges\.cloudflare\.com/;

test("anyone can apply, with no account, and is told what happens next", async ({ page }) => {
  await stubTurnstile(page);
  const email = newAddress("aplica");
  await page.goto(PAGE);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Tu correo").fill(email);
  await page.getByLabel("¿Qué enseñas?").fill("Guitarra");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText("Recibimos tu solicitud.")).toBeVisible();
  await expect(page.getByText(`Te escribimos a ${email} en unos días.`)).toBeVisible();
});

test("an empty form says what to fix, and sends nothing", async ({ page }) => {
  await stubTurnstile(page);
  let sent = false;
  page.on("request", (request) => {
    sent ||= request.url().endsWith("/api/apply");
  });
  await page.goto(PAGE);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText("Escribe tu nombre.")).toBeVisible();
  await expect(page.getByText("Cuéntanos qué enseñas.")).toBeVisible();
  expect(sent).toBe(false);
});

test("only this page may load Turnstile", async ({ request }) => {
  const here = await request.get(PAGE);
  expect(here.headers()["content-security-policy"]).toMatch(CHALLENGE);
  const elsewhere = await request.get(`${DEV}/sign-in`);
  expect(elsewhere.headers()["content-security-policy"]).not.toMatch(CHALLENGE);
});

test("a token that is not real is refused by the API", async ({ context }) => {
  const response = await context.request.post(`${DEV}/api/apply`, {
    headers: { origin: DEV },
    data: { name: "A", email: newAddress("sin-token"), teaches: "B", locale: "es", token: "" },
  });
  expect(response.status()).toBe(403);
});
