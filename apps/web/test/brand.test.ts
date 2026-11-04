import { BRAND, PLANNED_HOST } from "@learning-routes/core/locales";
import { describe, expect, it } from "vitest";
import type { Route } from "../app/routes/storefront/+types/home";
import { meta as storefrontMeta } from "../app/routes/storefront/home";
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
  it("is Learning Routes, at learningroutes.com", () => {
    expect(BRAND).toBe("Learning Routes");
    expect(PLANNED_HOST).toBe("learningroutes.com");
  });

  it("titles the pages", () => {
    const loaderData = { lang: "es", origin: "https://learningroutes.com" } as const;
    expect(storefrontMeta({ loaderData } as unknown as Route.MetaArgs)).toContainEqual({
      title: BRAND,
    });
    expect(studioMeta()).toContainEqual({ title: `Enseñar · ${BRAND}` });
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
