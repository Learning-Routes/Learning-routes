import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { pageContext } from "../../context";
import { storefrontHeaders } from "../../storefront/cache";
import { RoutePage } from "../../storefront/route-page-view";
import "../../storefront/creator.css";
import "../../storefront/page-transitions.css";
import { courseData } from "../../storefront/course-data";
import { pageLocale, withLang } from "../../storefront/page-locale";
import { publicReads } from "../../storefront/public-reads.server";
import { inLocale } from "../../storefront/words";
import { storefront } from "../../surface";
import type { Route } from "./+types/route-page";

export const handle = storefront;

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const found = await publicReads(context, async (reads) => ({
    space: await reads.spaceBySlug(params.slug),
    route: await reads.routeBySlug(params.slug, params.routeSlug),
    retired: await reads.isRetired(params.slug),
  }));
  if (found.retired) {
    throw data(null, { status: 410 });
  }
  const { space, route } = found;
  if (space === null || route === null) {
    throw data(null, { status: 404 });
  }
  const { appOrigin, platformOrigin } = context.get(pageContext);
  return data(
    {
      space,
      route,
      locale: pageLocale(url, space, route.title),
      appOrigin,
      platformOrigin,
      origin: url.origin,
    },
    { headers: storefrontHeaders([`space:${space.id}`, `route:${route.routeId}`]) },
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [];
  }
  const { space, route, locale, origin } = loaderData;
  const title = inLocale(route.title, locale, route.sourceLocale);
  const description = inLocale(route.description, locale, route.sourceLocale) || title;
  const path = `/${route.slug}`;
  const canonical = `${origin}${withLang(path, locale, space)}`;
  // Only the locales the space has text in, and this route too.
  const withText = (space.locales as LocaleCode[]).filter(
    (each) => (route.title as Record<string, unknown>)[each] !== undefined,
  );
  return [
    { title: `${title} | ${inLocale(space.name, locale)}` },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    ...(space.brandColor
      ? [{ tagName: "link", rel: "stylesheet", href: `/_brand/${space.brandColor.slice(1)}.css` }]
      : []),
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: BRAND },
    { property: "og:image", content: `${origin}/og-${locale}.png` },
    { "script:ld+json": courseData({ route, space, locale, canonical }) },
    ...alternates(origin, withText, (each) => withLang(path, each, space), path),
  ];
}

export default function RouteOfCreator({ loaderData }: Route.ComponentProps) {
  return <RoutePage {...loaderData} />;
}
