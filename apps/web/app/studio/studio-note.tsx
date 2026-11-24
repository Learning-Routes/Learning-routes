import type { AssistantText } from "@learning-routes/core/copy/assistant";
import type { LessonPreview, LogEntry } from "@learning-routes/core/studio/session";
import { type RefObject, useEffect, useRef, useState } from "react";
import { filled } from "../storefront/words";

const TICKS = /`([^`]+)`/;

/** A lesson's words, with what the model wrote between backticks as code and not as marks. */
function withCode(text: string) {
  return text.split(TICKS).map((part, index) =>
    // split() puts each captured piece at an odd place.
    index % 2 === 1 ? <code key={index}>{part}</code> : part,
  );
}

/**
 * A glimpse of the lesson just written, pinned by its station. It is open while it is the news;
 * once the creator answers, the conversation is what reads, so the note folds into its title and
 * opens again when asked. A new preview arrives open.
 */
export function PreviewNote({
  preview,
  log,
  words,
  isPinned,
  noteRef,
}: {
  preview: LessonPreview | null;
  log: LogEntry[];
  words: AssistantText;
  isPinned: boolean;
  noteRef: RefObject<HTMLDivElement | null>;
}) {
  const [isFolded, setIsFolded] = useState(false);
  // The creator's newest turn: a different one than when the preview arrived means they answered.
  const mine = log.filter((entry) => entry.who === "creator").at(-1);
  const arrivedWith = useRef(mine);
  const latest = useRef(mine);
  latest.current = mine;
  useEffect(() => {
    if (mine !== arrivedWith.current) {
      setIsFolded(true);
    }
  }, [mine]);
  const shown = preview ? `${preview.station} ${preview.title}` : "";
  // A new preview is what opens the note again.
  useEffect(() => {
    arrivedWith.current = latest.current;
    setIsFolded(false);
  }, [shown]);
  if (!preview) {
    return <div ref={noteRef} hidden />;
  }
  const pinned = isPinned ? " is-pinned" : "";
  if (isFolded) {
    return (
      <div ref={noteRef} className={`studio-note is-folded${pinned}`}>
        <button type="button" className="studio-note-fold" onClick={() => setIsFolded(false)}>
          <span className="studio-note-format">{words.previewShow}</span>
          <span className="studio-note-fold-title">{preview.title}</span>
        </button>
      </div>
    );
  }
  return (
    <div ref={noteRef} className={`studio-note${pinned}`}>
      <button
        type="button"
        className="studio-note-close"
        aria-label={words.previewHide}
        onClick={() => setIsFolded(true)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" />
        </svg>
      </button>
      <p className="studio-note-format">{filled(words.previewOf, { format: preview.format })}</p>
      <h2 className="studio-note-title">{preview.title}</h2>
      <p className="studio-note-body">{withCode(preview.body)}</p>
      {preview.question ? (
        <>
          <p className="studio-note-prompt">{withCode(preview.question.prompt)}</p>
          <ul className="studio-note-options">
            {preview.question.options.map((option, index) => (
              <li key={option} className={index === preview.question?.answer ? "is-answer" : ""}>
                {withCode(option)}
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
