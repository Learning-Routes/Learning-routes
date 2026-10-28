import type { LOCALES } from "@learning-routes/core/locales";

type Locale = (typeof LOCALES)[number];

/**
 * The hreflang links for a page: one per locale that has text, the page's own
 * included, by full URL, plus x-default. The set depends only on which locales
 * have text, so every page in it lists the same links (they are reciprocal). A
 * locale without text gets no link: it has no page.
 */
export function alternates(
  origin: string,
  withText: readonly Locale[],
  path: (l: Locale) => string,
) {
  const link = (hrefLang: string, href: string) =>
    ({ tagName: "link", rel: "alternate", hrefLang, href }) as const;
  return [
    ...withText.map((locale) => link(locale, `${origin}${path(locale)}`)),
    link("x-default", `${origin}/`),
  ];
}
