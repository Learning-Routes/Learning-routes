import { expect, test } from "@playwright/test";
import { DEV } from "./screens";
import { newAddress, signInContext } from "./session";

// One address (Platform STEP 19), the owner's own path: signed in once, the landing, Mis rutas,
// "Quiero enseñar" and back to Mis rutas, all on one host, and never another sign-in page.

test.use({ locale: "es-ES" });

test("one sign-in carries a person from the landing to Mis rutas, to teaching, and back", async ({
  page,
}) => {
  await signInContext(page.context(), newAddress("una-direccion"));
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      visited.push(frame.url());
    }
  });

  await page.goto(`${DEV}/es`);
  const account = page.getByRole("banner").getByRole("link", { name: "Mis rutas", exact: true });
  await expect(account).toHaveAttribute("href", "/mis-rutas");
  await account.click();
  await expect(page).toHaveURL(`${DEV}/mis-rutas`);

  await page.goto(`${DEV}/es`);
  await page.getByRole("link", { name: "Quiero enseñar" }).first().click();
  await expect(page).toHaveURL(`${DEV}/ser-creador`);
  // Back to the landing, and from its header to Mis rutas again.
  await page.goBack();
  await expect(page).toHaveURL(`${DEV}/es`);
  await account.click();
  await expect(page).toHaveURL(`${DEV}/mis-rutas`);

  expect(visited.filter((url) => new URL(url).pathname.startsWith("/sign-in"))).toEqual([]);
  expect(new Set(visited.map((url) => new URL(url).host))).toEqual(new Set([new URL(DEV).host]));
});
