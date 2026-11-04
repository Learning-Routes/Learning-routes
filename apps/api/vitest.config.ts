import { defineConfig } from "vitest/config";

// The persistent module cache keeps an import.meta.glob's file list from an
// earlier run, so the guard in openrouter.test.ts would not see a new file.
const shared = { globalSetup: ["./test/db/global-setup.ts"], fsModuleCache: false };

export default defineConfig({
  test: {
    ...shared,
    projects: [
      {
        test: {
          ...shared,
          name: "parallel",
          exclude: ["**/node_modules/**", "**/*.exclusive.test.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          ...shared,
          name: "exclusive",
          include: ["**/*.exclusive.test.ts"],
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
