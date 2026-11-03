import { CATALOG_TEXT } from "@learning-routes/core/copy/catalog";
import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { CLOSE_TEXT } from "@learning-routes/core/copy/landing-close";
import { EXAMPLE_ROUTE_KEYS, EXAMPLE_ROUTES } from "@learning-routes/core/copy/landing-routes";
import { STAGE_TEXT } from "@learning-routes/core/copy/landing-stage";
import type { LocaleCode } from "@learning-routes/core/locales";
import { Button, ButtonLink } from "../ui/button";

// The closing sheet (STEP 41 §2.3): a fresh map sheet, whose route starts at the field. The
// field searches the catalog and each idea is a link, so all of it works without JavaScript;
// with it, an idea fills the field instead (app/enhance/close.ts).

function Blueprint({ locale }: { locale: LocaleCode }) {
  const { map } = STAGE_TEXT[locale];
  const moduleName = (n: number) => map.module.replace("{n}", String(n));
  const { figureTitle, figureLine } = CLOSE_TEXT[locale];
  return (
    <figure className="lp-plan">
      <div className="lp-bp">
        <svg viewBox="0 0 520 400" aria-hidden="true">
          <rect className="lp-bp-sheet lp-one" x="8" y="50" width="504" height="104" rx="16" />
          <rect className="lp-bp-sheet" x="8" y="186" width="504" height="96" rx="16" />
          <rect className="lp-bp-sheet lp-three" x="8" y="314" width="504" height="78" rx="16" />
          <path className="lp-bp-line" d="M28 26 C 28 58, 52 66, 52 89" />
          <path
            className="lp-bp-line"
            d="M52 102 C 90 102, 96 92, 128 92 C 170 92, 172 112, 212 112 C 254 112, 256 90, 296 90 C 338 90, 340 110, 380 110 C 422 110, 424 94, 462 94"
          />
          <path className="lp-bp-line" d="M52 115 L 52 221" />
          <path
            className="lp-bp-line"
            d="M52 234 C 96 234, 100 226, 140 226 C 188 226, 190 244, 236 244 C 284 244, 286 224, 332 224 C 380 224, 382 240, 428 240"
          />
          <path className="lp-bp-line" d="M52 247 L 52 340" />
          <path
            className="lp-bp-line"
            d="M52 353 C 100 353, 104 348, 150 348 C 206 348, 206 360, 260 360 C 316 360, 316 346, 370 346"
          />
          <path
            className="lp-bp-route"
            pathLength={1}
            d="M28 26 C 28 58, 52 66, 52 89 L 52 102 C 90 102, 96 92, 128 92 C 170 92, 172 112, 212 112 C 254 112, 256 90, 296 90 C 338 90, 340 110, 380 110 C 422 110, 424 94, 462 94"
          />
          <polygon className="lp-bp-origin" points="28,12 37,24 28,36 19,24" />
          <circle className="lp-bp-disc lp-one" cx="52" cy="102" r="13" />
          <circle className="lp-bp-disc" cx="52" cy="234" r="13" />
          <circle className="lp-bp-disc lp-dim" cx="52" cy="353" r="12" />
          <g>
            {[
              [128, 92],
              [212, 112],
              [296, 90],
              [380, 110],
              [462, 94],
            ].map(([cx, cy]) => (
              <circle className="lp-bp-node lp-n1" key={cx} cx={cx} cy={cy} r="11" />
            ))}
          </g>
          <g>
            {[
              [140, 226],
              [236, 244],
              [332, 224],
              [428, 240],
            ].map(([cx, cy]) => (
              <circle className="lp-bp-node" key={cx} cx={cx} cy={cy} r="11" />
            ))}
          </g>
          <g className="lp-dim">
            {[
              [150, 348],
              [260, 360],
              [370, 346],
            ].map(([cx, cy]) => (
              <circle className="lp-bp-node" key={cx} cx={cx} cy={cy} r="10" />
            ))}
          </g>
        </svg>
        <span className="lp-chip lp-c1">
          <i />
          <b>{moduleName(1)}</b>
          <em>{map.free}</em>
        </span>
        <span className="lp-chip lp-c2 lp-mute">
          <i />
          <b>{moduleName(2)}</b>
        </span>
        <span className="lp-chip lp-c3 lp-mute">
          <i />
          <b>{moduleName(3)}</b>
        </span>
      </div>
      <figcaption>
        <b>{figureTitle}</b>
        {figureLine}
      </figcaption>
    </figure>
  );
}

export function CloseSheet({ locale, teachHref }: { locale: LocaleCode; teachHref: string }) {
  const close = CLOSE_TEXT[locale];
  const shared = CATALOG_TEXT[locale];
  const catalog = `/${locale}/explorar`;
  const { routes } = EXAMPLE_ROUTES[locale];
  return (
    <section className="lp-final" aria-labelledby="lp-close-title">
      <div className="lp-wrap">
        <div className="lp-sheet">
          <i className="lp-tick lp-tl" />
          <i className="lp-tick lp-tr" />
          <i className="lp-tick lp-bl" />
          <i className="lp-tick lp-br" />
          <div className="lp-close">
            <div>
              <h2 id="lp-close-title">{close.title}</h2>
              <p className="lp-intro">{close.line}</p>
              <form className="lp-ask" method="get" action={catalog}>
                <label className="lp-sr" htmlFor="lp-want">
                  {close.label}
                </label>
                <input
                  id="lp-want"
                  name="q"
                  type="search"
                  autoComplete="off"
                  maxLength={200}
                  placeholder={close.placeholder}
                />
                <Button type="submit">{close.button}</Button>
              </form>
              <nav className="lp-ideas" aria-label={close.ideasGroup}>
                <span>{close.ideasLabel}</span>
                {EXAMPLE_ROUTE_KEYS.map((key) => (
                  <a key={key} href={`${catalog}?q=${encodeURIComponent(routes[key].title)}`}>
                    {routes[key].title}
                  </a>
                ))}
              </nav>
            </div>
            <Blueprint locale={locale} />
          </div>
        </div>
        <div className="lp-teach">
          <div>
            <h2>{shared.teachTitle}</h2>
            <p className="lp-teach-body">{shared.teachBody}</p>
          </div>
          <div className="lp-teach-action">
            <ButtonLink href={teachHref} emphasis="secondary">
              {shared.teachAction}
            </ButtonLink>
            <span className="lp-fine">{LANDING_TEXT[locale].teachInvitation}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
