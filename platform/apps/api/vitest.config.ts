import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/db/global-setup.ts"],
    // The persistent module cache keeps an import.meta.glob's file list from an
    // earlier run, so the guard in openrouter.test.ts would not see a new file.
    fsModuleCache: false,
  },
});
