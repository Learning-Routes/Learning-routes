import { TEACH_COST_TEXT } from "@learning-routes/core/copy/teach-cost";
import type { LocaleCode } from "@learning-routes/core/locales";

/** Said before the form, to whoever is not a creator yet: teaching is paid, and when it opens. */
export function TeachCost({ locale }: { locale: LocaleCode }) {
  const words = TEACH_COST_TEXT[locale];
  return (
    <section className="teach-cost settle-2" aria-labelledby="teach-cost-title">
      <svg className="teach-cost-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="21" />
        <path d="M24 12v24M30 17.500c-1.200-1.800-3.300-2.800-6-2.800-3.600 0-6 1.900-6 4.600 0 6.200 12.500 3 12.500 9.400 0 2.800-2.600 4.800-6.500 4.800-3 0-5.400-1.200-6.700-3.200" />
      </svg>
      <div>
        <h2 id="teach-cost-title" className="teach-cost-title">
          {words.title}
        </h2>
        <p className="teach-cost-body">{words.body}</p>
        <p className="teach-cost-row">
          <button type="button" className="button button-primary button-regular" disabled>
            <span className="button-label">{words.button}</span>
          </button>
          <span className="teach-cost-soon">{words.soon}</span>
        </p>
        <p className="teach-cost-wait">{words.wait}</p>
      </div>
    </section>
  );
}
