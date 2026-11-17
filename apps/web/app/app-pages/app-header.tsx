import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { MY_ROUTES_TEXT } from "@learning-routes/core/copy/my-routes";
import { SHELL_TEXT } from "@learning-routes/core/copy/shell";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import type { ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import type { ShellData } from "../routes/app-shell";
import { filled, inLocale } from "../storefront/words";
import { RouteCover } from "../ui/route-cover";
import { BrandMark } from "../ui/site-header";
import { ThemeToggle } from "../ui/theme-toggle";

type Place = "home" | "learn" | "community" | "notices" | "teach" | "admin" | null;

const ICONS = {
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  learn: "M5 19c0-6 14-4 14-10a3 3 0 0 0-6 0M5 19h.01",
  explore: "M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM16 16l4 4",
  community:
    "M8 6a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM2.5 19c.8-3 3-4.400 5.500-4.400s4.700 1.400 5.500 4.400M17 7.600a2.400 2.400 0 1 0 0 4.800M15 15c2.600-.3 4.800 1 5.700 3.600",
  notices: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  teach: "M3 9l9-4 9 4-9 4zM7 11v5c3 2 7 2 10 0v-5",
};

function Item({
  href,
  icon,
  current,
  badge,
  children,
}: {
  href: string;
  icon: keyof typeof ICONS;
  current?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <a className="nav-link" aria-current={current ? "page" : undefined} href={href}>
      <svg className="nav-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d={ICONS[icon]} />
      </svg>
      {children}
      {badge}
    </a>
  );
}

/** The route one is on, always at hand in the side panel. */
function CarryOnCard({ shell, locale }: { shell: ShellData; locale: LocaleCode }) {
  const next = shell.enrollments.find(({ place }) => !place.finished && place.title !== null);
  if (!next) {
    return null;
  }
  const total = next.lessonsPerModule.reduce((sum, count) => sum + count, 0);
  const title = inLocale(next.title, locale, next.sourceLocale);
  return (
    <section className="shell-on" aria-label={SHELL_TEXT[locale].youAreOn}>
      <p className="shell-on-label">{SHELL_TEXT[locale].youAreOn}</p>
      <div className="shell-on-row">
        <RouteCover seed={next.routeId} title={title} className="shell-on-cover" />
        <p className="shell-on-words">
          <b>{title}</b>
          <span>{filled(SHELL_TEXT[locale].topicOf, { n: next.place.number, total })}</span>
        </p>
      </div>
      <progress className="shell-bar" max={total || 1} value={next.place.number - 1} />
      <a
        className="button button-primary button-small shell-on-go"
        href={`/mis-rutas/${next.enrollmentId}/tema/${next.place.number}`}
      >
        <span className="button-label">{APP_PAGES_TEXT[locale].continue}</span>
      </a>
    </section>
  );
}

/**
 * The header of every page inside the app, once someone is signed in: a bar on a narrow screen,
 * the side panel on a wide one. The same places, in the same order, on every page.
 */
export function AppHeader({
  locale,
  place = null,
  teaches,
}: {
  locale: LocaleCode;
  place?: Place;
  /** False where the page knows this person has no space; by default, what the frame knows. */
  teaches?: boolean;
}) {
  const root = useRouteLoaderData("root") as { platformOrigin?: string } | undefined;
  const shell = useRouteLoaderData("routes/app-shell") as ShellData | undefined;
  const home = root?.platformOrigin ?? "";
  const words = { ...APP_PAGES_TEXT[locale], ...MY_ROUTES_TEXT[locale], ...SHELL_TEXT[locale] };
  const showTeach = teaches ?? shell?.teaches ?? true;
  return (
    <header className="site-header shell">
      <a className="brand" href={`${home}/${locale}`}>
        <BrandMark />
        {BRAND}
      </a>
      <nav className="site-nav" aria-label={words.myRoutes}>
        <Item href="/inicio" icon="home" current={place === "home"}>
          {words.home}
        </Item>
        <Item href="/mis-rutas" icon="learn" current={place === "learn"}>
          {words.myRoutes}
        </Item>
        <Item href={`${home}/${locale}/explorar`} icon="explore">
          {words.explore}
        </Item>
        <Item href="/comunidad" icon="community" current={place === "community"}>
          {words.community}
        </Item>
        <Item
          href="/avisos"
          icon="notices"
          current={place === "notices"}
          badge={
            shell?.unread ? (
              <span className="nav-badge">
                <span aria-hidden="true">{shell.unread > 9 ? "9+" : shell.unread}</span>
                <span className="visually-hidden">{filled(words.unread, { n: shell.unread })}</span>
              </span>
            ) : null
          }
        >
          {words.notices}
        </Item>
        {showTeach ? (
          <Item href="/creador/asistente" icon="teach" current={place === "teach"}>
            {words.teach}
          </Item>
        ) : null}
        <form method="post" action="/salir" className="nav-form">
          <button type="submit" className="nav-link nav-button">
            {words.signOut}
          </button>
        </form>
      </nav>
      {shell ? <CarryOnCard shell={shell} locale={locale} /> : null}
      <div className="shell-foot">
        {shell?.name ? (
          <p className="shell-me">
            <span className="shell-face" aria-hidden="true">
              {shell.name.trim()[0]?.toUpperCase()}
            </span>
            <b>{shell.name}</b>
          </p>
        ) : null}
        <ThemeToggle toDark={UI_COPY[locale].toDark} toLight={UI_COPY[locale].toLight} />
      </div>
    </header>
  );
}
