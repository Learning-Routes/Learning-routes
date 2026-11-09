import type { AssistantText } from "@learning-routes/core/copy/assistant";
import { BRAND } from "@learning-routes/core/locales";
import {
  type LessonPreview,
  planStations,
  STUDIO_STEPS,
  type StudioInput,
  type StudioState,
} from "@learning-routes/core/studio/session";
import { type RefObject, useMemo } from "react";
import { filled } from "../storefront/words";

// The pieces of the assistant's page (Platform STEP 10): its legend and steps, the route as a
// list, a lesson's preview, and the subtitles with their choices and the box to answer in.

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

export function RouteList({
  state,
  words,
  isHidden,
}: {
  state: StudioState;
  words: AssistantText;
  isHidden: boolean;
}) {
  if (!state.route) {
    return null;
  }
  return (
    <section className={isHidden ? "studio-sr" : "studio-list"} aria-label={words.routeList}>
      <h2>{words.routeList}</h2>
      <ol>
        {planStations(state.route.modules).map((station, index) => (
          <li
            key={`${station.kind}-${station.title}`}
            className={index < state.built ? "is-built" : ""}
          >
            {station.kind === "module"
              ? `${filled(words.moduleN, { n: station.moduleIndex + 1 })}: ${station.title}`
              : station.title}
          </li>
        ))}
      </ol>
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

export function Said({ text, isClient }: { text: string; isClient: boolean }) {
  // Before hydration the sentence is plain text; after, each word rises in turn.
  const words = useMemo(() => text.split(" ").map((word, order) => ({ word, order })), [text]);
  if (!isClient) {
    return <p className="studio-say">{text}</p>;
  }
  return (
    <p className="studio-say" aria-live="polite" key={text}>
      {words.map(({ word, order }) => (
        <span
          key={`${order}-${word}`}
          className="studio-word"
          style={{ animationDelay: `${order * 38}ms` }}
        >
          {`${word} `}
        </span>
      ))}
    </p>
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
