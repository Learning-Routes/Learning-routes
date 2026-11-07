import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { pageContext } from "../../context";
import { storefrontHeaders } from "../../storefront/cache";
import { CreatorPage } from "../../storefront/creator-pages";
import "../../storefront/creator.css";
import { pageLocale, withLang } from "../../storefront/page-locale";
import { publicReads } from "../../storefront/public-reads.server";
import { inLocale } from "../../storefront/words";
import { storefront } from "../../surface";
import type { Route } from "./+types/creator-page";

export const handle = storefront;

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const found = await publicReads(context, async (reads) => {
    const space = await reads.spaceBySlug(params.slug);
    if (space === null) {
      return { retired: await reads.isRetired(params.slug) };
    }
    return { space, routes: await reads.routesOfSpace(space.id) };
  });
  if (!("space" in found) || found.space === undefined) {
    throw data(null, { status: "retired" in found && found.retired ? 410 : 404 });
  }
  const { space, routes } = found;
  const { appOrigin, platformOrigin } = context.get(pageContext);
  const tags = [`space:${space.id}`, ...routes.map((route) => `route:${route.routeId}`)];
  return data(
    {
      space,
      routes,
      locale: pageLocale(url, space),
      appOrigin,
      platformOrigin,
      origin: url.origin,
    },
    { headers: storefrontHeaders(tags) },
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [];
  }
  const { space, locale, origin } = loaderData;
  const name = inLocale(space.name, locale);
  const description = inLocale(space.tagline, locale) || name;
  return [
    { title: `${name} | ${BRAND}` },
    { name: "description", content: description },
    {
      tagName: "link",
      rel: "canonical",
      href: `${origin}${withLang("/", locale, space)}`,
    },
    ...(space.brandColor
      ? [{ tagName: "link", rel: "stylesheet", href: `/_brand/${space.brandColor.slice(1)}.css` }]
      : []),
    { property: "og:title", content: name },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: `${origin}/og-${locale}.png` },
    ...alternates(origin, space.locales as LocaleCode[], (each) => withLang("/", each, space)),
  ];
}

export default function Creator({ loaderData }: Route.ComponentProps) {
  return <CreatorPage {...loaderData} />;
}
