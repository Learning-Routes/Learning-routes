import type { Page } from "@playwright/test";
import {
  authorizeUrl,
  makeOperator,
  makeTeacher,
  newAddress,
  OAUTH_REDIRECT,
  seedOAuthClient,
  signInContext,
  stubTurnstile,
} from "./session";

// Every designed screen, for the visual, accessibility and motion checks (Platform
// STEP 3 §5). The API is a stand-in, with fixture data only. Port 4174 is the local
// origin, where the components page exists.

export const DEV = "http://localhost:4174";
const EMAIL = "lector@example.com";
const MASKED = "le•••@example.com";

/** A creator's host, in a local run. The browser resolves [slug].localhost by itself. */
export const creatorHost = (slug: string) => `http://${slug}.localhost:4174`;

/** Enrolls as a new person, through the route's own button: leaves them on Mis rutas. */
async function enrolled(page: Page) {
  await signInContext(page.context(), newAddress("estudia"));
  await page.goto(`${creatorHost("mariana-ortega")}/portugues-para-viajar`);
  await page.getByRole("link", { name: "Empezar gratis" }).click();
  await page.getByRole("heading", { name: "Mis rutas" }).waitFor();
}

/** A teacher, signed in, on the assistant's question. */
async function askedToConnect(page: Page) {
  seedOAuthClient();
  const email = newAddress("ensena");
  await signInContext(page.context(), email);
  makeTeacher(email);
  await page.goto(authorizeUrl());
  await page.locator(".connect-actions").waitFor();
}

export const SCREENS: Record<string, (page: Page) => Promise<unknown>> = {
  "connect-consent": askedToConnect,
  connections: async (page) => {
    await askedToConnect(page);
    await page.route(`${OAUTH_REDIRECT}**`, (route) =>
      route.fulfill({ contentType: "text/plain", body: "ok" }),
    );
    await page.getByRole("button", { name: "Permitir", exact: true }).click();
    await page.waitForURL(`${OAUTH_REDIRECT}**`);
    await page.goto(`${DEV}/ensenar/conexiones`);
    await page.getByRole("heading", { name: "Conexiones" }).waitFor();
  },
  "connect-assistant": async (page) => {
    const email = newAddress("ensena");
    await signInContext(page.context(), email);
    makeTeacher(email);
    await page.goto(`${DEV}/ensenar/conecta`);
    await page.getByRole("heading", { name: "Conecta tu asistente" }).waitFor();
  },
  // The map where WebGL exists, once it has settled.
  landing: async (page) => {
    await page.goto(`${DEV}/es#mapa`);
    await page.locator(".lp-journey[data-stage]").waitFor({ state: "attached" });
  },
  // Without WebGL, the panels stack as text.
  "landing-no-webgl": async (page) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
      Reflect.deleteProperty(window, "OffscreenCanvas");
    });
    await page.goto(`${DEV}/es`);
    await page.locator('.lp-journey[data-stage="static"]').waitFor({ state: "attached" });
  },
  catalog: (page) => page.goto(`${DEV}/es/explorar`),
  "creator-page": (page) => page.goto(creatorHost("mariana-ortega")),
  "route-page": (page) => page.goto(`${creatorHost("mariana-ortega")}/portugues-para-viajar`),
  "start-sign-in": async (page) => {
    await page.goto(`${creatorHost("mariana-ortega")}/portugues-para-viajar`);
    await page.getByRole("link", { name: "Empezar gratis" }).click();
    await page.getByRole("heading", { name: "Vas a empezar Portugués para viajar" }).waitFor();
  },
  "start-unavailable": (page) => page.goto(`${DEV}/empezar?ruta=nonsense`),
  "my-routes-empty": async (page) => {
    await signInContext(page.context(), newAddress("vacio"));
    await page.goto(`${DEV}/mis-rutas`);
  },
  "my-routes": enrolled,
  lesson: async (page) => {
    await enrolled(page);
    await page.getByRole("link", { name: "Seguir", exact: true }).first().click();
    await page.locator(".lesson-title").waitFor();
  },
  "connect-no-space": async (page) => {
    await signInContext(page.context(), newAddress("sin-espacio"));
    await page.goto(`${DEV}/ensenar/conecta`);
    await page.getByRole("link", { name: "Quiero enseñar" }).waitFor();
  },
  teach: async (page) => {
    await stubTurnstile(page);
    await page.goto(`${DEV}/quiero-ensenar`);
  },
  admin: async (page) => {
    const operator = newAddress("operador");
    await signInContext(page.context(), operator);
    makeOperator(operator);
    await page.goto(`${DEV}/admin`);
    await page.getByRole("heading", { name: "Quieren enseñar" }).waitFor();
  },
  "create-space": async (page) => {
    const operator = newAddress("operador");
    await signInContext(page.context(), operator);
    makeOperator(operator);
    await page.goto(`${DEV}/admin/crear-espacio`);
    await page.getByRole("heading", { name: "Crear un espacio" }).waitFor();
  },
  "catalog-no-results": (page) => page.goto(`${DEV}/es/explorar?q=zzzzzz`),
  components: (page) => page.goto(`${DEV}/studio/_design`),
  "sign-in": (page) => page.goto(`${DEV}/sign-in`),
  "sign-in-invalid": async (page) => {
    await page.goto(`${DEV}/sign-in`);
    await page.locator('html[data-hydrated="true"]').waitFor({ state: "attached" });
    await page.getByLabel("Tu correo").fill("sin arroba");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
  },
  "sign-in-sent": async (page) => {
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ json: {} }));
    await page.goto(`${DEV}/sign-in`);
    await page.locator('html[data-hydrated="true"]').waitFor({ state: "attached" });
    await page.getByLabel("Tu correo").fill(EMAIL);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await page.getByRole("heading", { name: "Revisa tu correo" }).waitFor();
  },
  "sign-in-confirm": async (page) => {
    await page.route("**/api/auth/magic-link/peek", (route) =>
      route.fulfill({ json: { email: MASKED } }),
    );
    await page.goto(`${DEV}/sign-in/confirm#token=fixture`);
    await page.getByRole("heading", { name: `Entrar como ${MASKED}` }).waitFor();
  },
  "sign-in-expired": (page) => page.goto(`${DEV}/sign-in?notice=expired`),
  "sign-in-limited": (page) => page.goto(`${DEV}/sign-in?notice=limited`),
  "sign-in-failed": (page) => page.goto(`${DEV}/sign-in?notice=failed`),
  "sign-in-signed-out": (page) => page.goto(`${DEV}/sign-in?notice=signed-out`),
};

export const WIDTHS = [390, 1440] as const;
export const SCHEMES = ["light", "dark"] as const;
