import { expect, test } from "@playwright/test";
import { DEV } from "./screens";
import { makeTeacher, newAddress, signInContext } from "./session";

// The creator's assistant (Platform STEP 10 §1), through the real WebSocket: the web Worker hands it
// to the agent's Worker, which checks the session and the space, and the space's object keeps the
// conversation. Locally there is no model key, so the assistant says it is not on yet.

test.use({ locale: "es-ES" });

const NOT_ON = "El asistente todavía no está encendido";
const TEACH = /\/creador$/;
const CONNECTION = `${DEV}/creador/asistente/conexion`;

test("a creator talks to the assistant, and the conversation is still there after a reload", async ({
  page,
  context,
}) => {
  const email = newAddress("asistente");
  await signInContext(context, email);
  makeTeacher(email);
  await page.goto(`${DEV}/creador/asistente`);
  await page.locator("#studio-input").fill("Quiero mi app de matemáticas");
  await page.locator(".studio-send").click();
  await expect(page.getByText(NOT_ON)).toBeVisible();
  await page.reload();
  await expect(page.getByText(NOT_ON)).toBeVisible();
});

test("someone who edits no space has no assistant", async ({ page, context }) => {
  await signInContext(context, newAddress("alumno"));
  await page.goto(`${DEV}/creador/asistente`);
  await expect(page).toHaveURL(TEACH);
});

test("a page with no session cannot open a space's assistant", async ({ page }) => {
  await page.goto(`${DEV}/sign-in`);
  const opened = await page.evaluate(
    (address) =>
      new Promise((resolve) => {
        const socket = new WebSocket(address);
        socket.onopen = () => resolve("open");
        socket.onerror = () => resolve("refused");
      }),
    `${CONNECTION.replace("http", "ws")}?space=00000000-0000-7000-8000-000000000001`,
  );
  expect(opened).toBe("refused");
});
