// The locales, with no zod, so browser code can import them (core/locales).

export const LOCALES = ["es", "en", "pt", "fr", "it"] as const;

/** New: whether a string (a URL segment, a header) names one of our locales. */
export function isLocale(value: string): value is (typeof LOCALES)[number] {
  return (LOCALES as readonly string[]).includes(value);
}
