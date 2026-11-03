import type { Page } from "@playwright/test";

// Every designed screen, for the visual, accessibility and motion checks (Platform
// STEP 3 §5). The API is a stand-in, with fixture data only. Port 4174 is the local
// origin, where the components page exists.

export const DEV = "http://localhost:4174";
const EMAIL = "lector@example.com";
const MASKED = "le•••@example.com";

export const SCREENS: Record<string, (page: Page) => Promise<unknown>> = {
  landing: (page) => page.goto(`${DEV}/es`),
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
