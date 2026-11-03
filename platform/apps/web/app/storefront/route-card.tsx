import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute } from "@learning-routes/public-read/reads";
import { routeLine } from "@learning-routes/route-map/route-line";
import { filled, inLocale, routeFacts } from "./words";

/** The route's own line: its shape comes from its modules and lessons. */
function RouteLineMark({ route }: { route: PublicRoute }) {
  const line = routeLine(
    route.modules.map((module) => module.lessons.length),
    route.routeId,
  );
  // Presentation attributes, which the strict CSP allows; dark mode overrides them in CSS.
  const color = route.spaceBrandColor ?? undefined;
  return (
    <svg className="route-line" viewBox="0 0 320 100" aria-hidden="true">
      <path className="route-line-road" d={line.path} />
      <path className="route-line-way" d={line.path} pathLength={1} stroke={color} />
      <path className="route-line-runner" d={line.path} pathLength={1} />
      <circle className="route-line-start" cx={line.start.x} cy={line.start.y} r="9" fill={color} />
      <rect
        className="route-line-end"
        x={line.end.x - 9}
        y={line.end.y - 9}
        width="18"
        height="18"
        rx="3"
      />
    </svg>
  );
}

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
      <RouteLineMark route={route} />
      <Heading className="route-card-title">
        {inLocale(route.title, locale, route.sourceLocale)}
      </Heading>
      <p className="route-card-creator">{filled(CATALOG_TEXT[locale].withCreator, { creator })}</p>
      <p className="route-card-facts">{routeFacts(locale, route)}</p>
    </a>
  );
}
