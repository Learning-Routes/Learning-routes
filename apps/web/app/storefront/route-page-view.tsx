import { LANGUAGE_NAMES } from "@learning-routes/core/copy/catalog";
import { CREATOR_TEXT } from "@learning-routes/core/copy/creator";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { ButtonLink } from "../ui/button";
import { Rising } from "../ui/rising";
import { RouteFigure } from "../ui/route-figure";
import {
  Avatar,
  CreatorFooter,
  CreatorHeader,
  type Links,
  lessonsOf,
  priceInWords,
} from "./creator-frame";
import { EnhancementScript } from "./enhancement-script";
import { filled, inLocale, moduleAndTopicWords } from "./words";

// A route's page: you walk the route before you start it (docs/design/VISION.md).

const MINI_BOX = { width: 340, height: 90 };

/** Every station of the route, with its own mark, so it reads whole with no script. */
function Journey({ route, locale }: { route: PublicRoute; locale: LocaleCode }) {
  const words = CREATOR_TEXT[locale];
  return (
    <section className="journey" aria-labelledby="journey-title">
      <h2 id="journey-title" className="creator-section-title">
        {words.journey}
      </h2>
      <div className="journey-way">
        <ol className="journey-stops">
          {route.modules.flatMap((module, index) => [
            <li key={module.id} className="journey-stop journey-stop-module" data-kind="module">
              <span className="journey-module-number">
                {filled(words.moduleNumber, { n: index + 1 })}
              </span>
              <h3 className="journey-name">
                {inLocale(module.title, locale, route.sourceLocale)}
                {index === 0 ? <span className="journey-free">{words.free}</span> : null}
              </h3>
            </li>,
            ...module.lessons.map((lesson, lessonIndex) => (
              <li key={`${module.id}-${lessonIndex}`} className="journey-stop" data-kind="topic">
                {`${lessonIndex + 1}. ${inLocale(lesson, locale, route.sourceLocale)}`}
              </li>
            )),
          ])}
        </ol>
      </div>
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
    // A price is only an offer once it can be paid (Platform STEP 10).
    route.pricing === "paid" && route.priceMinor !== null && route.currency !== null
      ? filled(words.startPaid, { price: priceInWords(route.priceMinor, route.currency, locale) })
      : words.startFree;
  return (
    <aside className="start-card settle-4">
      <RouteFigure lessons={lessonsOf(route)} seed={route.routeId} box={MINI_BOX} />
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
  const creator = inLocale(space.name, locale);
  return (
    <>
      <CreatorHeader space={space} locale={locale} appOrigin={appOrigin} />
      <div className="route-page stage moment opening">
        <section className="route-intro">
          <a className="route-by settle-1" href="/">
            <Avatar name={creator} />
            {filled(words.routeBy, { creator })}
          </a>
          <h1 className="route-title">
            <Rising text={inLocale(route.title, locale, route.sourceLocale)} />
          </h1>
          <p className="route-description settle-2">
            {inLocale(route.description, locale, route.sourceLocale)}
          </p>
          <p className="route-facts settle-3">
            {`${moduleAndTopicWords(locale, route)}. ${words.levels[route.level]} ${filled(words.inLanguage, { language })}`}
          </p>
        </section>
        <div className="route-body">
          <main className="route-main">
            <Journey route={route} locale={locale} />
          </main>
          <StartCard route={route} locale={locale} appOrigin={appOrigin} />
        </div>
      </div>
      <CreatorFooter space={space} locale={locale} platformOrigin={platformOrigin} />
      <EnhancementScript page="stage" />
    </>
  );
}
