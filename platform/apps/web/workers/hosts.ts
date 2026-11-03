import { isReservedSlug } from "@learning-routes/core/reserved-slugs";

// A creator's pages live on [slug].CREATOR_DOMAIN (Platform STEP 4 §0, §5). One Worker
// serves every host, and React Router routes by path, so a creator's host renders from
// an internal path nobody can ask for directly. The cache key stays the public URL.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const INTERNAL_PREFIX = "/_creador";
const SHARED_PREFIX = "/_brand/";

interface Hosts {
  appOrigin: string;
  creatorDomain: string;
}

export function creatorSlugOf(host: string, { appOrigin, creatorDomain }: Hosts): string | null {
  const lower = host.toLowerCase();
  const suffix = `.${creatorDomain.toLowerCase()}`;
  if (lower === new URL(appOrigin).host || !lower.endsWith(suffix)) {
    return null;
  }
  const slug = lower.slice(0, -suffix.length);
  return SLUG.test(slug) && !isReservedSlug(slug) ? slug : null;
}

/** The request to render from, or null when the path is one nobody may ask for. */
export function internalRequest(request: Request, hosts: Hosts): Request | null {
  const url = new URL(request.url);
  const slug = creatorSlugOf(url.host, hosts);
  if (slug === null) {
    return url.pathname.startsWith(INTERNAL_PREFIX) ? null : request;
  }
  // The creator's colour is served on every host, so their pages can link to it.
  if (url.pathname.startsWith(SHARED_PREFIX)) {
    return request;
  }
  url.pathname = `${INTERNAL_PREFIX}/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  return new Request(url, request);
}
