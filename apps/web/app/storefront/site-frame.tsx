import { APP_PAGES_TEXT } from "@learning-routes/core/copy/app-pages";
import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { ButtonLink } from "../ui/button";
import { NavLink, SiteHeader } from "../ui/site-header";

/** The platform's header: Explorar rutas, Enseñar, Entrar (or Mis rutas, after the cache). */
export function PlatformHeader({ locale, appOrigin }: { locale: LocaleCode; appOrigin: string }) {
  const words = CATALOG_TEXT[locale];
  return (
    <SiteHeader
      brand={BRAND}
      brandHref={`/${locale}`}
      navLabel={UI_COPY[locale].primaryNav}
      theme={UI_COPY[locale]}
    >
      <NavLink href={`${appOrigin}/ser-creador`}>{words.teach}</NavLink>
      {/* "Mis rutas" for someone signed in, put in after the edge cache (workers/account.ts). */}
      <a
        className="nav-link"
        href={`${appOrigin}/sign-in`}
        data-account={APP_PAGES_TEXT[locale].myRoutes}
      >
        {words.signIn}
      </a>
      {/* A phone keeps only the button, as v1 did: without it, the header has no way anywhere. */}
      <ButtonLink href={`/${locale}/explorar`} size="small">
        {words.explore}
      </ButtonLink>
    </SiteHeader>
  );
}
