import type { AnswerResult, PlayView } from "@learning-routes/core/actions/player";
import { fill } from "@learning-routes/core/copy/player";
import { UI_COPY } from "@learning-routes/core/copy/ui";
import { useEffect, useRef } from "react";
import { ThemeToggle } from "../ui/theme-toggle";
import { Icon, usePlayer } from "./shared";

// The frame around the beats: the bar on top, the topic list and the tutor on a wide screen, the
// sheet that answers a check, and the end of a topic.

export function TopBar({
  route,
  exit,
  at,
  total,
  xp,
}: {
  route: string;
  exit: string;
  at: number;
  total: number;
  xp: number;
}) {
  const { words, locale } = usePlayer();
  const ui = UI_COPY[locale];
  return (
    <div className="p-topbar">
      <a className="p-icon-btn" href={exit} aria-label={words.close}>
        <Icon name="close" size={18} />
      </a>
      <p className="p-topbar-route">{route}</p>
      <div
        className="p-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={at}
        aria-label={fill(words.beatOf, { n: at, total })}
      >
        <i style={{ transform: `scaleX(${total ? at / total : 0})` }} />
      </div>
      <span className="p-xp" aria-live="polite">
        {xp} XP
      </span>
      <div className="p-theme">
        <ThemeToggle toDark={ui.toDark} toLight={ui.toLight} />
      </div>
    </div>
  );
}

export function Outline({ view, hrefOf }: { view: PlayView; hrefOf: (n: number) => string }) {
  const { t, words } = usePlayer();
  const done = view.outline.filter((o) => o.done).length;
  return (
    <nav className="p-outline" aria-label={t(view.moduleTitle)}>
      <p className="p-label">{fill(words.module, { n: view.moduleNumber })}</p>
      <p className="p-outline-title">{t(view.moduleTitle)}</p>
      <p className="p-sub">{fill(words.lessonsOf, { n: done, total: view.outline.length })}</p>
      <ol>
        {view.outline.map((topic) => (
          <li key={topic.number}>
            <a href={hrefOf(topic.number)} aria-current={topic.current ? "page" : undefined}>
              <span className={`p-dot ${topic.done ? "is-done" : ""}`}>
                {topic.done ? <Icon name="check" size={12} /> : topic.number}
              </span>
              <span>{t(topic.title)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Tutor() {
  const { words } = usePlayer();
  return (
    <aside className="p-tutor" aria-label={words.tutorTitle}>
      <div className="p-tutor-head">
        <span className="p-avatar" aria-hidden="true">
          <Icon name="chat" size={18} />
        </span>
        <div>
          <p className="p-tutor-title">{words.tutorTitle}</p>
          <p className="p-sub">{words.tutorSub}</p>
        </div>
      </div>
      <div className="p-tutor-body">
        <p className="p-bubble">{words.tutorSoon}</p>
      </div>
    </aside>
  );
}

interface SheetProps {
  result: AnswerResult;
  onContinue: () => void;
  onRetry: (() => void) | null;
}

/** What the server said about an answer, with what to do next. */
export function Sheet({ result, onContinue, onRetry }: SheetProps) {
  const { t, words } = usePlayer();
  const ok = result.correct !== false;
  const partly = !ok && (result.score ?? 0) >= 50;
  const title = ok ? words.right : partly ? words.partly : words.wrong;
  const explanation = result.explanation ? t(result.explanation) : "";
  return (
    <div className={`p-sheet ${ok ? "is-ok" : ""}`} role="status" aria-live="assertive">
      <div className="p-sheet-inner">
        <div className="p-sheet-head">
          <span className="p-badge p-pop" aria-hidden="true">
            <Icon name={ok ? "check" : "x"} size={18} />
          </span>
          <p className="p-sheet-title">{title}</p>
          {result.xp.gained > 0 ? (
            <span className="p-xp-float">{fill(words.xpGained, { n: result.xp.gained })}</span>
          ) : null}
        </div>
        {explanation ? <p className="p-sheet-text">{explanation}</p> : null}
        <SheetActions
          ok={ok}
          canGoOn={ok || !onRetry || result.attempts >= 2}
          onContinue={onContinue}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

function SheetActions({
  ok,
  canGoOn,
  onContinue,
  onRetry,
}: {
  ok: boolean;
  canGoOn: boolean;
  onContinue: () => void;
  onRetry: (() => void) | null;
}) {
  const { words } = usePlayer();
  const main = useRef<HTMLButtonElement>(null);
  // The keyboard lands on what comes next: fixing a wrong answer, or moving on from a right one.
  useEffect(() => main.current?.focus(), []);
  return (
    <div className="p-sheet-actions">
      {onRetry ? (
        <button
          ref={ok ? undefined : main}
          type="button"
          className={ok ? "p-secondary" : "p-primary"}
          onClick={onRetry}
        >
          {words.fix}
        </button>
      ) : null}
      {canGoOn ? (
        <button
          ref={ok || !onRetry ? main : undefined}
          type="button"
          className={ok ? "p-primary" : "p-secondary"}
          onClick={onContinue}
        >
          {words.continue} <Icon name="arrow" />
        </button>
      ) : null}
    </div>
  );
}

interface SummaryProps {
  view: PlayView;
  xp: number;
  routeXp: number;
  firstTry: number;
  graded: number;
  missing: number;
  nextHref: string | null;
  exit: string;
  onReview: () => void;
}

export function Summary({
  view,
  xp,
  routeXp,
  firstTry,
  graded,
  missing,
  nextHref,
  exit,
  onReview,
}: SummaryProps) {
  const { t, words } = usePlayer();
  return (
    <section className="p-summary p-in">
      <span className="p-summary-ring p-ring" aria-hidden="true">
        <Icon name="check" size={34} />
      </span>
      <h1 className="p-title">{missing ? t(view.title) : words.topicDone}</h1>
      <p className="p-sub">{missing ? words.missingGates : words.topicDoneBody}</p>
      <dl className={`p-stats ${graded ? "" : "is-practice"}`}>
        {graded ? (
          <>
            <div>
              <dt>XP</dt>
              <dd>+{xp}</dd>
            </div>
            <div>
              <dt>{words.firstTry}</dt>
              <dd>{fill(words.scoreOf, { n: firstTry, total: graded })}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>{words.xpTotal}</dt>
          <dd>{routeXp}</dd>
        </div>
      </dl>
      <div className="p-row">
        {missing ? (
          <button type="button" className="p-primary" onClick={onReview}>
            {words.fix}
          </button>
        ) : (
          <a className="p-primary" href={nextHref ?? exit}>
            {nextHref ? words.nextTopic : words.backToRoute} <Icon name="arrow" />
          </a>
        )}
        <a className="p-secondary" href={exit}>
          {view.next && nextHref ? words.backToRoute : words.readAll}
        </a>
      </div>
    </section>
  );
}
