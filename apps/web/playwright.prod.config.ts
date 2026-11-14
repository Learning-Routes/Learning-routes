import { defineConfig } from "@playwright/test";

// The production student check (STEP 11-prep §A3): e2e/prod against the live site, never with the
// default projects (playwright.config.ts leaves e2e/prod out). One student, so one run at a time:
// the 390 run starts after the 1440 one.
export default defineConfig({
  testDir: "e2e/prod",
  testMatch: "student.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "prod-report" }]],
  outputDir: "prod-results",
  use: { channel: "chrome", locale: "es-ES", trace: "off" },
  projects: [
    { name: "prod-1440", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "prod-390",
      use: { viewport: { width: 390, height: 844 } },
      dependencies: ["prod-1440"],
    },
  ],
});
