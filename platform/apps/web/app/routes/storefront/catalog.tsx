import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { ROUTE_TOPICS, type RouteTopic } from "@learning-routes/core/copy/route-facts";
import { BRAND, isLocale, LOCALES } from "@learning-routes/core/locales";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { pageContext } from "../../context";
import { storefrontHeaders } from "../../storefront/cache";
import { CatalogPage, catalogHref } from "../../storefront/catalog-page";
import "../../storefront/catalog.css";
import "../../storefront/page-transitions.css";
import { publicReads } from "../../storefront/public-reads.server";
import { filled } from "../../storefront/words";
import { storefront } from "../../surface";
import type { Route } from "./+types/catalog";

export const handle = storefront;

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

const MAX_SEARCH = 80;
const MAX_PAGE = 1000;

function isTopic(value: string | null): value is RouteTopic {
  return (ROUTE_TOPICS as readonly string[]).includes(value ?? "");
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.lang;
  if (!isLocale(locale)) {
    throw data(null, { status: 404 });
  }
  const url = new URL(request.url);
  const typed = url.searchParams.get("q")?.trim().slice(0, MAX_SEARCH) ?? "";
  const asked = url.searchParams.get("tema");
  const number = Number(url.searchParams.get("pagina"));
  const filters = {
    locale,
    topic: isTopic(asked) ? asked : null,
    search: typed === "" ? null : typed,
    page: Number.isInteger(number) && number > 0 && number <= MAX_PAGE ? number : 1,
  };
  const { routes, hasNext } = await publicReads(context, (reads) => reads.catalog(filters));
  const { appOrigin, creatorDomain } = context.get(pageContext);
  const tags = ["catalog", ...routes.map((route) => `route:${route.routeId}`)];
  return data(
    { ...filters, routes, hasNext, appOrigin, creatorDomain, origin: url.origin },
    { headers: storefrontHeaders(tags) },
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [];
  }
  const { locale, origin, topic, search, page, hasNext } = loaderData;
  const words = CATALOG_TEXT[locale];
  const here = catalogHref({ locale, topic, search, page });
  const title =
    page > 1
      ? `${words.title} (${filled(words.pageTitle, { page })}) | ${BRAND}`
      : `${words.title} | ${BRAND}`;
  const pages = [
    ...(page > 1
      ? [
          {
            tagName: "link",
            rel: "prev",
            href: catalogHref({ locale, topic, search, page: page - 1 }),
          },
        ]
      : []),
    ...(hasNext
      ? [
          {
            tagName: "link",
            rel: "next",
            href: catalogHref({ locale, topic, search, page: page + 1 }),
          },
        ]
      : []),
  ];
  return [
    { title },
    { name: "description", content: words.description },
    { tagName: "link", rel: "canonical", href: `${origin}${here}` },
    // One page per route: a search is for people, not for the index.
    ...(search ? [{ name: "robots", content: "noindex" }] : []),
    ...pages,
    ...alternates(origin, LOCALES, (each) => `/${each}/explorar`),
  ];
}

export default function Catalog({ loaderData }: Route.ComponentProps) {
  const { creatorDomain, origin, ...view } = loaderData;
  const protocol = new URL(origin).protocol;
  return (
    <CatalogPage
      view={{ ...view, creatorOrigin: (slug) => `${protocol}//${slug}.${creatorDomain}` }}
    />
  );
}
