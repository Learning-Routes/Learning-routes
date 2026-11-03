import { LOCALES } from "@learning-routes/core/locales";
import { data } from "react-router";
import { storefrontHeaders } from "../../storefront/cache";
import { withLang } from "../../storefront/page-locale";
import { publicReads } from "../../storefront/public-reads.server";
import { sitemapXml } from "../../storefront/sitemap-xml";
import type { Route } from "./+types/sitemap";

// One sitemap per host (Platform STEP 4 §5.4): the platform's own pages here, and each
// creator's pages and routes on their own host.
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { origin } = new URL(request.url);
  const slug = params.slug;
  if (slug === undefined) {
    const pages = LOCALES.flatMap((locale) => [`/${locale}`, `/${locale}/explorar`]);
    return sitemapResponse(sitemapXml(pages.map((path) => `${origin}${path}`)), ["catalog"]);
  }
  const found = await publicReads(context, async (reads) => {
    const space = await reads.spaceBySlug(slug);
    return space ? { space, routes: await reads.routesOfSpace(space.id) } : null;
  });
  if (found === null) {
    throw data(null, { status: 404 });
  }
  const { space, routes } = found;
  const paths = ["/", ...routes.map((route) => `/${route.slug}`)];
  const urls = paths.flatMap((path) =>
    space.locales.map((locale) => `${origin}${withLang(path, locale, space)}`),
  );
  return sitemapResponse(sitemapXml(urls), [`space:${space.id}`]);
}

function sitemapResponse(xml: string, tags: string[]) {
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", ...storefrontHeaders(tags) },
  });
}
