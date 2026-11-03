import { createRequestHandler, RouterContextProvider } from "react-router";
import { pageContext } from "../app/context";
import { servedFromEdge } from "./edge-cache";

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
  fetch(request, env, ctx) {
    return servedFromEdge(
      withoutForeignCookies(request, env.APP_ORIGIN),
      ctx,
      // The zone's cache; the DOM's CacheStorage type does not know of it.
      (caches as CacheStorage & { default: Cache }).default,
      (rendered) => {
        const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        const context = new RouterContextProvider();
        context.set(pageContext, {
          nonce,
          appOrigin: env.APP_ORIGIN,
          isDevelopment: String(env.ENVIRONMENT) === "development",
        });
        return requestHandler(rendered, context);
      },
    );
  },
} satisfies ExportedHandler<Env>;
