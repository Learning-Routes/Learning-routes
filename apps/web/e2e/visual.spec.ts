import { expect, test } from "@playwright/test";
import { DEV, SCHEMES, SCREENS, WIDTHS } from "./screens";

// A changed pixel over the threshold fails the build (Platform STEP 3 §5.1). The
// baselines are recorded on the CI runner, with Playwright's own pinned Chromium: fonts
// render differently on a laptop, so this project runs only where CI is set. An
// intended change updates its baseline in the same pull request, before and after.

for (const [name, open] of Object.entries(SCREENS)) {
  for (const width of WIDTHS) {
    for (const colorScheme of SCHEMES) {
      test(`${name}-${width}-${colorScheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme,
          locale: "es-ES",
        });
        const page = await context.newPage();
        await open(page);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${width}-${colorScheme}.png`, {
          // The stage's page is seven screens tall and the canvas moves: the first screen, without it.
          fullPage: name !== "landing",
          animations: "disabled",
          maxDiffPixelRatio: 0.001,
          // The countdown changes every second.
          mask: [page.locator(".sign-in-wait, .lp-world, .lp-labels")],
        });
        await context.close();
      });
    }
  }
}

// Under reduced motion three.js never loads, and the panels stack as text.
for (const width of WIDTHS) {
  for (const colorScheme of SCHEMES) {
    test(`landing-reduced-motion-${width}-${colorScheme}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme,
        locale: "es-ES",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(`${DEV}/es`);
      await page.locator('.lp-journey[data-stage="static"]').waitFor({ state: "attached" });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`landing-reduced-motion-${width}-${colorScheme}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.001,
      });
      await context.close();
    });
  }
}
