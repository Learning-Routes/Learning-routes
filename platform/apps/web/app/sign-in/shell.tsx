import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, type LocaleCode } from "@learning-routes/core/locales";
import { type ReactNode, useEffect, useRef } from "react";
import { SiteHeader } from "../ui/site-header";
import { ThemeToggle } from "../ui/theme-toggle";

/** Signing in is a short route: ask, check your email, enter. The gold ring is you. */
function SignInRoute({ step }: { step: 1 | 2 | 3 }) {
  const stops = [9, 80, 151];
  const reached = stops[step - 1] as number;
  return (
    <svg className="sign-in-route" viewBox="0 0 160 28" aria-hidden="true">
      <path className="sign-in-route-ahead" d="M9 14H151" />
      <path className="sign-in-route-done" d={`M9 14H${reached}`} />
      {stops.map((x, index) => {
        const state = index + 1 < step ? "done" : index + 1 === step ? "here" : "ahead";
        return (
          <circle key={x} className={`sign-in-stop sign-in-stop-${state}`} cx={x} cy="14" r="8" />
        );
      })}
    </svg>
  );
}

/** A screen's heading takes focus when it arrives, so a screen reader hears the change. */
export function ScreenTitle({ children }: { children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <h1 ref={heading} className="sign-in-title" tabIndex={-1}>
      {children}
    </h1>
  );
}

export function SignInShell({
  locale,
  step,
  children,
}: {
  locale: LocaleCode;
  step: 1 | 2 | 3;
  children: ReactNode;
}) {
  const copy = UI_COPY[locale];
  return (
    <>
      <SiteHeader brand={BRAND} brandHref={`/${locale}`} navLabel={copy.primaryNav}>
        <ThemeToggle toDark={copy.toDark} toLight={copy.toLight} />
      </SiteHeader>
      <main className="sign-in-page">
        <div className="card sign-in-sheet">
          <i className="sign-in-tick sign-in-tick-tl" />
          <i className="sign-in-tick sign-in-tick-tr" />
          <i className="sign-in-tick sign-in-tick-bl" />
          <i className="sign-in-tick sign-in-tick-br" />
          <SignInRoute step={step} />
          {children}
        </div>
      </main>
    </>
  );
}
