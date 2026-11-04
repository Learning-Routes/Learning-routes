import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { ButtonLink } from "../ui/button";
import { NavLink, SiteHeader } from "../ui/site-header";

/** The platform host's header: Explorar rutas, Enseñar, Entrar. No session here. */
export function PlatformHeader({ locale, appOrigin }: { locale: LocaleCode; appOrigin: string }) {
  const words = CATALOG_TEXT[locale];
  return (
    <SiteHeader brand={BRAND} brandHref={`/${locale}`} navLabel={UI_COPY[locale].primaryNav}>
      <NavLink href={`${appOrigin}/quiero-ensenar`}>{words.teach}</NavLink>
      <NavLink href={`${appOrigin}/sign-in`}>{words.signIn}</NavLink>
      {/* A phone keeps only the button, as v1 did: without it, the header has no way anywhere. */}
      <ButtonLink href={`/${locale}/explorar`} size="small">
        {words.explore}
      </ButtonLink>
    </SiteHeader>
  );
}
