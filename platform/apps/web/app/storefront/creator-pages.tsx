import { CREATOR_TEXT } from "@learning-routes/core/copy/creator";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { braidShapes } from "@learning-routes/route-map/route-shape";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import { Rising } from "../ui/rising";
import { arrival, RouteFigure } from "../ui/route-figure";
import { CreatorFooter, CreatorHeader, type Links, lessonsOf } from "./creator-frame";
import { EnhancementScript } from "./enhancement-script";
import { inLocale, moduleAndTopicWords } from "./words";

// A creator's page: their portrait, woven from their own routes (docs/design/VISION.md).

const MOST_LINES = 7;
const BRAID = { width: 560, height: 680 };
const ROW_BOX = { width: 340, height: 90 };

/** A portrait woven from the creator's routes, in their colour, drawn once. One route: one line. */
export function CreatorWeave({ routes }: { routes: PublicRoute[] }) {
  if (routes.length === 0) {
    return null;
  }
  const lines = braidShapes(
    routes
      .slice(0, MOST_LINES)
      .map((route) => ({ lessons: lessonsOf(route), seed: route.routeId })),
    BRAID,
  );
  return (
    <svg
      className={`creator-weave${lines.length === 1 ? " creator-weave-one" : ""}`}
      viewBox={`0 0 ${BRAID.width} ${BRAID.height}`}
      aria-hidden="true"
    >
      {lines.map((line, index) => (
        <g key={index} className={`weave-line weave-line-${Math.min(index, 3)}`}>
          <path className="weave-under" d={line.path} />
          <path className="weave-over" d={line.path} pathLength={1} />
          {line.stations.map((station) => (
            <g key={station.at} className={`weave-stop ${arrival(station)}`}>
              <circle cx={station.x} cy={station.y} r="8" />
              <circle className="weave-core" cx={station.x} cy={station.y} r="2.6" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function CreatorRoute({ route, locale }: { route: PublicRoute; locale: LocaleCode }) {
  const words = CREATOR_TEXT[locale];
  return (
    <li>
      <a className="creator-route" href={`/${route.slug}`}>
        <div>
          <h3 className="creator-route-title">
            {inLocale(route.title, locale, route.sourceLocale)}
          </h3>
          <p className="creator-route-facts">{moduleAndTopicWords(locale, route)}</p>
          <p className="creator-route-free">{words.firstModuleFree}</p>
        </div>
        <RouteFigure
          lessons={lessonsOf(route)}
          seed={route.routeId}
          box={ROW_BOX}
          className="creator-route-line"
        />
        <span className="creator-route-go">{words.seeRoute}</span>
      </a>
    </li>
  );
}

export function CreatorPage({
  space,
  routes,
  locale,
  appOrigin,
  platformOrigin,
}: { space: PublicSpace; routes: PublicRoute[]; locale: LocaleCode } & Links) {
  const words = CREATOR_TEXT[locale];
  const name = inLocale(space.name, locale);
  const bio = inLocale(space.bio, locale);
  const tagline = inLocale(space.tagline, locale);
  return (
    <>
      <CreatorHeader space={space} locale={locale} appOrigin={appOrigin}>
        <a className="nav-link" href="#rutas">
          {words.routes}
        </a>
      </CreatorHeader>
      <main className="creator stage moment opening">
        <section className="creator-hero">
          <div className="creator-who">
            <h1 className="creator-headline depth-1">
              <Rising text={name} />
            </h1>
            {tagline ? <p className="creator-tagline settle-1">{tagline}</p> : null}
            {bio ? <p className="creator-bio settle-2">{bio}</p> : null}
            <div className="creator-actions settle-3">
              <ButtonLink href="#rutas">{words.seeRoutes}</ButtonLink>
              <span className="creator-free">{words.freeLine}</span>
            </div>
          </div>
          <CreatorWeave routes={routes} />
        </section>
        <section id="rutas" className="creator-routes">
          <h2 className="creator-section-title depth-2">{words.routesOf}</h2>
          {routes.length === 0 ? (
            <EmptyState title={words.noRoutes} />
          ) : (
            <ul className="creator-route-list">
              {routes.map((route) => (
                <CreatorRoute key={route.routeId} route={route} locale={locale} />
              ))}
            </ul>
          )}
        </section>
      </main>
      <CreatorFooter space={space} locale={locale} platformOrigin={platformOrigin} />
      <EnhancementScript page="stage" />
    </>
  );
}
