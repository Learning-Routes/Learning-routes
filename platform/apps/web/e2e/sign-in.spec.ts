import { expect, type Page, test } from "@playwright/test";

// The sign-in screens against a stand-in API: the API's own tests cover what it does.
// The app's origin in these runs is port 4174, which keeps the theme cookie.
const DEV = "http://localhost:4174";
const EMAIL = "lector@example.com";
const MASKED = "le•••@example.com";
const LINK = `${DEV}/sign-in/confirm#token=a-token`;
const NO_TOKEN_IN_URL = /a-token/;

test.use({ locale: "es-ES" });

/** The form is React's once hydrated: a busy runner could otherwise type before that. */
async function openSignIn(page: Page) {
  await page.goto(`${DEV}/sign-in`);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

test("a person walks through sign-in with only the keyboard", async ({ page }) => {
  await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }));
  await openSignIn(page);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeFocused();

  // Skip the brand and the theme toggle, then type and send with the keyboard alone.
  const email = page.getByLabel("Tu correo");
  while (!(await email.evaluate((node) => node === document.activeElement))) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.type(EMAIL);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Enviar enlace" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeFocused();
  await expect(page.getByText(EMAIL)).toBeVisible();
  expect(page.url()).not.toContain(EMAIL);
});

test("an address with no @ gets told how to fix it, on leaving the field and on sending", async ({
  page,
}) => {
  let requested = false;
  await page.route("**/api/auth/sign-in/magic-link", (route) => {
    requested = true;
    return route.fulfill({ json: {} });
  });
  await openSignIn(page);
  const field = page.getByLabel("Tu correo");
  await field.fill("sin arroba");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await field.blur();
  await expect(page.getByText("Escribe un correo con @")).toBeVisible();
  await field.fill("sin arrobax");
  await expect(page.getByText("Escribe un correo con @")).toBeHidden();
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();
  expect(requested).toBe(false);
});

test("resending waits, then works, and another address can be used", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }));
  await openSignIn(page);
  await page.getByLabel("Tu correo").fill(EMAIL);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText("Podrás reenviarlo en")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar enlace" })).toBeHidden();
  for (let second = 0; second < 31; second++) {
    await page.clock.runFor(1000);
  }
  await page.getByRole("button", { name: "Reenviar enlace" }).click();
  await expect(page.getByText("Enlace reenviado.")).toBeVisible();
  await page.getByRole("button", { name: "Usar otro correo" }).click();
  await expect(page.getByLabel("Tu correo")).toHaveValue(EMAIL);
});

for (const [status, text] of [
  [429, "Se pidieron muchos enlaces"],
  [500, "El enlace no se pudo enviar"],
] as const) {
  test(`a ${status} reads as words, never a code`, async ({ page }) => {
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ status }));
    await openSignIn(page);
    await page.getByLabel("Tu correo").fill(EMAIL);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.locator("main")).not.toContainText(String(status));
  });
}

for (const [notice, text] of [
  ["expired", "Este enlace ya no sirve"],
  ["limited", "Se pidieron muchos enlaces"],
  ["signed-out", "Saliste de tu cuenta"],
] as const) {
  test(`?notice=${notice} explains itself`, async ({ page }) => {
    await page.goto(`${DEV}/sign-in?notice=${notice}`);
    await expect(page.getByText(text)).toBeVisible();
  });
}

test("the link shows the masked address the API names, keeps the token out of the URL, and has one POST button", async ({
  page,
}) => {
  const seen: string[] = [];
  page.on("request", (request) => seen.push(request.url()));
  let peeked = "";
  await page.route("**/api/auth/magic-link/peek", (route) => {
    peeked = route.request().postData() ?? "";
    return route.fulfill({ json: { email: MASKED } });
  });
  const response = await page.goto(LINK);
  expect(response?.headers()["referrer-policy"]).toBe("same-origin");
  await expect(page.getByRole("heading", { name: `Entrar como ${MASKED}` })).toBeFocused();
  expect(peeked).toContain("a-token");
  expect(page.url()).not.toMatch(NO_TOKEN_IN_URL);
  for (const url of seen) {
    expect(url).not.toMatch(NO_TOKEN_IN_URL);
  }
  const form = page.locator("main form");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("action", "/api/auth/magic-link/confirm");
  await expect(form.getByRole("button")).toHaveCount(1);
});

test("an expired link lands on the screen that asks for another", async ({ page }) => {
  await page.route("**/api/auth/magic-link/peek", (route) => route.fulfill({ status: 404 }));
  await page.goto(LINK);
  await expect(page.getByText("Este enlace ya no sirve")).toBeVisible();
  await expect(page.getByLabel("Tu correo")).toBeVisible();
});

test("the screens follow the browser's language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  await openSignIn(page);
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await context.close();
});

test("with no script the address never reaches a URL, and the page says what it needs", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "es-ES" });
  const page = await context.newPage();
  await page.goto(`${DEV}/sign-in`);
  await page.getByLabel("Tu correo").fill(EMAIL);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByLabel("Tu correo")).toBeVisible();
  expect(page.url()).toBe(`${DEV}/sign-in`);
  // Chromium's emulation doesn't render <noscript>, so read it from the HTML.
  for (const path of ["/sign-in", "/sign-in/confirm"]) {
    const html = await (await context.request.get(`${DEV}${path}`)).text();
    expect(html).toContain("Para entrar, activa JavaScript");
    expect(html).toContain("<noscript>");
  }
  await context.close();
});

test("the theme toggle keeps the screen you are on", async ({ page }) => {
  await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }));
  await openSignIn(page);
  await page.getByLabel("Tu correo").fill(EMAIL);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(EMAIL)).toBeVisible();
  const toggle = page.getByRole("button", { name: "Cambiar a modo oscuro" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText(EMAIL)).toBeVisible();
});

test("a confirm page reached with no token asks to open the link again, not 'expired'", async ({
  page,
}) => {
  await page.goto(`${DEV}/sign-in/confirm`);
  await expect(page.getByText("Abre otra vez el enlace de tu correo")).toBeVisible();
  await expect(page.getByText("Este enlace ya no sirve")).toBeHidden();
});

test("an error stays while the field has focus, and goes on the first keystroke", async ({
  page,
}) => {
  await openSignIn(page);
  const field = page.getByLabel("Tu correo");
  await field.fill("sin arroba");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Escribe un correo con @")).toBeVisible();
  await field.blur();
  await field.focus();
  await expect(page.getByText("Escribe un correo con @")).toBeVisible();
  await page.keyboard.type("x");
  await expect(page.getByText("Escribe un correo con @")).toBeHidden();
});

test("a notice from the server takes focus, so a screen reader hears it", async ({ page }) => {
  await page.goto(`${DEV}/sign-in?notice=expired`);
  await expect(page.locator(".notice")).toBeFocused();
});
