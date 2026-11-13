import { expect, type Page, test } from "@playwright/test";
import { signInToken } from "./inbox";

// The production student check (STEP 11-prep §A3): a fixed fictional student signs in with a link
// from the proof inbox, opens the catalog, enrolls in a published route with a free module (again
// is fine: enrolling is idempotent), opens topic 1, answers its check, and is offered the next
// topic. No model calls and no creator writes. It runs against production, by hand or from its
// workflow: never with the default projects.

const APP = "https://app.learningroutes.com";
const STUDENT = "alumna@proof.email.learningroutes.com";
// The owner's choice: the catalog lists no route yet, so the route comes from its creator's page.
const ROUTE = "https://gilber.learningroutes.com/fracciones-sin-miedo";
const FIRST_TOPIC = "Partes de un entero";
// Mail clocks and ours differ by a little: a link asked for now arrives after this.
const SKEW_MS = 60_000;

test("a student enrolls in a free module, answers topic 1's check, and is offered the next", async ({
  page,
  context,
}, testInfo) => {
  const timings: { step: string; seconds: number }[] = [];
  const timed = async (step: string, work: () => Promise<void>, shown: Page = page) => {
    const started = Date.now();
    await test.step(step, work);
    timings.push({ step, seconds: (Date.now() - started) / 1000 });
    await testInfo.attach(step, {
      body: await shown.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  };

  await timed("1. signs in with a link from the proof inbox", async () => {
    const asked = Date.now() - SKEW_MS;
    const headers = { origin: APP, "accept-language": "es" };
    const sent = await context.request.post(`${APP}/api/auth/sign-in/magic-link`, {
      headers,
      data: { email: STUDENT },
    });
    expect(sent.ok()).toBe(true);
    const token = await signInToken(STUDENT, asked);
    // The context's request shares its cookies, so this session is the browser's too.
    const confirmed = await context.request.post(`${APP}/api/auth/magic-link/confirm`, {
      headers,
      form: { token },
      maxRedirects: 0,
    });
    expect(confirmed.status()).toBe(302);
    await page.goto(`${APP}/es/mis-rutas`);
    await expect(page).toHaveURL(/\/mis-rutas/);
  });

  await timed("2. opens the catalog", async () => {
    await page.goto(`${APP}/es/explorar`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("aprender");
  });

  await timed("3. enrolls in a route with a free module", async () => {
    await page.goto(ROUTE);
    await expect(page.getByText("El módulo 1 completo es gratis.")).toBeVisible();
    await page.getByRole("link", { name: "Empezar gratis" }).click();
    await expect(page.getByRole("link", { name: "Seguir", exact: true }).first()).toBeVisible();
  });

  await timed("4. opens topic 1", async () => {
    await page.getByRole("link", { name: "Seguir", exact: true }).first().click();
    await expect(page.locator(".lesson-title")).toHaveText(FIRST_TOPIC);
    await page.locator("html[data-hydrated=true]").waitFor({ state: "attached" });
  });

  await timed("5. answers its check", async () => {
    const options = page.locator(".lesson-option");
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index++) {
      await options.nth(index).click();
      await page.getByRole("button", { name: "Comprobar" }).click();
      const right = page.locator(".lesson-option.is-right");
      const wrong = page.locator(".lesson-option.is-wrong");
      await expect(right.or(wrong).first()).toBeVisible();
      if ((await right.count()) > 0) {
        break;
      }
    }
    await expect(page.locator(".lesson-option.is-right")).toHaveCount(1);
  });

  await timed("6. is offered the next topic", async () => {
    await expect(page.getByText("Tema hecho.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Siguiente tema" })).toBeVisible();
  });

  await testInfo.attach("timings", {
    body: JSON.stringify(timings, null, 1),
    contentType: "application/json",
  });
  for (const { step, seconds } of timings) {
    console.log(`${testInfo.project.name}  ${seconds.toFixed(1)} s  ${step}`);
  }
});
