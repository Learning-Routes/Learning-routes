import { expect, test } from "@playwright/test";
import { SCHEMES, SCREENS, WIDTHS } from "./screens";

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
          fullPage: true,
          animations: "disabled",
          maxDiffPixelRatio: 0.001,
          // The countdown changes every second.
          mask: [page.locator(".sign-in-wait")],
        });
        await context.close();
      });
    }
  }
}
