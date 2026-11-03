import { expect, test } from "@playwright/test";
import { DEV, SCREENS } from "./screens";

// Reduced motion, overflow and touch targets on every designed screen (Platform STEP 3
// §2.3, §5.3).

test.use({ locale: "es-ES" });

for (const [name, open] of Object.entries(SCREENS)) {
  test(`${name}: nothing animates under reduced motion`, async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", locale: "es-ES" });
    const page = await context.newPage();
    await open(page);
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .map((animation) => (animation as CSSAnimation).animationName ?? "transition"),
    );
    expect(running).toEqual([]);
    await context.close();
  });

  for (const width of [375, 1280]) {
    test(`${name}: no sideways scroll at ${width} px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        locale: "es-ES",
      });
      const page = await context.newPage();
      await open(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await context.close();
    });
  }
}

test("every control meets a 44 px touch target", async ({ page }) => {
  await page.goto(`${DEV}/studio/_design`);
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".button, .theme-button, .nav-link, .brand, .field-input",
      ),
    ]
      .filter((element) => element.offsetParent !== null)
      .map((element) => ({
        text: element.textContent?.trim(),
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(({ text, rect }) => `${text}: ${Math.round(rect.width)}x${Math.round(rect.height)}`),
  );
  expect(small).toEqual([]);
});

test("a focused control shows it, by keyboard", async ({ page }) => {
  await page.goto(`${DEV}/studio/_design`);
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement as Element).outlineStyle,
  );
  expect(outline).toBe("solid");
});

test("an error appearing moves nothing: the field keeps its line for it", async ({ page }) => {
  await page.goto(`${DEV}/sign-in`);
  await page.evaluate(() => document.fonts.ready);
  const button = page.getByRole("button", { name: "Enviar enlace" });
  const before = await button.boundingBox();
  await page.getByLabel("Tu correo").fill("sin arroba");
  await button.click();
  await page.getByText("Escribe un correo con @").waitFor();
  expect((await button.boundingBox())?.y).toBe(before?.y);
});
