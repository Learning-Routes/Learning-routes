import { isSigned } from "./signing";

// The content host (Platform STEP 9 §1). It serves a creator's creation, exactly as uploaded, under a
// policy that lets it run inside its own box and nothing more: no network, no form, no frame but
// ours. It sets no cookie and reads none. A published creation is public and immutable; a draft's
// needs the API's short-lived signature.

const PATH = /^\/(p|d)\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{64})\.html$/;
const LIBRARIES = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com";

export function policyFor(frameAncestors: string) {
  return [
    // Its own box even when opened straight, not framed: an opaque origin, no popups, no top
    // navigation, no forms. Header-only, and every engine people use honours it.
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${LIBRARIES}`,
    `style-src 'unsafe-inline' ${LIBRARIES} https://fonts.googleapis.com`,
    "font-src https://fonts.gstatic.com data:",
    "img-src data: blob: 'self'",
    "media-src data: blob: 'self'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "worker-src blob:",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const plain = (status: number, extra: HeadersInit = {}) =>
  new Response(null, { status, headers: { "X-Content-Type-Options": "nosniff", ...extra } });

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return plain(405, { Allow: "GET, HEAD" });
    }
    const url = new URL(request.url);
    const found = PATH.exec(url.pathname);
    if (!found) {
      return plain(404);
    }
    const [, kind, spaceId, routeId, hash] = found;
    const key = `${kind === "p" ? "pub" : "draft"}/${spaceId}/${routeId}/${hash}.html`;
    if (kind === "d") {
      const expires = Number(url.searchParams.get("e"));
      const signature = url.searchParams.get("s") ?? "";
      const now = Math.floor(Date.now() / 1000);
      if (!(await isSigned(env.CONTENT_SIGNING_SECRET, url.pathname, expires, signature, now))) {
        return plain(403);
      }
    }
    if (kind === "p" && request.headers.get("if-none-match") === `"${hash}"`) {
      return plain(304, { ETag: `"${hash}"` });
    }
    const object = await env.CREATIONS.get(key);
    if (object === null) {
      return plain(404);
    }
    return new Response(request.method === "HEAD" ? null : object.body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": policyFor(env.FRAME_ANCESTORS),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Strict-Transport-Security": "max-age=86400",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        // An hour, then a cheap revalidation: taking a creation down reaches every cache soon.
        "Cache-Control": kind === "p" ? "public, max-age=3600" : "private, no-store",
        ETag: `"${hash}"`,
      },
    });
  },
} satisfies ExportedHandler<Env>;
