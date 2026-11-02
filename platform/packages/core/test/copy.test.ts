import { describe, expect, it } from "vitest";
import { LANDING_TEXT } from "../src/copy/landing";
import { SIGN_IN_TEXT } from "../src/copy/sign-in";
import { UI_COPY } from "../src/copy/ui";
import { LOCALES } from "../src/locales";

// Spanish is the source (Platform STEP 3 §5.4): a locale missing a key that Spanish
// has, or leaving one empty, fails here.

function missingKeys(source: unknown, target: unknown, path = ""): string[] {
  if (typeof source === "string") {
    return typeof target === "string" && target.trim().length > 0 ? [] : [path];
  }
  if (source === null || typeof source !== "object") {
    return [];
  }
  return Object.entries(source).flatMap(([key, value]) =>
    missingKeys(value, (target as Record<string, unknown> | undefined)?.[key], `${path}.${key}`),
  );
}

describe("the copy check", () => {
  it("catches a missing key, an empty one and a short list", () => {
    const source = { a: "uno", b: "dos", c: [{ d: "tres" }, { d: "cuatro" }] };
    expect(missingKeys(source, { a: "one", b: " ", c: [{ d: "three" }] })).toEqual([
      ".b",
      ".c.1.d",
    ]);
  });

  describe.each([
    ["ui", UI_COPY],
    ["sign-in", SIGN_IN_TEXT],
    ["landing", LANDING_TEXT],
  ] as const)("%s", (_name, copy) => {
    it.each(LOCALES.filter((locale) => locale !== "es"))(
      "%s has every key Spanish has",
      (locale) => {
        expect(missingKeys(copy.es, copy[locale])).toEqual([]);
      },
    );
  });

  it("keeps each placeholder in every locale", () => {
    for (const locale of LOCALES) {
      expect(SIGN_IN_TEXT[locale].resendIn).toContain("{seconds}");
      expect(LANDING_TEXT[locale].moduleName).toContain("{n}");
      expect(LANDING_TEXT[locale].moduleProgress).toContain("{done}");
      expect(LANDING_TEXT[locale].moduleProgress).toContain("{total}");
      expect(LANDING_TEXT[locale].moduleTopics).toContain("{n}");
    }
  });
});
