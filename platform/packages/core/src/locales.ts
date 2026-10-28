// The locales, with no zod, so browser code can import them (core/locales).

export const LOCALES = ["es", "en", "pt", "fr", "it"] as const;

// The visible name while the platform is built beside v1 (FOUNDATIONS.md §2). At
// the switch it drops "New", here and only here: a test keeps it the one place.
export const BRAND = "New Learning Routes";
// Where it will be served until the switch; not deployed yet.
export const PLANNED_HOST = "new.learningroutes.com";

/** New: whether a string (a URL segment, a header) names one of our locales. */
export function isLocale(value: string): value is (typeof LOCALES)[number] {
  return (LOCALES as readonly string[]).includes(value);
}
