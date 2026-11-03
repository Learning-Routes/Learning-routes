import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { inLocale } from "./words";

const CENTS = 100;

/** schema.org/Course for a route's page (Platform STEP 4 §5.4). */
export function courseData({
  route,
  space,
  locale,
  canonical,
}: {
  route: PublicRoute;
  space: PublicSpace;
  locale: LocaleCode;
  canonical: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: inLocale(route.title, locale, route.sourceLocale),
    description: inLocale(route.description, locale, route.sourceLocale),
    url: canonical,
    inLanguage: route.sourceLocale,
    provider: { "@type": "Organization", name: inLocale(space.name, locale) },
    ...(route.priceMinor !== null && route.currency !== null
      ? {
          offers: {
            "@type": "Offer",
            price: (route.priceMinor / CENTS).toFixed(2),
            priceCurrency: route.currency,
            category: "Paid",
          },
        }
      : {}),
  };
}
