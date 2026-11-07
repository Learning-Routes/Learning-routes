import { createRequestHandler, RouterContextProvider } from "react-router";
import { pageContext } from "../app/context";
import { apiClient, mcpClient } from "./api-client";
import { servedFromEdge } from "./edge-cache";
import {
  apexOf,
  creatorSlugOf,
  internalRequest,
  isApiPath,
  isAppPathElsewhere,
  isMcpPath,
} from "./hosts";
import { withSecurityHeaders } from "./security-headers";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/** Only the app's host reads cookies: anywhere else the page is the same for everyone. */
function withoutForeignCookies(request: Request, appOrigin: string): Request {
  if (new URL(request.url).host === new URL(appOrigin).host || !request.headers.has("cookie")) {
    return request;
  }
  const stripped = new Request(request);
  stripped.headers.delete("cookie");
  return stripped;
}

export default {
  async fetch(request, env, ctx) {
    return withSecurityHeaders(await answer(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;

function answer(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
  const url = new URL(request.url);
  const hosts = { appOrigin: env.APP_ORIGIN, creatorDomain: env.CREATOR_DOMAIN };
  const apex = apexOf(url, hosts);
  if (apex) {
    return Response.redirect(apex, 301);
  }
  if (isAppPathElsewhere(url, hosts) && creatorSlugOf(url.host, hosts) === null) {
    return new Response(null, { status: 404 });
  }
  if (isMcpPath(url, hosts)) {
    return mcpClient(env)(request);
  }
  if (isApiPath(url)) {
    return apiClient(env)(request);
  }
  return servedFromEdge(
    withoutForeignCookies(request, env.APP_ORIGIN),
    ctx,
    // The zone's cache; the DOM's CacheStorage type does not know of it.
    (caches as CacheStorage & { default: Cache }).default,
    (publicRequest) => {
      const rendered = internalRequest(publicRequest, hosts);
      if (rendered === null) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      const context = new RouterContextProvider();
      context.set(pageContext, {
        nonce,
        appOrigin: env.APP_ORIGIN,
        isDevelopment: String(env.ENVIRONMENT) === "development",
        platformOrigin: env.PLATFORM_ORIGIN,
        creatorDomain: env.CREATOR_DOMAIN,
        contentOrigin: env.CONTENT_ORIGIN,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
        runtime: { env, ctx, api: apiClient(env), mcp: mcpClient(env) },
      });
      return requestHandler(rendered, context);
    },
  );
}
