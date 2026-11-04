import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SCHEMES, SCREENS, WIDTHS } from "./screens";

// axe-core on every designed screen (Platform STEP 3 §5.2): zero serious or critical
// violations, at both widths and in both themes.

for (const [name, open] of Object.entries(SCREENS)) {
  for (const width of WIDTHS) {
    for (const colorScheme of SCHEMES) {
      test(`${name} at ${width} px, ${colorScheme}, has no serious violation`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme,
          locale: "es-ES",
          // The final state: axe measures contrast, and a moving line has none yet.
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await open(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const serious = violations
          .filter(({ impact }) => impact === "serious" || impact === "critical")
          .map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target).join(", ")}`);
        expect(serious).toEqual([]);
        await context.close();
      });
    }
  }
}
