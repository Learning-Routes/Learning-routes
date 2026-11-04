import type { MiddlewareHandler } from "hono";

// The app's origin only (Platform STEP 2 §5.5), for /api/* and /mcp:
// - on any other host (a storefront subdomain, usercontent), they do not exist;
// - a non-GET must carry an Origin exactly equal to the app's. A missing Origin
//   and "null" are refused.
// Hono's csrf() is not used: it checks only form-like requests, so a JSON POST
// with no Origin, or one with Sec-Fetch-Site alone, would pass it.

const SAFE_METHOD = /^(GET|HEAD|OPTIONS)$/;

export const appOriginOnly: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const app = new URL(c.env.APP_ORIGIN);
  if (new URL(c.req.url).host !== app.host) {
    return c.notFound();
  }
  if (!SAFE_METHOD.test(c.req.method) && c.req.header("origin") !== app.origin) {
    return c.text("Forbidden", 403);
  }
  return next();
};
