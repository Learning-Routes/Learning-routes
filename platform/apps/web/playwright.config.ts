import { defineConfig } from "@playwright/test";

// The built Worker, served by workerd through `vite preview`. The browser is the
// installed Chrome (GitHub's Ubuntu runners have it), so nothing is downloaded.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4173", channel: "chrome" },
  webServer: {
    command: "vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: false,
  },
});
