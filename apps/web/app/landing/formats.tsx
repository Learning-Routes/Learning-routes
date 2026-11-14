import { LANDING_FORMATS_TEXT } from "@learning-routes/core/copy/landing-formats";
import { EXAMPLE_ROUTE_KEYS, EXAMPLE_ROUTES } from "@learning-routes/core/copy/landing-routes";
import type { LocaleCode } from "@learning-routes/core/locales";
import { filled } from "../storefront/words";
import { RouteFigure } from "../ui/route-figure";

// Two landing sections, server HTML with motion in CSS only (no script): the shape of a route, and
// the ways a topic teaches. Each tile's little scene is decoration, so it is aria-hidden; its
// title and sentence carry the meaning.

const CARD_BOX = { width: 340, height: 150 };
/** The example routes' topics per module: five and four, a third of four, each with its exam. */
const EXAMPLE_LESSONS = [6, 5, 5];

/** While no route is published, the example routes show what a route's shape means. */
export function RouteShapes({ locale }: { locale: LocaleCode }) {
  const words = LANDING_FORMATS_TEXT[locale];
  const { routes } = EXAMPLE_ROUTES[locale];
  const topics = EXAMPLE_LESSONS.reduce((sum, count) => sum + count - 1, 0);
  return (
    <section className="landing-routes" aria-labelledby="fm-shapes">
      <div className="fm-head">
        <h2 id="fm-shapes" className="landing-section-title">
          {words.shapesTitle}
        </h2>
        <p className="fm-lead">{words.shapesLead}</p>
      </div>
      <ul className="landing-routes-grid fm-shelf">
        {EXAMPLE_ROUTE_KEYS.map((key) => (
          <li key={key}>
            <article className="route-card">
              <RouteFigure
                lessons={EXAMPLE_LESSONS}
                seed={`example-${key}`}
                box={CARD_BOX}
                travels
                className="route-card-line"
              />
              <h3 className="route-card-title">{routes[key].title}</h3>
              <p className="route-card-creator">{words.example}</p>
              <p className="route-card-facts">
                {filled(words.shapeFacts, { modules: EXAMPLE_LESSONS.length, topics })}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** «Not a quiz. A class.»: five ways a topic teaches, each with a small scene that plays. */
export function LessonFormats({ locale }: { locale: LocaleCode }) {
  const words = LANDING_FORMATS_TEXT[locale];
  const { order, listen, code, worked, diagram } = words;
  return (
    <section className="landing-routes" aria-labelledby="fm-formats">
      <div className="fm-head">
        <h2 id="fm-formats" className="landing-section-title">
          {words.formatsTitle}
        </h2>
        <p className="fm-lead">{words.formatsLead}</p>
      </div>
      <div className="fm-bento">
        <article className="fm-tile fm-a">
          <h3>{order.title}</h3>
          <p className="fm-body">{order.body}</p>
          <ol className="fm-scene fm-order" aria-hidden="true">
            {order.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
        <article className="fm-tile fm-b">
          <h3>{listen.title}</h3>
          <p className="fm-body">{listen.body}</p>
          <div className="fm-scene" aria-hidden="true">
            <div className="fm-wave">
              {Array.from({ length: 18 }, (_, bar) => (
                <i key={bar} />
              ))}
            </div>
            <p className="fm-say">
              <b className="fm-phrase">{listen.phrase}</b>
              {listen.meaning}
            </p>
          </div>
        </article>
        <article className="fm-tile fm-c">
          <h3>{code.title}</h3>
          <p className="fm-body">{code.body}</p>
          <div className="fm-scene" aria-hidden="true">
            <pre className="fm-code">
              <span>
                <em>def</em> promedio(notas):
              </span>
              <span>{"  "}total = sum(notas)</span>
              <span>
                {"  "}
                <em>return</em> total / len(notas)
              </span>
            </pre>
            <p className="fm-pass">
              {CHECK}
              {code.tests}
            </p>
          </div>
        </article>
        <article className="fm-tile fm-d">
          <h3>{worked.title}</h3>
          <p className="fm-body">{worked.body}</p>
          <ol className="fm-scene fm-worked" aria-hidden="true">
            <li>2x + 6 = 14</li>
            <li>
              2x = 8<small>{worked.notes[0]}</small>
            </li>
            <li>
              x = 4<small>{worked.notes[1]}</small>
            </li>
          </ol>
        </article>
        <article className="fm-tile fm-e">
          <h3>{diagram.title}</h3>
          <p className="fm-body">{diagram.body}</p>
          <div className="fm-scene fm-diagram" aria-hidden="true">
            <svg viewBox="0 0 300 150" aria-hidden="true">
              <circle cx="150" cy="75" r="44" />
              <circle className="fm-core" cx="150" cy="75" r="15" />
              <path d="M165 75h70M150 31V12" />
            </svg>
            <span className="fm-tag fm-t1">{diagram.labels[0]}</span>
            <span className="fm-tag fm-t2">{diagram.labels[1]}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
