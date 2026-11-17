import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV, SCREENS } from "./screens";
import { signInContext } from "./session";

// Day and night on every screen (Platform STEP 16): one choice, kept across a reload, on every
// host. The storefront has no script, so there the switch is the form's own post. One choice for
// all hosts rests on the cookie's Domain (test/theme.test.ts): a browser refuses Domain=localhost,
// so a local run keeps it per host.

const go = (path: string) => (page: Page) => page.goto(path);

const SURFACES: Record<string, (page: Page) => Promise<unknown>> = {
  landing: go(`${DEV}/es`),
  catalog: go(`${DEV}/es/explorar`),
  "creator-page": go(creatorHost("mariana-ortega")),
  "route-page": go(`${creatorHost("mariana-ortega")}/portugues-para-viajar`),
  "sign-in": go(`${DEV}/sign-in`),
  "sign-in-confirm": SCREENS["sign-in-confirm"],
  "error-page": go(`${DEV}/es/explorar/no-existe/esto`),
  "my-routes": SCREENS["my-routes"],
  seguir: SCREENS.lesson,
  "creator-hub": SCREENS["creator-hub"],
  connect: SCREENS["connect-assistant"],
  connections: SCREENS.connections,
  "creator-page-editor": async (page) => {
    // The seed's fictional owner: the editor is for owners only.
    await signInContext(page.context(), "mariana.ortega@example.com");
    await page.goto(`${DEV}/creador`);
    await page.getByRole("link", { name: "Editar tu página" }).click();
  },
  preview: async (page) => {
    await SCREENS["creator-hub"](page);
    await page.getByRole("link", { name: "Vista previa" }).first().click();
  },
  admin: SCREENS.admin,
};

async function toggledAndKept(page: Page) {
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Cambiar a modo oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  // Hydrated, the switch posts with fetch and stays put; without script, the form posts itself.
  // Either way the choice is kept once the browser holds the cookie.
  const choice = async () =>
    (await page.context().cookies()).find((cookie) => cookie.name === "lr_theme")?.value;
  await expect.poll(choice).toBe("dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Cambiar a modo claro" })).toBeVisible();
}

for (const [name, open] of Object.entries(SURFACES)) {
  test(`${name}: the switch is there, and the choice stays after a reload`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light", locale: "es-ES" });
    const page = await context.newPage();
    await open(page);
    await toggledAndKept(page);
    await context.close();
  });
}

test("the player keeps its switch on a phone", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "es-ES",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await SCREENS["my-routes"](page);
  await page.getByRole("link", { name: "Seguir", exact: true }).first().click();
  await page.locator(".p-segs").waitFor();
  await toggledAndKept(page);
  await context.close();
});
