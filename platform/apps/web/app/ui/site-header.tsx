import type { ReactNode } from "react";

function BrandMark() {
  return (
    <svg className="brand-mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect className="brand-mark-field" x="0.5" y="0.5" width="25" height="25" rx="7" />
      <path className="brand-mark-line" d="M6.5 18.5c4.5 0 3.5-7 7.5-7s3-5 5.5-5" />
      <circle className="brand-mark-start" cx="6.5" cy="18.5" r="2" />
      <circle className="brand-mark-here" cx="19.5" cy="6.5" r="2" />
    </svg>
  );
}

/** The page's top bar. `children` are its links and actions, in reading order. */
export function SiteHeader({
  brand,
  brandHref,
  navLabel,
  children,
}: {
  brand: string;
  brandHref: string;
  navLabel: string;
  children: ReactNode;
}) {
  return (
    <header className="site-header">
      <a className="brand" href={brandHref}>
        <BrandMark />
        {brand}
      </a>
      <nav className="site-nav" aria-label={navLabel}>
        {children}
      </nav>
    </header>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="nav-link" href={href}>
      {children}
    </a>
  );
}
