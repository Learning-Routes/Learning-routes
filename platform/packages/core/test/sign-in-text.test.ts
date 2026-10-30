import { describe, expect, it } from "vitest";
import { LOCALES, negotiateLocale } from "../src/locales";
import { SIGN_IN_TEXT } from "../src/sign-in-text";

// The sign-in email and confirmation page in every locale (Platform STEP 2 review,
// owner's answers 2 and 5), in the language the browser asks for.
describe("sign-in text", () => {
  it("exists in every locale, every string filled and distinct from English's", () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(SIGN_IN_TEXT[locale])) {
        expect(text.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
    for (const locale of LOCALES.filter((entry) => entry !== "en")) {
      expect(SIGN_IN_TEXT[locale].emailSubject).not.toBe(SIGN_IN_TEXT.en.emailSubject);
    }
  });

  it("follows the browser's Accept-Language, by weight, with English when none fits", () => {
    expect(negotiateLocale("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(negotiateLocale("de-DE, fr;q=0.4, it;q=0.7")).toBe("it");
    expect(negotiateLocale("es;q=0, en;q=0.1")).toBe("en");
    expect(negotiateLocale("de")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("*")).toBe("en");
  });
});
