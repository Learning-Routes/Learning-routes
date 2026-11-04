import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute } from "@learning-routes/public-read/reads";
import { RouteFigure } from "../ui/route-figure";
import { filled, inLocale, routeFacts } from "./words";

const CARD_BOX = { width: 340, height: 150 };

/** One route, linking to its one canonical page, on its creator's host. */
export function RouteCard({
  route,
  locale,
  href,
  headingLevel: Heading = "h2",
}: {
  route: PublicRoute;
  locale: LocaleCode;
  href: string;
  headingLevel?: "h2" | "h3";
}) {
  const creator = inLocale(route.spaceName, locale);
  return (
    <a className="route-card" href={href}>
      <RouteFigure
        lessons={route.modules.map((module) => module.lessons.length)}
        seed={route.routeId}
        box={CARD_BOX}
        travels
        className="route-card-line"
      />
      <Heading className="route-card-title">
        {inLocale(route.title, locale, route.sourceLocale)}
      </Heading>
      <p className="route-card-creator">{filled(CATALOG_TEXT[locale].withCreator, { creator })}</p>
      <p className="route-card-facts">{routeFacts(locale, route)}</p>
    </a>
  );
}
