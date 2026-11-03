import { isLocale, type LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";

// A creator's page in a locale (Platform STEP 4 §5.4). A route's slug could be any word,
// "en" too, so the locale is a query value, and only one the space has text in counts.

interface SpaceLocales {
  defaultLocale: string;
  locales: string[];
}

export function pageLocale(url: URL, space: SpaceLocales, text?: LocalizedText): LocaleCode {
  const asked = url.searchParams.get("lang") ?? "";
  const has = (locale: string) =>
    text === undefined || (text as Record<string, unknown>)[locale] !== undefined;
  if (isLocale(asked) && space.locales.includes(asked) && has(asked)) {
    return asked;
  }
  return space.defaultLocale as LocaleCode;
}

/** The page's URL in a locale: the space's own language has no query, so one URL is canonical. */
export function withLang(path: string, locale: string, space: SpaceLocales): string {
  return locale === space.defaultLocale ? path : `${path}?lang=${locale}`;
}
