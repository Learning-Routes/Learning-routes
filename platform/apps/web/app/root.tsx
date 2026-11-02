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
import { isLocale, negotiateLocale } from "@learning-routes/core/locales";
import { useEffect } from "react";
import { pageContext } from "./context";
import { isStorefront } from "./surface";
import { themeFromCookie } from "./theme";

export function loader({ context, request }: Route.LoaderArgs) {
  return {
    nonce: context.get(pageContext).nonce,
    theme: themeFromCookie(request.headers.get("cookie")),
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  const nonce = root?.nonce;
  const storefront = isStorefront(useMatches());
  const { lang } = useParams();
  return (
    // A storefront's HTML never varies by cookie: the media query decides there.
    <html
      lang={lang && isLocale(lang) ? lang : (root?.locale ?? "es")}
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
