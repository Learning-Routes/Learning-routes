import { LANGUAGE_NAMES } from "@learning-routes/core/copy/catalog";
import { CREATOR_TEXT } from "@learning-routes/core/copy/creator";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/parts";
import { filled, inLocale, moduleAndTopicWords } from "./words";

// A creator's page and a route's page, from v2's Vitrina and Ruta (Platform STEP 4 §5).

const MINOR_BASE = 10;

/** A price in words, in the page's language: 29,00 €. */
export function priceInWords(minor: number, currency: string, locale: LocaleCode): string {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / MINOR_BASE ** digits);
}

/** The first letter of a name, until photos arrive in STEP 9. */
function Avatar({ name }: { name: string }) {
  return (
    <span className="creator-avatar" aria-hidden="true">
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

interface Links {
  appOrigin: string;
  platformOrigin: string;
}

function CreatorHeader({
  space,
  locale,
  appOrigin,
  children,
}: {
  space: PublicSpace;
  locale: LocaleCode;
  appOrigin: string;
  children?: React.ReactNode;
}) {
  const name = inLocale(space.name, locale);
  return (
    <header className="site-header">
      <a className="brand" href="/">
        <Avatar name={name} />
        {name}
      </a>
      <nav className="site-nav" aria-label={CREATOR_TEXT[locale].routes}>
        {children}
        <a className="nav-link" href={`${appOrigin}/sign-in`}>
          {CREATOR_TEXT[locale].signIn}
        </a>
      </nav>
    </header>
  );
}

function CreatorFooter({
  space,
  locale,
  platformOrigin,
}: {
  space: PublicSpace;
  locale: LocaleCode;
  platformOrigin: string;
}) {
  return (
    <footer className="creator-footer">
      <span>{`© ${inLocale(space.name, locale)}`}</span>
      <a className="text-link" href={platformOrigin}>
        {CREATOR_TEXT[locale].madeWith}
      </a>
    </footer>
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
  return (
    <>
      <CreatorHeader space={space} locale={locale} appOrigin={appOrigin}>
        <a className="nav-link" href="#rutas">
          {words.routes}
        </a>
        {bio ? (
          <a className="nav-link" href="#sobre">
            {words.about}
          </a>
        ) : null}
      </CreatorHeader>
      <main className="creator">
        <section className="creator-hero">
          <h1 className="creator-headline">{inLocale(space.tagline, locale) || name}</h1>
          <div className="creator-actions">
            <ButtonLink href="#rutas">{words.seeRoutes}</ButtonLink>
            <span className="creator-free">{words.freeLine}</span>
          </div>
        </section>
        <section id="rutas" className="creator-routes">
          <h2 className="creator-section-title">{words.routesOf}</h2>
          {routes.length === 0 ? (
            <EmptyState title={words.noRoutes} />
          ) : (
            <ul className="creator-route-list">
              {routes.map((route) => (
                <li key={route.routeId}>
                  <a className="creator-route" href={`/${route.slug}`}>
                    <span className="creator-route-facts">
                      {moduleAndTopicWords(locale, route)}
                    </span>
                    <h3 className="creator-route-title">
                      {inLocale(route.title, locale, route.sourceLocale)}
                    </h3>
                    <p className="creator-route-body">
                      {inLocale(route.description, locale, route.sourceLocale)}
                    </p>
                    <span className="creator-route-free">{words.firstModuleFree}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        {bio ? (
          <section id="sobre" className="creator-about">
            <h2 className="creator-section-title">{words.about}</h2>
            <p className="creator-about-body">{bio}</p>
          </section>
        ) : null}
      </main>
      <CreatorFooter space={space} locale={locale} platformOrigin={platformOrigin} />
    </>
  );
}

function Journey({ route, locale }: { route: PublicRoute; locale: LocaleCode }) {
  const words = CREATOR_TEXT[locale];
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  return (
    <section className="journey" aria-labelledby="journey-title">
      <h2 id="journey-title" className="creator-section-title">
        {words.journey}
      </h2>
      <ol className="journey-stations">
        {route.modules.map((module, index) => (
          <li key={module.id} className={index === 0 ? "journey-station-free" : "journey-station"}>
            <div className="journey-station-head">
              <h3 className="journey-title">
                {filled(words.moduleTitle, {
                  n: index + 1,
                  title: inLocale(module.title, locale, route.sourceLocale),
                })}
              </h3>
              {index === 0 ? <span className="journey-free">{words.free}</span> : null}
            </div>
            <p className="journey-topics">
              {list.format(
                module.lessons.map((lesson) => inLocale(lesson, locale, route.sourceLocale)),
              )}
            </p>
          </li>
        ))}
        <li className="journey-exam">
          <h3 className="journey-title">{words.finalExam}</h3>
        </li>
      </ol>
    </section>
  );
}

function StartCard({
  route,
  locale,
  appOrigin,
}: {
  route: PublicRoute;
  locale: LocaleCode;
  appOrigin: string;
}) {
  const words = CREATOR_TEXT[locale];
  const offer =
    route.priceMinor !== null && route.currency !== null
      ? filled(words.startPaid, { price: priceInWords(route.priceMinor, route.currency, locale) })
      : words.startFree;
  return (
    <aside className="start-card">
      <p className="start-title">{words.startTitle}</p>
      <p className="start-offer">{offer}</p>
      {/* Only the route's id: the app resolves everything else on the server. */}
      <ButtonLink className="start-action" href={`${appOrigin}/empezar?ruta=${route.routeId}`}>
        {words.start}
      </ButtonLink>
      <p className="start-note">{words.startNote}</p>
    </aside>
  );
}

export function RoutePage({
  space,
  route,
  locale,
  appOrigin,
  platformOrigin,
}: { space: PublicSpace; route: PublicRoute; locale: LocaleCode } & Links) {
  const words = CREATOR_TEXT[locale];
  const language = LANGUAGE_NAMES[locale][route.sourceLocale as LocaleCode] ?? route.sourceLocale;
  return (
    <>
      <CreatorHeader space={space} locale={locale} appOrigin={appOrigin} />
      <div className="route-page">
        <main className="route-main">
          <div className="route-intro">
            <h1 className="route-title">{inLocale(route.title, locale, route.sourceLocale)}</h1>
            <p className="route-description">
              {inLocale(route.description, locale, route.sourceLocale)}
            </p>
            <p className="route-facts">
              {`${moduleAndTopicWords(locale, route)}. ${words.levels[route.level]} ${filled(words.inLanguage, { language })}`}
            </p>
          </div>
          <Journey route={route} locale={locale} />
          <section className="route-how">
            <h2 className="creator-section-title">{words.howTitle}</h2>
            <p className="route-how-body">{words.howBody}</p>
          </section>
        </main>
        <StartCard route={route} locale={locale} appOrigin={appOrigin} />
      </div>
      <CreatorFooter space={space} locale={locale} platformOrigin={platformOrigin} />
    </>
  );
}
