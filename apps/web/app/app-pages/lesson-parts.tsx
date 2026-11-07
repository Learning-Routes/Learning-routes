import type { LessonBlock } from "@learning-routes/core/content/lesson-view";
import { LESSON_TEXT } from "@learning-routes/core/copy/lesson";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { useEffect, useId, useRef, useState } from "react";
import { inLocale } from "../storefront/words";
import { Button, ButtonLink } from "../ui/button";
import { BlockView } from "./lesson-blocks";

/** A question nobody can get right is the creator's mistake, and never blocks the student. */
export const isAnswerable = (block: LessonBlock) =>
  block.kind === "check" && (block.data as unknown as CheckData).options?.some((o) => o.correct);

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
    // The creator's own explanation, as a hint.
    wrong: explanation ? `${words.wrong} ${explanation}` : words.wrong,
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

/** What a student reads: every block a creator brought, each through its own view. */
export function LessonBlocks({
  blocks,
  locale,
  source,
  creator,
  onAllRight,
}: {
  blocks: LessonBlock[];
  locale: LocaleCode;
  source: string;
  /** Whose space it is, in the reader's language. */
  creator: string;
  onAllRight: () => void;
}) {
  const checks = blocks.filter(isAnswerable).length;
  const right = useRef(new Set<string>());
  const question = (block: LessonBlock) =>
    isAnswerable(block) ? (
      <Question
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
    ) : null;
  return blocks.map((block) => (
    <BlockView
      key={block.id}
      block={block}
      locale={locale}
      source={source}
      question={question}
      creator={creator}
    />
  ));
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
