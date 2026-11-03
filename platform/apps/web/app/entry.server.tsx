import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { pageContext } from "./context";

type Storefront = { storefront?: boolean } | undefined;

export const streamTimeout = 5_000;

// Only our own files and this response's nonce may run scripts. No page frames
// anything yet; creators' blocks will get their own origin here. A storefront page runs
// no script and is cached for every visitor, so it carries no nonce at all.
function policy(nonce: string | null): string {
  return [
    "default-src 'self'",
    nonce === null ? "script-src 'self'" : `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

function isPublicPage({ staticHandlerContext, routeModules }: EntryContext): boolean {
  return staticHandlerContext.matches.some(
    ({ route }) => (routeModules[route.id]?.handle as Storefront)?.storefront,
  );
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const { nonce } = loadContext.get(pageContext);
  let shellRendered = false;
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      signal: AbortSignal.timeout(streamTimeout + 1000),
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;
  if (isbot(request.headers.get("user-agent") ?? "") || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  responseHeaders.set(
    "Content-Security-Policy",
    policy(isPublicPage(routerContext) ? null : nonce),
  );
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
