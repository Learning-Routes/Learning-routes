import { describe, expect, it } from "vitest";

// Vitest's coverage counts only modules a test imports, so an untested module
// would not lower the floors. Loading every source module here makes its
// unexecuted lines count (Platform STEP 1 §4.4).
const modules = import.meta.glob(["../src/**/*.ts", "!**/*.d.ts"], { eager: true });

describe("coverage", () => {
  it("loads every source module, so an untested one lowers the floors", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(20);
  });
});
