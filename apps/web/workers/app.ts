import { ServerTiming } from "@learning-routes/core/server-timing";
import { STUDIO_PATH } from "@learning-routes/core/studio/session";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { pageContext } from "../app/context";
import { agentClient, apiClient, mcpClient } from "./api-client";
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
    const url = new URL(request.url);
    // The assistant's WebSocket: passed on as it is, since a 101 answer cannot be rebuilt with headers.
    if (url.origin === env.APP_ORIGIN && url.pathname === STUDIO_PATH) {
      return agentClient(env)(request);
    }
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
      const timing = new ServerTiming(() => performance.now());
      const context = new RouterContextProvider();
      context.set(pageContext, {
        nonce,
        appOrigin: env.APP_ORIGIN,
        isDevelopment: String(env.ENVIRONMENT) === "development",
        platformOrigin: env.PLATFORM_ORIGIN,
        creatorDomain: env.CREATOR_DOMAIN,
        contentOrigin: env.CONTENT_ORIGIN,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
        timing,
        runtime: { env, ctx, api: apiClient(env), mcp: mcpClient(env) },
      });
      return timed(timing, () => requestHandler(rendered, context));
    },
  );
}

/**
 * The page's phases (Platform STEP 15): each API call, then "page", the loaders and the render
 * until the response starts. Never on a page the edge keeps, whose timings would be stale.
 */
async function timed(timing: ServerTiming, render: () => Promise<Response>): Promise<Response> {
  const response = await timing.measure("page", render);
  if (response.headers.get("cache-control")?.includes("s-maxage")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Server-Timing", timing.header);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
