import { defineConfig, devices } from "@playwright/test";

// The escape test, in the three engines people use: Chromium, Firefox and WebKit (Safari's).
export default defineConfig({
  testDir: ".",
  // One visit at a time: the counts are shared.
  workers: 1,
  webServer: {
    command: "tsx servers.ts",
    url: "http://localhost:4310/",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
