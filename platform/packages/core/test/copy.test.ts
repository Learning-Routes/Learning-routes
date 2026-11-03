import { describe, expect, it } from "vitest";
import { ADMIN_TEXT } from "../src/copy/admin";
import { APP_PAGES_TEXT } from "../src/copy/app-pages";
import { CATALOG_TEXT } from "../src/copy/catalog";
import { CREATOR_TEXT } from "../src/copy/creator";
import { LANDING_TEXT } from "../src/copy/landing";
import { LEVEL_NAMES, TOPIC_NAMES } from "../src/copy/route-facts";
import { SIGN_IN_TEXT } from "../src/copy/sign-in";
import { UI_COPY } from "../src/copy/ui";
import { LOCALES, type LocaleCode } from "../src/locales";

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

// Words a person no longer reads (FOUNDATIONS §4b). Code and URLs keep their own names.
// "Check your email" stays: the old word is the noun, as in "answer a check".
const OLD_WORDS: Record<LocaleCode, string[]> = {
  es: ["refuerzos?", "comprobaci(?:ón|ones)", "vitrinas?", "estudio", "agentes?"],
  en: [
    "refreshers?",
    "reinforcements?",
    "(?:a|an|the|each|every) check",
    "checks",
    "storefronts?",
    "studios?",
    "agents?",
  ],
  pt: ["reforços?", "verificaç(?:ão|ões)", "vitrines?", "estúdios?", "agentes?"],
  fr: ["renforts?", "vérifications?", "vitrines?", "studios?", "agents?", "déconnectée?"],
  it: ["rinforz[oi]", "verific(?:a|he)", "vetrin[ae]", "studio", "agent[ei]", "uscit[oa]"],
};

function oldWordsIn(value: unknown, locale: LocaleCode): string[] {
  if (typeof value === "string") {
    return OLD_WORDS[locale].flatMap(
      (word) => value.match(new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, "giu")) ?? [],
    );
  }
  return value !== null && typeof value === "object"
    ? Object.values(value).flatMap((entry) => oldWordsIn(entry, locale))
    : [];
}

describe("the copy check", () => {
  it("catches a missing key, an empty one and a short list", () => {
    const source = { a: "uno", b: "dos", c: [{ d: "tres" }, { d: "cuatro" }] };
    expect(missingKeys(source, { a: "one", b: " ", c: [{ d: "three" }] })).toEqual([
      ".b",
      ".c.1.d",
    ]);
  });

  it("catches an old word, in any letter case, and leaves longer words and the verb alone", () => {
    expect(oldWordsIn({ a: ["Tu Vitrina", "un refuerzo"], b: "estudiar" }, "es")).toEqual([
      "Vitrina",
      "refuerzo",
    ]);
    expect(oldWordsIn("Answer a check. Check your email.", "en")).toEqual(["a check"]);
    expect(oldWordsIn("Une vérification", "fr")).toEqual(["vérification"]);
  });

  describe.each([
    ["ui", UI_COPY],
    ["sign-in", SIGN_IN_TEXT],
    ["landing", LANDING_TEXT],
    ["catalog", CATALOG_TEXT],
    ["creator", CREATOR_TEXT],
    ["app pages", APP_PAGES_TEXT],
    ["admin", ADMIN_TEXT],
    ["topics", TOPIC_NAMES],
    ["levels", LEVEL_NAMES],
  ] as const)("%s", (_name, copy) => {
    it.each(LOCALES.filter((locale) => locale !== "es"))(
      "%s has every key Spanish has",
      (locale) => {
        expect(missingKeys(copy.es, copy[locale])).toEqual([]);
      },
    );
    it.each(LOCALES)("%s has none of the old words", (locale) => {
      expect(oldWordsIn(copy[locale], locale)).toEqual([]);
    });
  });

  it("keeps each placeholder in every locale", () => {
    for (const locale of LOCALES) {
      expect(SIGN_IN_TEXT[locale].resendIn).toContain("{seconds}");
      const catalog = CATALOG_TEXT[locale];
      for (const count of [
        catalog.moduleOne,
        catalog.moduleMany,
        catalog.topicOne,
        catalog.topicMany,
      ]) {
        expect(count).toContain("{n}");
      }
      for (const name of ["{modules}", "{topics}", "{language}"]) {
        expect(catalog.facts).toContain(name);
      }
      expect(catalog.withCreator).toContain("{creator}");
      expect(APP_PAGES_TEXT[locale].joining).toContain("{route}");
      expect(APP_PAGES_TEXT[locale].joiningBody).toContain("{creator}");
      expect(APP_PAGES_TEXT[locale].doneBody).toContain("{email}");
      expect(ADMIN_TEXT[locale].place).toContain("{n}");
      expect(CREATOR_TEXT[locale].startPaid).toContain("{price}");
      expect(CREATOR_TEXT[locale].moduleTitle).toContain("{title}");
      expect(CREATOR_TEXT[locale].inLanguage).toContain("{language}");
      expect(catalog.noResults).toContain("{search}");
      expect(catalog.noResultsInTopic).toContain("{topic}");
    }
  });
});
