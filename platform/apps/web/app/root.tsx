import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
  useParams,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { isLocale } from "@learning-routes/core/locales";
import archivo from "@learning-routes/design-tokens/fonts/Archivo-latin.woff2?url";
import { useEffect } from "react";
import { pageContext } from "./context";
import { isStorefront } from "./surface";
import { themeFromCookie } from "./theme";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: archivo, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

export function loader({ context, request }: Route.LoaderArgs) {
  return {
    nonce: context.get(pageContext).nonce,
    theme: themeFromCookie(request.headers.get("cookie")),
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  const nonce = root?.nonce;
  const matches = useMatches();
  const storefront = isStorefront(matches);
  // A page says its language when it has been translated; the rest are in Spanish.
  const pageLocale = matches
    .map((match) => (match.loaderData as { locale?: string } | undefined)?.locale)
    .find(Boolean);
  const { lang } = useParams();
  return (
    // A storefront's HTML never varies by cookie: the media query decides there.
    <html
      lang={lang && isLocale(lang) ? lang : (pageLocale ?? "es")}
      data-theme={storefront ? undefined : root?.theme}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        {/* The storefront is server HTML: no React runtime, no hydration. */}
        {storefront ? null : (
          <>
            <ScrollRestoration nonce={nonce} />
            <Scripts nonce={nonce} />
          </>
        )}
      </body>
    </html>
  );
}

export default function App() {
  // Runs only in a hydrated page; the browser tests read it.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Error";
  let details = "Algo salió mal.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "Esta página no existe." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
