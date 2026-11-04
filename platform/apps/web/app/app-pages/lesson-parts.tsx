import type { LessonBlock } from "@learning-routes/core/content/lesson-view";
import { LESSON_TEXT } from "@learning-routes/core/copy/lesson";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { useEffect, useId, useRef, useState } from "react";
import { filled, inLocale } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";

/** A question nobody can get right is the creator's mistake, and never blocks the student. */
export const isAnswerable = (block: LessonBlock) =>
  block.kind === "check" && (block.data as unknown as CheckData).options?.some((o) => o.correct);

const BLANK_LINE = /\n{2,}/;
const paragraphs = (text: string) => text.split(BLANK_LINE).filter(Boolean);

function Prose({ text, className }: { text: string; className?: string }) {
  return paragraphs(text).map((part, index) => (
    <p key={index} className={className}>
      {part}
    </p>
  ));
}

interface CheckData {
  question: LocalizedText;
  options: { label: LocalizedText; correct: boolean }[];
  explanation?: LocalizedText | null;
}

type Answer = "none" | "needed" | "wrong" | "right";

function Question({
  data,
  locale,
  source,
  onRight,
}: {
  data: CheckData;
  locale: LocaleCode;
  source: string;
  onRight: () => void;
}) {
  const words = LESSON_TEXT[locale];
  const [picked, setPicked] = useState<number | null>(null);
  const [answer, setAnswer] = useState<Answer>("none");
  const [tries, setTries] = useState(0);
  const titleId = useId();
  const check = () => {
    if (picked === null) {
      setAnswer("needed");
      return;
    }
    if (data.options[picked]?.correct) {
      setAnswer("right");
      onRight();
    } else {
      setAnswer("wrong");
      setTries((count) => count + 1);
    }
  };
  const explanation = inLocale(data.explanation, locale, source);
  const feedback = {
    none: "",
    needed: words.pickOne,
    wrong: words.wrong,
    right: explanation ? `${words.right} ${explanation}` : words.right,
  }[answer];
  return (
    <section className="lesson-question settle-3" aria-labelledby={titleId}>
      <h2 className="lesson-question-label">{words.question}</h2>
      <p className="lesson-ask" id={titleId}>
        {inLocale(data.question, locale, source)}
      </p>
      <fieldset className="lesson-options" aria-labelledby={titleId}>
        {data.options.map((option, index) => {
          const chosen = picked === index;
          const state =
            chosen && answer === "right"
              ? "is-right"
              : chosen && answer === "wrong"
                ? "is-wrong"
                : "";
          return (
            <label
              // A new key replays the shake on each wrong try.
              key={chosen && answer === "wrong" ? `${index}-${tries}` : index}
              className={`lesson-option ${state}`.trim()}
            >
              <input
                className="lesson-option-input"
                type="radio"
                name={titleId}
                checked={chosen}
                disabled={answer === "right"}
                onChange={() => {
                  setPicked(index);
                  setAnswer("none");
                }}
              />
              <span className="lesson-option-dot" />
              {inLocale(option.label, locale, source)}
              {state === "is-right" ? (
                <svg
                  className="lesson-tick"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
                </svg>
              ) : null}
            </label>
          );
        })}
      </fieldset>
      <div className="lesson-actions">
        {answer === "right" ? null : <Button onClick={check}>{words.check}</Button>}
        <p className={`lesson-feedback lesson-feedback-${answer}`} aria-live="polite">
          {feedback}
        </p>
      </div>
    </section>
  );
}

/** What a student reads. Every field is shown as plain text, never as HTML. */
export function LessonBlocks({
  blocks,
  locale,
  source,
  onAllRight,
}: {
  blocks: LessonBlock[];
  locale: LocaleCode;
  source: string;
  onAllRight: () => void;
}) {
  const checks = blocks.filter(isAnswerable).length;
  const right = useRef(new Set<string>());
  return blocks.map((block) => {
    const text = (field: string) =>
      inLocale(block.data[field] as LocalizedText | null | undefined, locale, source);
    switch (block.kind) {
      case "check":
        return !isAnswerable(block) ? null : (
          <Question
            key={block.id}
            data={block.data as unknown as CheckData}
            locale={locale}
            source={source}
            onRight={() => {
              right.current.add(block.id);
              if (right.current.size === checks) {
                onAllRight();
              }
            }}
          />
        );
      case "tip":
      case "example":
        return (
          <aside key={block.id} className={`lesson-aside lesson-${block.kind} settle-2`}>
            <Prose text={text("body")} />
          </aside>
        );
      case "summary":
        return (
          <section key={block.id} className="lesson-aside lesson-summary settle-2">
            <Prose text={text("body")} />
            <ul>
              {((block.data.key_points as LocalizedText[] | undefined) ?? []).map((point) => (
                <li key={inLocale(point, locale, source)}>{inLocale(point, locale, source)}</li>
              ))}
            </ul>
          </section>
        );
      default:
        return <Prose key={block.id} text={text("body")} className="lesson-body settle-2" />;
    }
  });
}

/** The end of a topic. With a question answered, this is the one celebration. */
export function TopicDone({
  shown,
  celebrate,
  locale,
  href,
  nextLine,
  action,
}: {
  shown: boolean;
  celebrate: boolean;
  locale: LocaleCode;
  href: string;
  nextLine: string;
  action: string;
}) {
  const band = useRef<HTMLDivElement>(null);
  // The Check button that held focus has just gone: keep the keyboard where the way on is.
  useEffect(() => {
    if (celebrate) {
      band.current?.focus();
    }
  }, [celebrate]);
  if (!shown) {
    return null;
  }
  const words = LESSON_TEXT[locale];
  return (
    <div
      ref={band}
      tabIndex={-1}
      className={`lesson-done-band${celebrate ? " is-celebrating" : ""}`}
      role="status"
    >
      <div>
        {/* Only an answered question earns the words: a topic with none just goes on. */}
        {celebrate ? <p className="lesson-done-title">{words.topicDone}</p> : null}
        <p className="lesson-done-next">{nextLine}</p>
        {celebrate ? <p className="lesson-done-note">{words.notSaved}</p> : null}
      </div>
      <ButtonLink href={href}>{action}</ButtonLink>
    </div>
  );
}
