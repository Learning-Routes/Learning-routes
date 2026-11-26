import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// The tutor's panel in the lesson (Platform STEP 20 §A). The model's answer is stood in for here:
// what is under test is what the learner sees and what the page sends.

test.use({ locale: "es-ES" });

/** Signs a new person in and enrolls them in the open route; their enrollment's id. */
async function enrolled(page: Page, who: string): Promise<string> {
  await signInContext(page.context(), newAddress(who));
  await page.goto(`${creatorHost("mariana-ortega")}/portugues-para-viajar`);
  await page.getByRole("link", { name: "Empezar gratis" }).click();
  const seguir = page.getByRole("link", { name: "Seguir", exact: true }).first();
  const href = (await seguir.getAttribute("href")) ?? "";
  return href.split("/")[2] ?? "";
}

const ANSWER = "Piensa en qué palabra saluda por la mañana. ¿Cuál de las tres lo hace?";

test("a learner asks the tutor from the lesson, and reads the answer as it arrives", async ({
  page,
}) => {
  const enrollment = await enrolled(page, "tutor");
  let sent: Record<string, unknown> = {};
  await page.route("**/api/tutor/ask", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: ANSWER });
  });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`${DEV}/mis-rutas/${enrollment}/tema/1`);
  const tutor = page.getByRole("complementary", { name: "Tu tutor" });
  await tutor.getByRole("button", { name: "Dame una pista" }).click();
  await expect(tutor.locator(".t-me")).toHaveText("Dame una pista");
  await expect(tutor.locator(".t-tutor").last()).toHaveText(ANSWER);
  expect(sent).toMatchObject({ enrollment_id: enrollment, topic: 1, question: "Dame una pista" });
  expect(typeof sent.beat).toBe("number");
  // A typed question goes the same way, and the field empties.
  await tutor.getByRole("textbox").fill("¿Por qué no es «night»?");
  await tutor.getByRole("button", { name: "Enviar" }).click();
  await expect(tutor.locator(".t-me").last()).toHaveText("¿Por qué no es «night»?");
  await expect(tutor.getByRole("textbox")).toHaveValue("");
});

test("on a phone the top bar opens the tutor, and the day's limit is said in the server's words", async ({
  page,
}) => {
  const enrollment = await enrolled(page, "tutor-phone");
  const limited = "Ya hiciste tus 10 preguntas de hoy. Mañana puedes hacer 10 más.";
  await page.route("**/api/tutor/ask", (route) =>
    route.fulfill({ status: 429, json: { ok: false, code: "rate_limited", message: limited } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${DEV}/mis-rutas/${enrollment}/tema/1`);
  const tutor = page.getByRole("complementary", { name: "Tu tutor" });
  await expect(tutor).toBeHidden();
  await page.getByRole("button", { name: "Pregúntale al tutor" }).click();
  await expect(tutor).toBeVisible();
  await tutor.getByRole("button", { name: "Dame otro ejemplo" }).click();
  await expect(tutor.locator(".t-tutor.is-failed")).toHaveText(limited);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await tutor.getByRole("button", { name: "Cerrar el tutor" }).click();
  await expect(tutor).toBeHidden();
});
