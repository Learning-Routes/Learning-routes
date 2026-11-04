// The locales, with no zod, so browser code can import them (core/locales).

export const LOCALES = ["es", "en", "pt", "fr", "it"] as const;

// The visible name, here and only here: a test keeps it the one place.
export const BRAND = "Learning Routes";
// Where the platform is served.
export const PLANNED_HOST = "learningroutes.com";

/** New: whether a string (a URL segment, a header) names one of our locales. */
export function isLocale(value: string): value is (typeof LOCALES)[number] {
  return (LOCALES as readonly string[]).includes(value);
}

export type LocaleCode = (typeof LOCALES)[number];

/**
 * The best of our locales for an Accept-Language header, by its weights; the
 * fallback when none fits. Only the primary tag counts: pt-BR is pt.
 */
export function negotiateLocale(
  header: string | null | undefined,
  fallback: LocaleCode = "en",
): LocaleCode {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const weight = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return {
        tag: tag.toLowerCase().split("-")[0] ?? "",
        q: weight ? Number(weight.slice(2)) : 1,
      };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  const found = ranked.find((entry) => isLocale(entry.tag));
  return found ? (found.tag as LocaleCode) : fallback;
}
