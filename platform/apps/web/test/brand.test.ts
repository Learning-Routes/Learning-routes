import { BRAND, PLANNED_HOST } from "@learning-routes/core/locales";
import { describe, expect, it } from "vitest";
import type { Route } from "../app/routes/storefront/+types/landing";
import { meta as landingMeta } from "../app/routes/storefront/landing";
import { meta as studioMeta } from "../app/routes/studio";

// Every platform source file, as text. The test's own file is outside these globs.
const sources = {
  ...import.meta.glob<string>("../app/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../../api/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob<string>("../../../packages/*/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
};

describe("the visible name while the platform is built", () => {
  it("is New Learning Routes, at new.learningroutes.com", () => {
    expect(BRAND).toBe("New Learning Routes");
    expect(PLANNED_HOST).toBe("new.learningroutes.com");
  });

  it("titles the pages", () => {
    const loaderData = { lang: "es", origin: "https://new.learningroutes.com" } as const;
    expect(landingMeta({ loaderData } as Route.MetaArgs)).toContainEqual({ title: BRAND });
    expect(studioMeta()).toContainEqual({ title: `Estudio · ${BRAND}` });
  });

  it("is written in one place only, so the switch is a one-line change", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(20);
    const writers = files
      .filter(([, text]) => text.includes("Learning Routes"))
      .map(([file]) => file);
    expect(writers).toEqual(["../../../packages/core/src/locales.ts"]);
  });
});
