import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND, isLocale, LOCALES } from "@learning-routes/core/locales";
import { data } from "react-router";
import { alternates } from "../../alternates";
import { RouteMapFigure } from "../../landing/route-map-figure";
import "../../landing/landing.css";
import { storefront } from "../../surface";
import { ButtonLink } from "../../ui/button";
import { NavLink, SiteHeader } from "../../ui/site-header";
import type { Route } from "./+types/home";

export const handle = storefront;

const WITH_TEXT = LOCALES;

export function loader({ params, request }: Route.LoaderArgs) {
  const lang = params.lang;
  if (!isLocale(lang)) {
    throw data(null, { status: 404 });
  }
  return { lang, origin: new URL(request.url).origin };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [];
  }
  const { lang, origin } = loaderData;
  const words = LANDING_TEXT[lang];
  return [
    { title: BRAND },
    { name: "description", content: words.description },
    { property: "og:title", content: BRAND },
    { property: "og:description", content: words.description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: `${origin}/og-${lang}.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    ...alternates(origin, WITH_TEXT, (locale) => `/${locale}`),
  ];
}

// What each step's map shows: the student further along, as the step says.
const STEP_SCENES = [
  { panel: 1, done: 0 },
  { panel: 2, done: 2, framing: { sx: 0, sy: -0.1, d: 25 } },
  { panel: 3, done: 2, fan: true, framing: { sx: 0, sy: -0.02, d: 27 } },
  { panel: 4, done: 5, framing: { sx: 0.04, sy: 0.04, d: 40 } },
];
const STEP_MAP = { mobile: false, width: 720, height: 500 };
const HERO_WIDE = { panel: 0, mobile: false, width: 1440, height: 836, done: 0 };
const HERO_PHONE = { panel: 0, mobile: true, width: 390, height: 844, done: 0 };
const HERO_PHONE_CROP = { top: 250, height: 460 };

export default function StorefrontHome({ loaderData }: Route.ComponentProps) {
  const { lang } = loaderData;
  const words = LANDING_TEXT[lang];
  const signIn = "/sign-in";
  return (
    <>
      <SiteHeader brand={BRAND} brandHref={`/${lang}`} navLabel={UI_COPY[lang].primaryNav}>
        <NavLink href="#como">{words.howItWorks}</NavLink>
        <NavLink href={signIn}>{words.signIn}</NavLink>
        <ButtonLink href={signIn} size="small">
          {words.cta}
        </ButtonLink>
      </SiteHeader>
      <main>
        <section className="landing-hero">
          <RouteMapFigure scene={HERO_WIDE} words={words} className="hero-map-wide" />
          <div className="landing-hero-text">
            <h1 className="landing-headline">{words.headline}</h1>
            <p className="landing-lead">{words.lead}</p>
            <div className="landing-actions">
              <ButtonLink href={signIn}>{words.cta}</ButtonLink>
              <p className="landing-fine">{words.firstFree}</p>
            </div>
          </div>
          <RouteMapFigure
            scene={HERO_PHONE}
            crop={HERO_PHONE_CROP}
            words={words}
            className="hero-map-phone"
          />
        </section>
        <ol className="landing-steps" id="como" aria-label={words.howItWorks}>
          {words.steps.map((step, index) => (
            <li key={step.title} className="landing-step">
              <div className="landing-step-text">
                <span className="landing-step-number">{index + 1}</span>
                <h2 className="landing-step-title">{step.title}</h2>
                <p className="landing-step-body">{step.body}</p>
              </div>
              <RouteMapFigure
                scene={{ ...STEP_MAP, ...(STEP_SCENES[index] as (typeof STEP_SCENES)[number]) }}
                words={words}
                className="landing-step-map"
                title={false}
              />
            </li>
          ))}
        </ol>
        <section className="landing-close">
          <h2 className="landing-close-title">{words.closingTitle}</h2>
          <div className="landing-actions">
            <ButtonLink href={signIn}>{words.cta}</ButtonLink>
            <p className="landing-fine">{words.firstFree}</p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">© 2026 {BRAND}</footer>
    </>
  );
}
