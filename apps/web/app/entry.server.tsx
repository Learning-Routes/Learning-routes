import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { pageContext } from "./context";

type Surface = { storefront?: boolean; challenge?: boolean; lessonMedia?: boolean } | undefined;

export const streamTimeout = 5_000;

// Only our own files and this response's nonce may run scripts. A lesson frames video players
// and creators' creations, which live on the content host. A storefront page is cached for every
// visitor, so it carries no nonce: only files from our own origin may run.
function policy(
  nonce: string | null,
  hasChallenge: boolean,
  hasMedia: boolean,
  contentOrigin: string,
): string {
  const challenge = hasChallenge ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    nonce === null ? "script-src 'self'" : `script-src 'self' 'nonce-${nonce}'${challenge}`,
    "style-src 'self'",
    hasMedia ? "img-src 'self' data: https:" : "img-src 'self' data:",
    ...(hasMedia ? ["media-src https:"] : []),
    "connect-src 'self'",
    hasChallenge
      ? "frame-src https://challenges.cloudflare.com"
      : hasMedia
        ? `frame-src https://www.youtube-nocookie.com https://player.vimeo.com ${contentOrigin}`
        : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

function surfaceIs(
  { staticHandlerContext, routeModules }: EntryContext,
  name: keyof NonNullable<Surface>,
): boolean {
  return staticHandlerContext.matches.some(
    ({ route }) => (routeModules[route.id]?.handle as Surface)?.[name],
  );
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const { nonce, contentOrigin } = loadContext.get(pageContext);
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
    policy(
      surfaceIs(routerContext, "storefront") ? null : nonce,
      surfaceIs(routerContext, "challenge"),
      surfaceIs(routerContext, "lessonMedia"),
      contentOrigin,
    ),
  );
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
