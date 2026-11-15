import { useEffect, useState } from "react";
import { BeatMarkdown, type BeatProps, Icon, list, obj, usePlayer } from "./shared";

// Questions of choosing (Platform STEP 12): one option, a flashcard, a scenario. Each keeps what the
// learner chose, hands the player a complete answer, and colours itself from the server's verdict.

/** A choice of one, keyed A–D from the keyboard. */
export function Check({ beat, result, setSubmission }: BeatProps) {
  const { t } = usePlayer();
  const options = list<{ label: unknown }>(beat.data.options);
  const [pick, setPick] = useState<number | null>(null);
  const locked = result?.correct === true;
  const solution = obj(result?.solution).option_index;

  const choose = (index: number) => {
    if (locked) {
      return;
    }
    setPick(index);
    setSubmission({ option_index: index });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = "abcdef".indexOf(event.key.toLowerCase());
      if (
        index >= 0 &&
        index < options.length &&
        !event.metaKey &&
        !event.ctrlKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        choose(index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`p-options ${options.length === 4 ? "p-two" : ""} p-in d2`}>
      {options.map((option, index) => {
        const picked = pick === index;
        let tone = "";
        if (result && picked) {
          tone = result.correct ? "is-right" : "is-wrong p-shake";
        } else if (result && solution === index) {
          tone = "is-right";
        } else if (result?.correct) {
          tone = "is-dim";
        }
        return (
          <button
            key={index}
            type="button"
            className={`p-option ${tone}`}
            aria-pressed={picked}
            onClick={() => choose(index)}
          >
            <span className="p-key">{"ABCDEF"[index]}</span>
            <span>{t(option.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Flashcards: flip, then say how well you knew it. */
export function Cards({ beat, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const cards = list<{ front: unknown; back: unknown }>(beat.data.cards);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const card = cards[at];

  useEffect(() => {
    setSubmission(Object.keys(ratings).length === cards.length ? { ratings } : null);
  }, [ratings, cards.length, setSubmission]);

  const rate = (rating: string) => {
    setRatings({ ...ratings, [at]: rating });
    setFlipped(false);
    setAt(Math.min(cards.length - 1, at + 1));
  };

  return (
    <div className="p-cards p-in d2">
      <button
        type="button"
        className={`p-flash ${flipped ? "is-flipped" : ""}`}
        onClick={() => setFlipped(!flipped)}
      >
        <span className="p-label">
          {at + 1} / {cards.length}
        </span>
        <span className="p-flash-text">{t(flipped ? card?.back : card?.front)}</span>
        {flipped ? null : <span className="p-sub">{words.flip}</span>}
      </button>
      {flipped ? (
        <div className="p-rate">
          <button type="button" className="p-chip" onClick={() => rate("hard")}>
            {words.again}
          </button>
          <button type="button" className="p-chip" onClick={() => rate("good")}>
            <Icon name="check" /> {words.knewIt}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A situation with choices; each shows what it leads to. */
export function Scenario({ beat, setSubmission }: BeatProps) {
  const { t } = usePlayer();
  const options = list<{ label: unknown; consequence: unknown }>(beat.data.options);
  const [pick, setPick] = useState<number | null>(null);
  return (
    <>
      <BeatMarkdown beat={beat} field="situation" />
      <div className="p-options p-in d2">
        {options.map((option, index) => (
          <button
            key={index}
            type="button"
            className="p-option"
            aria-pressed={pick === index}
            onClick={() => {
              setPick(index);
              setSubmission({ option_index: index });
            }}
          >
            <span className="p-key">{"ABCDEF"[index]}</span>
            <span>
              {t(option.label)}
              {pick === index ? (
                <small className="p-consequence p-in">{t(option.consequence)}</small>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
