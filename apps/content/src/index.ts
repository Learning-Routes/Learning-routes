import { isSigned } from "./signing";
import { picture, thumbnail } from "./thumbnail";

// The content host (Platform STEP 9 §1). It serves a creator's creation, exactly as uploaded, under a
// policy that lets it run inside its own box and nothing more: no network, no form, no frame but
// ours. It sets no cookie and reads none. A published creation is public and immutable; a draft's
// needs the API's short-lived signature.

const ASSET =
  /^\/a\/([0-9a-f-]{36})\/([0-9a-f]{64})\.(png|jpg|gif|webp|svg|mp3|wav|ogg|m4a|mp4|webm)$/;
// An asset is a picture, a sound or a video, never a page: nothing in it runs, an SVG included.
const ASSET_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
const THUMBNAIL = /^\/t\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/;
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

/** An asset, by the type its bytes had on upload, in ranges for audio and video. */
async function asset(request: Request, env: Env, key: string, hash: string) {
  if (request.headers.get("if-none-match") === `"${hash}"`) {
    return plain(304, { ETag: `"${hash}"` });
  }
  // R2 refuses a range it cannot serve, such as several at once: 416, never a 500.
  const object = await env.CREATIONS.get(key, { range: request.headers }).catch(() => undefined);
  if (object === undefined) {
    return plain(416, { "Content-Range": "bytes */*" });
  }
  if (object === null) {
    return plain(404);
  }
  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Security-Policy": ASSET_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Strict-Transport-Security": "max-age=86400",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    ETag: `"${hash}"`,
  });
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  const ranged = request.headers.has("range") && range !== undefined;
  const offset =
    range?.suffix === undefined ? (range?.offset ?? 0) : Math.max(0, object.size - range.suffix);
  const length = Math.min(range?.length ?? object.size - offset, object.size - offset);
  if (ranged) {
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
  }
  headers.set("Content-Length", String(ranged ? length : object.size));
  const body = request.method === "HEAD" ? null : (object as R2ObjectBody).body;
  return new Response(body, { status: ranged ? 206 : 200, headers });
}

/** Whether the address carries the API's short-lived signature for its own path. */
const signed = (env: Env, url: URL) =>
  isSigned(
    env.CONTENT_SIGNING_SECRET,
    url.pathname,
    Number(url.searchParams.get("e")),
    url.searchParams.get("s") ?? "",
    Math.floor(Date.now() / 1000),
  );

/** A creation: a published one for anyone, a draft's only at its signed address. */
async function creation(request: Request, env: Env, url: URL, found: RegExpExecArray) {
  const [, kind, spaceId, routeId, hash] = found;
  const key = `${kind === "p" ? "pub" : "draft"}/${spaceId}/${routeId}/${hash}.html`;
  if (kind === "d" && !(await signed(env, url))) {
    return plain(403);
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
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return plain(405, { Allow: "GET, HEAD" });
    }
    const url = new URL(request.url);
    const isAsset = ASSET.exec(url.pathname);
    if (isAsset) {
      const [, spaceId, hash, extension] = isAsset;
      return asset(request, env, `a/${spaceId}/${hash}.${extension}`, String(hash));
    }
    const isThumbnail = THUMBNAIL.exec(url.pathname);
    if (isThumbnail) {
      if (!(await signed(env, url))) {
        return plain(403);
      }
      const [, space, route, hash] = isThumbnail as unknown as [string, string, string, string];
      const body = await thumbnail(env, url.origin, space, route, hash);
      return body === null ? plain(404) : picture(request, body);
    }
    const found = PATH.exec(url.pathname);
    if (!found) {
      return plain(404);
    }
    return creation(request, env, url, found);
  },
} satisfies ExportedHandler<Env>;
