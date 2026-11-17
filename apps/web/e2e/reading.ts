import type { Page } from "@playwright/test";

// "Seguir" on Mis rutas opens the current topic in the player (Platform STEP 13). The topic's
// reading page is still there, one level up; tests about it go there through Seguir's address.

const TOPIC = /\/tema\/\d+$/;

/** From Mis rutas, the reading page of the route the first Seguir belongs to. */
export async function openReading(page: Page) {
  const seguir = page.getByRole("link", { name: "Seguir", exact: true }).first();
  const href = await seguir.getAttribute("href");
  if (!href) {
    throw new Error("Seguir has no address");
  }
  await page.goto(new URL(href.replace(TOPIC, ""), page.url()).toString());
}
