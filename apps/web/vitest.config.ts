import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts: unit tests render components in Node and do not
// need the React Router or Cloudflare plugins. e2e/ is Playwright's.
export default defineConfig({
  test: {
    // The production check's inbox reader is tested here too; Playwright never runs this file.
    include: ["test/**/*.test.{ts,tsx}", "e2e/prod/*.test.ts"],
    // The persistent module cache keeps an import.meta.glob's file list from an
    // earlier run, so the guard in ids.test.ts would not see a new file.
    fsModuleCache: false,
  },
});
