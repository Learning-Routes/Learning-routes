import { LANGUAGE_NAMES } from "@learning-routes/core/copy/catalog";
import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { BRAND, isLocale, LOCALES, type LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute } from "@learning-routes/public-read/reads";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { pageContext } from "../../context";
import { CloseSheet } from "../../landing/close-sheet";
import "../../landing/landing.css";
import { LandingStageSection } from "../../landing/stage";
import "../../storefront/catalog.css";
import "../../storefront/page-transitions.css";
import { storefrontHeaders } from "../../storefront/cache";
import { EnhancementScript } from "../../storefront/enhancement-script";
import { publicReads } from "../../storefront/public-reads.server";
import { RouteCard } from "../../storefront/route-card";
import { PlatformHeader } from "../../storefront/site-frame";
import { storefront } from "../../surface";
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
  const { protocol } = new URL(origin);
  return (
    <div className="lp moment">
      <PlatformHeader locale={lang} appOrigin={appOrigin} />
      <main className="lp-main">
        <LandingStageSection locale={lang} />
        <RoutesToStart
          lang={lang}
          routes={routes}
          creatorOrigin={(slug) => `${protocol}//${slug}.${creatorDomain}`}
        />
        <CloseSheet locale={lang} teachHref={`${appOrigin}/quiero-ensenar`} />
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap">
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
        </div>
      </footer>
      <EnhancementScript page="landing" />
    </div>
  );
}
