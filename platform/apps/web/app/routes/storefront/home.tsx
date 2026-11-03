import { CATALOG_TEXT, LANGUAGE_NAMES } from "@learning-routes/core/copy/catalog";
import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { BRAND, isLocale, LOCALES, type LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute } from "@learning-routes/public-read/reads";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { pageContext } from "../../context";
import { HeroRoute } from "../../landing/hero-route";
import "../../landing/landing.css";
import "../../storefront/catalog.css";
import { storefrontHeaders } from "../../storefront/cache";
import { publicReads } from "../../storefront/public-reads.server";
import { RouteCard } from "../../storefront/route-card";
import { PlatformHeader } from "../../storefront/site-frame";
import { storefront } from "../../surface";
import { ButtonLink } from "../../ui/button";
import { TextLink } from "../../ui/parts";
import type { Route } from "./+types/home";

export const handle = storefront;

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

/** The landing still stands with the database down, with no routes, and is not kept so. */
async function routesToStart(
  context: Route.LoaderArgs["context"],
): Promise<{ routes: PublicRoute[]; headers: HeadersInit }> {
  try {
    const routes = await publicReads(context, (reads) => reads.routesToStart());
    const tags = ["catalog", ...routes.map((route) => `route:${route.routeId}`)];
    return { routes, headers: storefrontHeaders(tags) };
  } catch (error) {
    console.error(JSON.stringify({ message: "landing without routes", error: String(error) }));
    return { routes: [], headers: { "Cache-Control": "no-store" } };
  }
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const lang = params.lang;
  if (!isLocale(lang)) {
    throw data(null, { status: 404 });
  }
  const { routes, headers: cacheHeaders } = await routesToStart(context);
  const { appOrigin, creatorDomain } = context.get(pageContext);
  const origin = new URL(request.url).origin;
  return data({ lang, origin, routes, appOrigin, creatorDomain }, { headers: cacheHeaders });
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [];
  }
  const { lang, origin } = loaderData;
  const words = LANDING_TEXT[lang];
  return [
    { title: BRAND },
    { name: "description", content: words.description },
    { tagName: "link", rel: "canonical", href: `${origin}/${lang}` },
    { property: "og:title", content: BRAND },
    { property: "og:description", content: words.description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: `${origin}/og-${lang}.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    ...alternates(origin, LOCALES, (locale) => `/${locale}`),
  ];
}

function RoutesToStart({
  lang,
  routes,
  creatorOrigin,
}: {
  lang: LocaleCode;
  routes: PublicRoute[];
  creatorOrigin: (slug: string) => string;
}) {
  // The whole section is hidden when there are none.
  if (routes.length === 0) {
    return null;
  }
  const words = LANDING_TEXT[lang];
  return (
    <section className="landing-routes">
      <div className="landing-routes-head">
        <h2 className="landing-section-title">{words.routesTitle}</h2>
        <TextLink href={`/${lang}/explorar`}>{words.allRoutes}</TextLink>
      </div>
      <ul className="landing-routes-grid">
        {routes.map((route) => (
          <li key={route.routeId}>
            <RouteCard
              route={route}
              locale={lang}
              href={`${creatorOrigin(route.spaceSlug)}/${route.slug}`}
              headingLevel="h3"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StorefrontHome({ loaderData }: Route.ComponentProps) {
  const { lang, origin, routes, appOrigin, creatorDomain } = loaderData;
  const words = LANDING_TEXT[lang];
  const shared = CATALOG_TEXT[lang];
  const teach = `${appOrigin}/quiero-ensenar`;
  const { protocol } = new URL(origin);
  return (
    <>
      <PlatformHeader locale={lang} appOrigin={appOrigin} />
      <main className="landing">
        <section className="landing-hero">
          <div className="landing-hero-text">
            <h1 className="landing-headline">{words.headline}</h1>
            <p className="landing-lead">{words.lead}</p>
            <div className="landing-actions">
              <ButtonLink href={`/${lang}/explorar`}>{shared.explore}</ButtonLink>
              <TextLink href={teach}>{words.teachLink}</TextLink>
            </div>
          </div>
          <figure className="landing-hero-figure">
            <HeroRoute words={words} />
          </figure>
        </section>
        <section className="landing-steps-section">
          <h2 className="landing-section-title">{words.stepsTitle}</h2>
          <ol className="landing-steps">
            {words.steps.map((step, index) => (
              <li key={step.title} className="landing-step">
                <span className="landing-step-number">{index + 1}</span>
                <h3 className="landing-step-title">{step.title}</h3>
                <p className="landing-step-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <RoutesToStart
          lang={lang}
          routes={routes}
          creatorOrigin={(slug) => `${protocol}//${slug}.${creatorDomain}`}
        />
        <section className="landing-teach">
          <svg className="landing-teach-line" viewBox="0 0 600 200" aria-hidden="true">
            <path d="M0 180 C 120 180, 160 60, 300 70 S 480 160, 600 20" />
          </svg>
          <div className="landing-teach-text">
            <h2 className="landing-teach-title">{shared.teachTitle}</h2>
            <p className="landing-teach-body">{shared.teachBody}</p>
          </div>
          <div className="landing-teach-action">
            <ButtonLink href={teach} emphasis="secondary">
              {shared.teachAction}
            </ButtonLink>
            <span className="landing-teach-note">{words.teachInvitation}</span>
          </div>
        </section>
        <footer className="landing-footer">
          <span>{BRAND}</span>
          <ul>
            {LOCALES.map((locale) => (
              <li key={locale}>
                <a className="text-link" href={`/${locale}`} hrefLang={locale} lang={locale}>
                  {LANGUAGE_NAMES[locale][locale]}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </main>
    </>
  );
}
