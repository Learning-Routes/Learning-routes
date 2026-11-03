import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import {
  EXAMPLE_ROUTE_KEYS,
  EXAMPLE_ROUTES,
  exampleRouteForMap,
} from "@learning-routes/core/copy/landing-routes";
import { STAGE_TEXT } from "@learning-routes/core/copy/landing-stage";
import type { LocaleCode } from "@learning-routes/core/locales";
import { ButtonLink } from "../ui/button";

// The annotated map (STEP 41 §2), as server HTML in reading order: it paints before any script
// runs, and stacks as plain text when no script does. app/enhance/stage/ adds the map behind it
// and pins each panel to a free spot. The canvas and the names on the map are aria-hidden.

function Lead() {
  return (
    <svg className="lp-lead" aria-hidden="true">
      <path pathLength={1} />
      <circle r="7" />
      <circle className="lp-c2" r="2.6" />
    </svg>
  );
}

function Legend({ locale }: { locale: LocaleCode }) {
  const { map } = STAGE_TEXT[locale];
  return (
    <ul className="lp-legend" aria-label={map.legend}>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle className="lp-key-done" cx="7" cy="7" r="6" />
          <path className="lp-key-check" d="M4.4 7.2l1.8 1.8 3.4-3.6" />
        </svg>
        {map.done}
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle className="lp-key-here" cx="7" cy="7" r="5.2" />
        </svg>
        {map.here}
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle className="lp-key-coming" cx="7" cy="7" r="5.4" />
        </svg>
        {map.coming}
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle className="lp-key-extra" cx="7" cy="7" r="5.4" />
          <circle className="lp-key-extra-dot" cx="7" cy="7" r="1.8" />
        </svg>
        {map.extra}
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle className="lp-key-locked" cx="7" cy="7" r="5.4" />
        </svg>
        {map.locked}
      </li>
    </ul>
  );
}

function RouteTabs({ locale }: { locale: LocaleCode }) {
  const { map } = STAGE_TEXT[locale];
  const { routes } = EXAMPLE_ROUTES[locale];
  return (
    <div className="lp-seg">
      <span id="lp-seg-label">{map.example}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset's legend can't sit beside its controls. */}
      <div className="lp-opts" role="group" aria-labelledby="lp-seg-label">
        {EXAMPLE_ROUTE_KEYS.map((key, index) => (
          <button key={key} type="button" data-route={key} aria-pressed={index === 0}>
            {routes[key].tab}
          </button>
        ))}
      </div>
    </div>
  );
}

function stageData(locale: LocaleCode) {
  const { map } = STAGE_TEXT[locale];
  const routes = Object.fromEntries(
    EXAMPLE_ROUTE_KEYS.map((key) => [key, exampleRouteForMap(locale, key)]),
  );
  const words = {
    yourRoute: map.example,
    here: map.here,
    free: map.free,
    module: map.module,
    progress: map.progress,
    topics: map.topics,
    extraNames: map.extraNames,
  };
  return { routes: JSON.stringify(routes), words: JSON.stringify(words) };
}

export function LandingStageSection({ locale }: { locale: LocaleCode }) {
  const landing = LANDING_TEXT[locale];
  const stage = STAGE_TEXT[locale];
  const explore = CATALOG_TEXT[locale].explore;
  const catalog = `/${locale}/explorar`;
  const { routes, words } = stageData(locale);
  const lastPanel = stage.panels.length - 1;
  return (
    <section
      className="lp-journey"
      aria-label={stage.stageLabel}
      data-routes={routes}
      data-words={words}
    >
      <div className="lp-stage">
        <canvas className="lp-world" aria-hidden="true" tabIndex={-1} />
        <div className="lp-fade" aria-hidden="true" />
        <div className="lp-labels" aria-hidden="true" />
        <div className="lp-texts">
          <div className="lp-ann lp-hero">
            <div className="lp-in">
              <h1>
                <span className="lp-wr">{landing.headline}</span>
              </h1>
            </div>
            <p>{landing.lead}</p>
            <div className="lp-acts">
              <ButtonLink href={catalog}>{explore}</ButtonLink>
              <span className="lp-fine">{stage.note}</span>
            </div>
          </div>
          <p className="lp-fallback">{stage.overview}</p>
          {stage.panels.map((panel, index) => (
            <div className="lp-ann" key={panel.title}>
              {index === lastPanel ? null : <Lead />}
              <div className="lp-in">
                <h2>
                  <span className="lp-wr">{panel.title}</span>
                </h2>
              </div>
              <p>{panel.body}</p>
              {index === lastPanel ? (
                <div className="lp-acts">
                  <ButtonLink href={catalog}>{explore}</ButtonLink>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="lp-top">
          <RouteTabs locale={locale} />
          <Legend locale={locale} />
        </div>
        <nav className="lp-vdots" aria-label={stage.map.panels}>
          <ol />
        </nav>
      </div>
    </section>
  );
}
