import { expect, test } from "@playwright/test";
import { DEV } from "./screens";
import { makeTeacher, newAddress, signInContext } from "./session";

// One's profile: a name, one's progress, and for whoever teaches the assistant's address.

test.use({ locale: "es-ES" });

test("a new learner names their profile and reaches it from the frame", async ({ page }) => {
  await signInContext(page.context(), newAddress("perfil"));
  await page.goto(`${DEV}/inicio`);
  await page.locator(".shell-me").click();
  await expect(page).toHaveURL(`${DEV}/perfil`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ponle nombre a tu perfil");
  await page.getByLabel("Tu nombre").fill("Lucía Paz");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lucía Paz");
  await expect(page.getByText("Nombre guardado")).toBeVisible();
  // The frame around every page carries the same name from then on.
  await expect(page.locator(".shell-me")).toContainText("Lucía Paz");
  // Nobody who does not teach is shown an assistant's address.
  await expect(page.getByText("Tu asistente (MCP)")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pedir un espacio para enseñar" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Tu cuenta" }).getByRole("button", { name: "Cerrar sesión" }),
  ).toBeVisible();
});

test("whoever teaches finds their assistant's address on their profile, on a phone too", async ({
  page,
}) => {
  const email = newAddress("perfil-ensena");
  await signInContext(page.context(), email);
  makeTeacher(email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${DEV}/perfil`);
  const teaching = page.getByRole("region", { name: "Enseñas" });
  await expect(teaching.locator("code")).toHaveText(`${DEV}/mcp`);
  await expect(teaching.getByRole("button", { name: "Copiar dirección" })).toBeVisible();
  await expect(
    teaching.getByRole("link", { name: "Cómo conectarlo, paso a paso" }),
  ).toHaveAttribute("href", "/creador/conecta");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
