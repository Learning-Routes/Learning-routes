import type { AssistantText } from "@learning-routes/core/copy/assistant";
import { BRAND } from "@learning-routes/core/locales";
import {
  type LessonPreview,
  planStations,
  STUDIO_STEPS,
  type StudioInput,
  type StudioState,
} from "@learning-routes/core/studio/session";
import type { RefObject } from "react";
import { filled } from "../storefront/words";

// The pieces of the assistant's page (Platform STEP 10): its legend and steps, the route as a
// list beside the map, a lesson's preview, and the conversation with its choices.

function tickClass(index: number, now: number, isDone: boolean) {
  if (isDone || index + 1 < now) {
    return "is-done";
  }
  return index + 1 === now ? "is-now" : "";
}

export function StudioTop({ state, words }: { state: StudioState; words: AssistantText }) {
  const now = STUDIO_STEPS.indexOf(state.step) + 1;
  const isDone = state.publishedAt !== null;
  return (
    <header className="studio-top">
      <div>
        <a className="studio-brand" href="/creador">
          <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
            <rect width="26" height="26" rx="7" fill="#6A2EA0" />
            <path
              d="M6 19C10 18 9 9 13 10S17 7 20 6"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx="20" cy="6" r="2.4" fill="#E9A23B" />
            <circle cx="6" cy="19" r="2" fill="#fff" />
          </svg>
          {BRAND}
        </a>
        {state.route ? (
          <div className="studio-route">
            <h1 className="studio-route-title">{state.route.title}</h1>
            <p className="studio-route-summary">{state.route.summary}</p>
            <p className={`studio-route-state${isDone ? " is-live" : ""}`}>
              {isDone ? words.published : words.draft}
            </p>
          </div>
        ) : (
          <h1 className="studio-sr">{words.pageTitle}</h1>
        )}
      </div>
      <div className="studio-where" aria-live="polite">
        <p>
          {filled(words.stepOf, {
            n: now,
            total: STUDIO_STEPS.length,
            name: words.steps[state.step],
          })}
        </p>
        <ol className="studio-ticks" aria-hidden="true">
          {STUDIO_STEPS.map((step, index) => (
            <li key={step} className={tickClass(index, now, isDone)} />
          ))}
        </ol>
      </div>
    </header>
  );
}

function stationClass(index: number, state: StudioState, isModule: boolean) {
  const kind = isModule ? "is-module" : "is-lesson";
  if (index < state.built) {
    return `${kind} is-built`;
  }
  // The station being written is the first one not built, while the assistant is at work.
  return index === state.built && state.step === "build" && state.working
    ? `${kind} is-writing`
    : kind;
}

/** The route, in order, beside the map: what is written, what is being written, what is new. */
export function RouteList({
  state,
  words,
  listRef,
}: {
  state: StudioState;
  words: AssistantText;
  listRef: RefObject<HTMLElement | null>;
}) {
  if (!state.route) {
    return null;
  }
  const stations = planStations(state.route.modules);
  return (
    <section ref={listRef} className="studio-list" aria-label={words.routeList}>
      <h2>{words.routeList}</h2>
      <ol>
        {stations.map((station, index) => (
          <li
            key={`${station.kind}-${station.moduleIndex}-${station.title}`}
            className={stationClass(index, state, station.kind === "module")}
          >
            {station.kind === "module" ? (
              <span className="studio-list-module">
                {filled(words.moduleN, { n: station.moduleIndex + 1 })}
              </span>
            ) : null}
            {station.title}
            {station.isNew ? <span className="studio-list-new">{words.newLesson}</span> : null}
          </li>
        ))}
      </ol>
      <p className="studio-list-meter">
        <span style={{ width: `${(state.built / Math.max(1, stations.length)) * 100}%` }} />
        {filled(words.builtOf, { n: state.built, total: stations.length })}
      </p>
    </section>
  );
}

export function PreviewNote({
  preview,
  words,
  isPinned,
  noteRef,
}: {
  preview: LessonPreview | null;
  words: AssistantText;
  isPinned: boolean;
  noteRef: RefObject<HTMLDivElement | null>;
}) {
  if (!preview) {
    return <div ref={noteRef} hidden />;
  }
  return (
    <div ref={noteRef} className={`studio-note${isPinned ? " is-pinned" : ""}`}>
      <p className="studio-note-format">{filled(words.previewOf, { format: preview.format })}</p>
      <h2 className="studio-note-title">{preview.title}</h2>
      <p className="studio-note-body">{preview.body}</p>
      {preview.question ? (
        <>
          <p className="studio-note-prompt">{preview.question.prompt}</p>
          <ul className="studio-note-options">
            {preview.question.options.map((option, index) => (
              <li key={option} className={index === preview.question?.answer ? "is-answer" : ""}>
                {option}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {preview.previewUrl ? (
        <a className="studio-note-link" href={preview.previewUrl}>
          {words.openPreview}
        </a>
      ) : null}
    </div>
  );
}

/** The newest turns the page shows; older ones fade out at the top. */
const SHOWN = 4;

const MARK = (
  <svg width="15" height="15" viewBox="0 0 26 26" aria-hidden="true">
    <path
      d="M6 19C10 18 9 9 13 10S17 7 20 6"
      fill="none"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <circle cx="20" cy="6" r="2.6" fill="#E9A23B" />
  </svg>
);

/** The conversation: the creator's words on the right, the assistant's beside its mark. */
export function Thread({ state, words }: { state: StudioState; words: AssistantText }) {
  const first = Math.max(0, state.log.length - SHOWN);
  return (
    <ol className="studio-thread" aria-live="polite">
      {state.log.slice(first).map((entry, index) => (
        <li
          // A turn keeps its key while its streamed words grow, so it rises once.
          key={first + index}
          className={`studio-turn is-${entry.who}${first + index < state.log.length - 2 ? " is-old" : ""}`}
        >
          {entry.who === "assistant" ? <span className="studio-turn-mark">{MARK}</span> : null}
          <span className="studio-sr">
            {entry.who === "assistant" ? words.assistant : words.you}:{" "}
          </span>
          <p>{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function Confirm({
  state,
  words,
  send,
}: {
  state: StudioState;
  words: AssistantText;
  send: (input: StudioInput) => void;
}) {
  if (!(state.confirming && state.route)) {
    return null;
  }
  const { address, price } = state.confirming;
  return (
    <div className="studio-confirm">
      <h2>{filled(words.confirmTitle, { title: state.route.title })}</h2>
      <p>
        {filled(words.confirmWhere, { address })}{" "}
        {price ? filled(words.confirmPrice, { price }) : words.confirmFree}
      </p>
      <div className="studio-options">
        <button
          type="button"
          className="studio-option is-primary"
          onClick={() => send({ type: "publish", isConfirmed: true })}
        >
          {words.confirmYes}
        </button>
        <button
          type="button"
          className="studio-option"
          onClick={() => send({ type: "publish", isConfirmed: false })}
        >
          {words.confirmNo}
        </button>
      </div>
    </div>
  );
}

export function Choices({
  state,
  hot,
  setHot,
  choose,
}: {
  state: StudioState;
  hot: number;
  setHot: (branch: number) => void;
  choose: (branch: number) => void;
}) {
  if (state.options.length === 0) {
    return null;
  }
  const hover = (branch: number) => () => state.isFork && setHot(branch);
  return (
    <div className="studio-options">
      {state.options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          className={`studio-option${option.isPrimary ? " is-primary" : ""}${hot === index ? " is-hot" : ""}`}
          onClick={() => choose(index)}
          onPointerEnter={hover(index)}
          onPointerLeave={hover(-1)}
          onFocus={hover(index)}
          onBlur={hover(-1)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
