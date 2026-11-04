import { CREATOR_TEXT } from "@learning-routes/core/copy/creator";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { inLocale } from "./words";

// What a creator's page and a route's page share (Platform STEP 4 §5).

export const lessonsOf = (route: PublicRoute) =>
  route.modules.map((module) => module.lessons.length);

const MINOR_BASE = 10;

/** A price in words, in the page's language: 29,00 €. */
export function priceInWords(minor: number, currency: string, locale: LocaleCode): string {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / MINOR_BASE ** digits);
}

/** The first letter of a name, until photos arrive in STEP 10. */
export function Avatar({ name }: { name: string }) {
  return (
    <span className="creator-avatar" aria-hidden="true">
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

export interface Links {
  appOrigin: string;
  platformOrigin: string;
}

export function CreatorHeader({
  space,
  locale,
  appOrigin,
  children,
}: {
  space: PublicSpace;
  locale: LocaleCode;
  appOrigin: string;
  children?: React.ReactNode;
}) {
  const name = inLocale(space.name, locale);
  return (
    <header className="site-header">
      <a className="brand" href="/">
        <Avatar name={name} />
        {name}
      </a>
      <nav className="site-nav" aria-label={CREATOR_TEXT[locale].routes}>
        {children}
        <a className="nav-link" href={`${appOrigin}/sign-in`}>
          {CREATOR_TEXT[locale].signIn}
        </a>
      </nav>
    </header>
  );
}

export function CreatorFooter({
  space,
  locale,
  platformOrigin,
}: {
  space: PublicSpace;
  locale: LocaleCode;
  platformOrigin: string;
}) {
  return (
    <footer className="creator-footer">
      <span>{`© ${inLocale(space.name, locale)}`}</span>
      <a className="text-link" href={platformOrigin}>
        {CREATOR_TEXT[locale].madeWith}
      </a>
    </footer>
  );
}
