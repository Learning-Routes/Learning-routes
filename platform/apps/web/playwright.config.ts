import { defineConfig } from "@playwright/test";

// The built Worker, served by workerd through `vite preview`. The browser is the
// installed Chrome (GitHub's Ubuntu runners have it), so nothing is downloaded.
// Port 4173 runs as production. Port 4174 is the same build with ENVIRONMENT set to
// development, for the components page, on an app origin that keeps the theme cookie.
const LOCAL = {
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  APP_ORIGIN: "http://localhost:4174",
  ENVIRONMENT: "development",
};

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4173", channel: "chrome" },
  webServer: [
    {
      command: "vite preview --port 4173 --strictPort",
      url: "http://localhost:4173/",
      reuseExistingServer: false,
    },
    {
      command: "vite preview --port 4174 --strictPort",
      url: "http://localhost:4174/",
      reuseExistingServer: false,
      env: LOCAL,
    },
  ],
});
