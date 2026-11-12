import { expect, test } from "@playwright/test";
import { DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// The creator's assistant (Platform STEP 10 §1), through the real WebSocket: the web Worker hands it
// to the agent's Worker, which checks the session and the space. journey.spec.ts talks to it
// through the web from start to end; the agent's own tests say what it answers when it is not on.

test.use({ locale: "es-ES" });

const TEACH = /\/creador$/;
const CONNECTION = `${DEV}/creador/asistente/conexion`;

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
