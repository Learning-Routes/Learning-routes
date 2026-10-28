import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    benchmark: {
      // Calls inside core still go through the module runner's export getters.
      // The baseline is measured the same way, so the comparison holds; the
      // absolute numbers are higher than in a bundled build.
      suppressExportGetterWarnings: true,
    },
  },
});
