import { BRAND } from "@learning-routes/core/locales";
import { expect, type Page, test } from "@playwright/test";
import { DEV } from "./screens";
import {
  authorizeUrl,
  clearLimits,
  linkFor,
  makeTeacher,
  newAddress,
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT,
  PKCE_VERIFIER,
  seedOAuthClient,
  signInContext,
} from "./session";

// An assistant connecting (Platform STEP 5 §2): the client is seeded, since a metadata
// document would need the network. It asks, its person says yes, and "Desconectar" ends it.

const AT_SIGN_IN = /\/sign-in\?/;
const AT_CONSENT = /\/conectar\?/;
const asked = () => authorizeUrl();

/** The client's own page: nothing listens there, so the test answers for it. */
async function clientAnswers(page: Page) {
  await page.route(`${OAUTH_REDIRECT}**`, (route) =>
    route.fulfill({ contentType: "text/plain", body: "ok" }),
  );
}

test.use({ locale: "es-ES" });
test.beforeAll(() => seedOAuthClient());

test("a teacher says yes, the client gets tokens, and Desconectar ends them", async ({
  page,
  context,
  // The client: no cookies and no Origin, unlike this browser.
  request,
}) => {
  const email = newAddress("ensena");
  await signInContext(context, email);
  makeTeacher(email);
  await clientAnswers(page);
  await page.goto(asked());
  await expect(
    page.getByRole("heading", {
      name: `Cliente de prueba quiere usar tu cuenta de ${BRAND}`,
    }),
  ).toBeVisible();
  await expect(page.getByText("Ver tus rutas")).toBeVisible();
  await expect(page.getByText("Crear y cambiar borradores")).toBeVisible();
  await expect(page.getByText("Publicar rutas en tu página")).toHaveCount(0);
  await expect(page.getByText("Tu respuesta se envía a 127.0.0.1:43219.")).toBeVisible();
  await page.getByRole("button", { name: "Permitir", exact: true }).click();
  await page.waitForURL(`${OAUTH_REDIRECT}**`);
  const code = new URL(page.url()).searchParams.get("code") ?? "";
  expect(code).not.toBe("");

  const token = await request.post(`${DEV}/api/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      code_verifier: PKCE_VERIFIER,
      resource: `${DEV}/mcp`,
    },
  });
  expect(token.status()).toBe(200);
  const { refresh_token: refreshToken } = await token.json();

  await page.goto(`${DEV}/ensenar/conexiones`);
  await expect(page.getByText("Cliente de prueba")).toBeVisible();
  await expect(page.getByText("Aún sin usar")).toBeVisible();
  await page.getByRole("button", { name: "Desconectar: Cliente de prueba" }).click();
  await expect(page.getByText("Desconectado.")).toBeVisible();
  await expect(page.getByText("Aún no hay asistentes conectados.")).toBeVisible();

  const refreshed = await request.post(`${DEV}/api/auth/oauth2/token`, {
    form: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
      resource: `${DEV}/mcp`,
    },
  });
  expect(refreshed.ok()).toBe(false);
});

test("saying no sends the client access_denied", async ({ page, context }) => {
  const email = newAddress("ensena");
  await signInContext(context, email);
  makeTeacher(email);
  await clientAnswers(page);
  await page.goto(asked());
  await page.getByRole("button", { name: "No permitir" }).click();
  await page.waitForURL(`${OAUTH_REDIRECT}**`);
  expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
});

test("someone with no space to teach in is told so, and offered no button", async ({
  page,
  context,
}) => {
  await signInContext(context, newAddress("aprende"));
  await page.goto(asked());
  await expect(
    page.getByText("Para conectar un asistente necesitas tener un espacio para enseñar."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Permitir", exact: true })).toHaveCount(0);
});

test("Conecta tu asistente gives the address, and copies it", async ({ page, context }) => {
  const email = newAddress("ensena");
  await signInContext(context, email);
  makeTeacher(email);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${DEV}/ensenar/conecta`);
  await page.locator("html[data-hydrated]").waitFor();
  await expect(page.getByText(`${DEV}/mcp`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copiar dirección" }).click();
  await expect(page.getByRole("button", { name: "Copiada" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${DEV}/mcp`);
});

test("signing in comes back to the question", async ({ page, context }) => {
  const email = newAddress("ensena");
  clearLimits();
  await page.goto(asked());
  await expect(page).toHaveURL(AT_SIGN_IN);
  await page.context().request.post(`${DEV}/api/auth/sign-in/magic-link`, {
    headers: { origin: DEV },
    data: { email },
  });
  await page.goto(await linkFor(email));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(AT_CONSENT);
  await context.clearCookies();
});

test("each assistant has its own tab, with at most three steps and what to paste", async ({
  page,
  context,
}) => {
  const email = newAddress("ensena");
  await signInContext(context, email);
  makeTeacher(email);
  await page.goto(`${DEV}/ensenar/conecta`);
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByRole("tab", { name: "Claude Code" }).click();
  await expect(
    page.getByText(`claude mcp add --transport http --scope user learning-routes ${DEV}/mcp`),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "ChatGPT" })).toBeFocused();
  await expect(page.getByText("Add custom MCP server")).toBeVisible();
  for (const name of ["Claude", "Claude Code", "ChatGPT", "Gemini CLI"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(await page.locator(".connect-steps li").count()).toBeLessThanOrEqual(3);
  }
});

test("signing in for an assistant says so, in one line", async ({ page }) => {
  await page.goto(`${DEV}/sign-in?client_id=a&sig=b`);
  await expect(page.getByText("Entra con tu correo para conectar tu asistente.")).toBeVisible();
});
