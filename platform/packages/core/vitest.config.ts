import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      // Floors that only rise (Platform STEP 1 §4.4): the measured value rounded
      // down, never below 90. Measured 28 October 2026: lines 96.48%, branches 91.06%.
      thresholds: { lines: 96, branches: 91 },
    },
  },
});
