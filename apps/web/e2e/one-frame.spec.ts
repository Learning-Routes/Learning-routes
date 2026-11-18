import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// One frame for the whole app (Platform STEP 23): Inicio, Comunidad and Avisos, behind the same
// side panel. Invented people only.

test.use({ locale: "es-ES" });

const ONE_UNREAD = /1 sin leer/;
const REPLIED = /Respondieron a lo que escribiste en Portugués para viajar/;
const OPEN_ROUTE = `${creatorHost("mariana-ortega")}/portugues-para-viajar`;

/** Signs a new person in and enrolls them in the open route; their enrollment's id. */
async function enrolled(page: Page, who: string): Promise<string> {
  await signInContext(page.context(), newAddress(who));
  await page.goto(OPEN_ROUTE);
  await page.getByRole("link", { name: "Empezar gratis" }).click();
  const seguir = page.getByRole("link", { name: "Seguir", exact: true }).first();
  const href = (await seguir.getAttribute("href")) ?? "";
  return href.split("/")[2] ?? "";
}

/** An action through the API, as the page's own session. */
async function act(request: APIRequestContext, name: string, input: object) {
  const response = await request.post(`${DEV}/api/a/${name}`, {
    headers: { origin: DEV },
    data: input,
  });
  return (await response.json()) as { ok: boolean; output: Record<string, unknown> };
}

test("with no session, Inicio asks to sign in", async ({ page }) => {
  await page.goto(`${DEV}/inicio`);
  await expect(page).toHaveURL(`${DEV}/sign-in`);
});

test("Inicio shows the topic to carry on with, and Seguir opens the player", async ({ page }) => {
  const enrollment = await enrolled(page, "inicio");
  await page.goto(`${DEV}/inicio`);
  await expect(page.locator("#hub-hero-title")).toBeVisible();
  await page.locator(".hub-hero").getByRole("link", { name: "Seguir", exact: true }).click();
  await expect(page).toHaveURL(`${DEV}/mis-rutas/${enrollment}/tema/1`);
  await expect(page.locator(".p-main")).toBeVisible();
});

test("Comunidad lists the route's community, and a post written in it reaches the feed", async ({
  page,
}) => {
  const enrollment = await enrolled(page, "comunidad");
  await page.goto(`${DEV}/comunidad`);
  const room = page.locator(`a[href="/comunidad/${enrollment}"]`).first();
  await expect(room).toBeVisible();
  await room.click();
  await expect(page).toHaveURL(`${DEV}/comunidad/${enrollment}`);
  const words = `Hoy aprendí a pedir un café en Lisboa ${crypto.randomUUID().slice(0, 8)}`;
  await page.locator('textarea[name="body"]').fill(words);
  // The form's own answer first: leaving the page sooner would cancel the post.
  await Promise.all([
    page.waitForResponse((answer) => answer.request().method() === "POST" && answer.ok()),
    page.getByRole("button", { name: "Publicar" }).click(),
  ]);
  await page.goto(`${DEV}/comunidad`);
  await expect(page.getByRole("link", { name: words })).toBeVisible();
});

test("Avisos shows a reply, and Marcar como leídos clears the side panel's count", async ({
  page,
  browser,
}) => {
  await enrolled(page, "avisos");
  const { enrollments } = (await act(page.request, "enrollment.list", {})).output as unknown as {
    enrollments: { routeId: string }[];
  };
  const routeId = enrollments[0]?.routeId ?? "";
  const asked = await act(page.request, "community.post", {
    routeId,
    kind: "question",
    body: "¿Cómo se dice «la cuenta, por favor»?",
  });
  const postId = String((asked.output as { id?: string }).id ?? "");
  // Someone else enrolled in the same route answers.
  const other = await browser.newContext({ locale: "es-ES" });
  const theirs = await other.newPage();
  await enrolled(theirs, "responde");
  expect(
    (
      await act(theirs.request, "community.reply", {
        routeId,
        postId,
        body: "«A conta, por favor».",
      })
    ).ok,
  ).toBe(true);
  await other.close();

  await page.goto(`${DEV}/avisos`);
  const badge = page.locator(".nav-badge");
  await expect(badge).toHaveText(ONE_UNREAD);
  await expect(page.getByRole("link", { name: REPLIED })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como leídos" }).click();
  await expect(page.locator(".nav-badge")).toHaveCount(0);
});
