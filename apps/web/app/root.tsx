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
import { BRAND, isLocale } from "@learning-routes/core/locales";
import geist from "@learning-routes/design-tokens/fonts/Geist-latin.woff2?url";
import { useEffect } from "react";
import { pageContext } from "./context";
import { isStorefront } from "./surface";
import { themeFromCookie } from "./theme";
import { ButtonLink } from "./ui/button";
import { SiteHeader } from "./ui/site-header";
import "./app-pages/app-pages.css";
import { useProgressHints } from "./ui/progress-hints";
import { Rising } from "./ui/rising";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: geist, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

const ERROR_WORDS = {
  gone: {
    title: "Esta página no existe",
    body: "Puede que la dirección haya cambiado, o que necesites entrar primero.",
  },
  broken: {
    title: "Algo falló de nuestro lado",
    body: "Tus datos están a salvo. Vuelve a intentarlo en un momento.",
  },
  home: "Ir al inicio",
};

export function loader({ context, request }: Route.LoaderArgs) {
  return {
    nonce: context.get(pageContext).nonce,
    platformOrigin: context.get(pageContext).platformOrigin,
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

/** Runs only in a hydrated page; the browser tests read it. */
function useHydratedMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
}

export default function App() {
  useHydratedMark();
  useProgressHints();
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  useHydratedMark();
  const root = useRouteLoaderData<typeof loader>("root");
  const gone = isRouteErrorResponse(error) && (error.status === 404 || error.status === 410);
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  const words = gone ? ERROR_WORDS.gone : ERROR_WORDS.broken;
  return (
    <div className="desk opening">
      <title>{`${words.title} · ${BRAND}`}</title>
      <SiteHeader brand={BRAND} brandHref={root?.platformOrigin ?? "/"} navLabel={BRAND}>
        {null}
      </SiteHeader>
      <main className="app-page app-page-narrow">
        <h1 className="app-title">
          <Rising text={words.title} />
        </h1>
        <p className="app-copy">{words.body}</p>
        <ButtonLink href={root?.platformOrigin ?? "/"}>{ERROR_WORDS.home}</ButtonLink>
        {stack ? (
          <pre>
            <code>{stack}</code>
          </pre>
        ) : null}
      </main>
    </div>
  );
}
