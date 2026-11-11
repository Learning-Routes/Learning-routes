import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { MY_ROUTES_TEXT } from "@learning-routes/core/copy/my-routes";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { useRouteLoaderData } from "react-router";
import { NavLink, SiteHeader } from "../ui/site-header";

type Place = "learn" | "teach" | "admin" | null;

/** The header of every page inside the app, once someone is signed in. */
export function AppHeader({
  locale,
  place = null,
  teaches = true,
}: {
  locale: LocaleCode;
  place?: Place;
  /** False where the page knows this person has no space. */
  teaches?: boolean;
}) {
  const root = useRouteLoaderData("root") as { platformOrigin?: string } | undefined;
  const home = root?.platformOrigin ?? "";
  const words = { ...APP_PAGES_TEXT[locale], ...MY_ROUTES_TEXT[locale] };
  const here = (mine: Place) => (place === mine ? ("page" as const) : undefined);
  return (
    <SiteHeader
      brand={BRAND}
      brandHref={`${home}/${locale}`}
      navLabel={words.myRoutes}
      theme={UI_COPY[locale]}
    >
      <a className="nav-link" aria-current={here("learn")} href="/mis-rutas">
        {words.myRoutes}
      </a>
      {teaches ? (
        <a className="nav-link" aria-current={here("teach")} href="/creador/asistente">
          {words.teach}
        </a>
      ) : null}
      <NavLink href={`${home}/${locale}/explorar`}>{words.explore}</NavLink>
      <form method="post" action="/salir" className="nav-form">
        <button type="submit" className="nav-link nav-button">
          {words.signOut}
        </button>
      </form>
    </SiteHeader>
  );
}
