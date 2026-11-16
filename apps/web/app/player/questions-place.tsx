import { fill } from "@learning-routes/core/copy/player";
import { useEffect, useRef, useState } from "react";
import { type BeatProps, list, obj, toneOf, usePlayer } from "./shared";

// Questions of placing (Platform STEP 12): steps in order, pairs, words in blanks. A wrong part is
// undone when the learner fixes it; what was right stays. None of them knows the answer.

const BLANK = /_{2,}/;

interface Keyed {
  key: string;
  text: unknown;
}

/** Tap the steps into their places; the wrong places empty on retry. */
export function Order({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const items = list<Keyed>(beat.data.items);
  const [placed, setPlaced] = useState<string[]>([]);
  const wrong = list<number>(obj(result?.detail).wrong);
  const locked = result?.correct === true;
  // Fixing keeps the steps up to the first wrong place.
  useOnFix(result, wrong, (was) => setPlaced((now) => now.slice(0, Math.min(...was))));

  useEffect(() => {
    setSubmission(placed.length === items.length ? { order: placed } : null);
  }, [placed, items.length, setSubmission]);

  const textOf = (key: string) => t(items.find((item) => item.key === key)?.text);
  const pool = items.filter((item) => !placed.includes(item.key));

  return (
    <>
      <ol className="p-slots p-in d2">
        {items.map((_, place) => {
          const key = placed[place];
          const tone = result && key ? (wrong.includes(place) ? "is-wrong" : "is-right") : "";
          return (
            <li key={place}>
              <button
                type="button"
                className={`p-slot ${key ? "is-filled" : ""} ${tone}`}
                disabled={!key || locked}
                onClick={() => key && setPlaced(placed.filter((k) => k !== key))}
              >
                <span className="p-slot-n">{place + 1}</span>
                {key ? (
                  <span className="p-in">{textOf(key)}</span>
                ) : (
                  <span className="p-slot-empty">{words.placeHere}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="p-pool p-in d3">
        <span className="p-label">{pool.length ? words.available : words.allPlaced}</span>
        <div className="p-chips">
          {pool.map((item) => (
            <button
              key={item.key}
              type="button"
              className="p-chip p-in"
              onClick={() => setPlaced([...placed, item.key])}
            >
              {t(item.text)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Runs `fix` with what was wrong once the learner presses Fix: the sheet's verdict is cleared, and
 * what they got right stays.
 */
function useOnFix<T>(result: BeatProps["result"], wrong: T[], fix: (wrong: T[]) => void) {
  const last = useRef<T[]>([]);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  useEffect(() => {
    if (result && !result.correct) {
      last.current = wrong;
    } else if (!result && last.current.length > 0) {
      fixRef.current(last.current);
      last.current = [];
    }
  }, [result, wrong]);
}

interface CellProps {
  text: string;
  /** The pair's number, or 0 while unpaired. */
  n: number;
  tone: string;
  pressed?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

function MatchCell({ text, n, tone, pressed, disabled, onTap }: CellProps) {
  return (
    <button
      type="button"
      className={`p-cell ${n ? "is-paired" : ""} ${tone}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onTap}
    >
      <span>{text}</span>
      {n ? <span className="p-cell-n p-pop">{n}</span> : null}
    </button>
  );
}

/** Pairs made by tapping a term, then a definition; tapping a paired term undoes its pair. */
function usePairs(locked: boolean) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const tapTerm = (key: string) => {
    if (locked) {
      return;
    }
    if (pairs[key]) {
      const { [key]: _, ...rest } = pairs;
      setPairs(rest);
    }
    setSelected(key);
  };
  const tapDefinition = (key: string) => {
    if (locked || !selected) {
      return;
    }
    const others = Object.fromEntries(Object.entries(pairs).filter(([, d]) => d !== key));
    setPairs({ ...others, [selected]: key });
    setSelected(null);
  };
  return { pairs, setPairs, selected, tapTerm, tapDefinition };
}

/** Tap a term, then what it goes with. */
export function Match({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const terms = list<Keyed>(beat.data.terms);
  const definitions = list<Keyed>(beat.data.definitions);
  const wrong = list<string>(obj(result?.detail).wrong);
  const locked = result?.correct === true;
  const { pairs, setPairs, selected, tapTerm, tapDefinition } = usePairs(locked);
  // Fixing keeps the right pairs and undoes the wrong ones.
  useOnFix(result, wrong, (was) =>
    setPairs((now) =>
      Object.fromEntries(Object.entries(now).filter(([term]) => !was.includes(term))),
    ),
  );

  useEffect(() => {
    setSubmission(Object.keys(pairs).length === terms.length ? { matches: pairs } : null);
  }, [pairs, terms.length, setSubmission]);

  const numberOf = (term: string) => terms.findIndex((x) => x.key === term) + 1;
  const termOfDefinition = (definition: string) =>
    Object.entries(pairs).find(([, d]) => d === definition)?.[0];

  const left = t(beat.data.left_label);
  const right = t(beat.data.right_label);

  return (
    <div className="p-match p-in d2">
      {left || right ? (
        <>
          <span className="p-label">{left}</span>
          <span className="p-label">{right}</span>
        </>
      ) : null}
      <div className="p-match-col">
        {terms.map((term) => (
          <MatchCell
            key={term.key}
            text={t(term.text)}
            n={pairs[term.key] ? numberOf(term.key) : 0}
            tone={result && pairs[term.key] ? toneOf(!wrong.includes(term.key)) : ""}
            pressed={selected === term.key}
            onTap={() => tapTerm(term.key)}
          />
        ))}
      </div>
      <div className="p-match-col">
        {definitions.map((definition) => {
          const term = termOfDefinition(definition.key);
          return (
            <MatchCell
              key={definition.key}
              text={t(definition.text)}
              n={term ? numberOf(term) : 0}
              tone={result && term ? toneOf(!wrong.includes(term)) : ""}
              disabled={locked}
              onTap={() => tapDefinition(definition.key)}
            />
          );
        })}
      </div>
      <p className="p-match-count">
        {fill(words.pairsOf, { n: Object.keys(pairs).length, total: terms.length })}
      </p>
    </div>
  );
}

/** Blanks in a sentence, filled from a word bank or typed. */
export function FillBlank({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const parts = t(beat.data.sentence).split(BLANK);
  const count = Math.max(Number(beat.data.blankCount ?? 0), parts.length - 1);
  const bank = list<unknown>(beat.data.choices).map(t);
  const [answers, setAnswers] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const locked = result?.correct === true;
  const solution = list<unknown>(obj(result?.solution).blanks).map(t);

  useEffect(() => {
    setSubmission(answers.every((a) => a.trim()) ? { answers } : null);
  }, [answers, setSubmission]);

  const put = (word: string) => {
    const at = answers.findIndex((a) => !a);
    if (at >= 0 && !locked) {
      setAnswers(answers.map((a, i) => (i === at ? word : a)));
    }
  };
  const clear = (at: number) => !locked && setAnswers(answers.map((a, i) => (i === at ? "" : a)));
  const tone = result ? (result.correct ? "is-right" : "is-wrong") : "";

  return (
    <>
      <div className="p-stage p-in d2">
        <p className="p-sentence">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < count ? (
                bank.length ? (
                  <button
                    type="button"
                    className={`p-blank ${answers[i] ? "is-filled" : ""} ${tone}`}
                    onClick={() => clear(i)}
                    aria-label={answers[i] || `${i + 1}`}
                  >
                    {answers[i] || "…"}
                  </button>
                ) : (
                  <input
                    className={`p-blank-input ${tone}`}
                    value={answers[i] ?? ""}
                    readOnly={locked}
                    aria-label={`${i + 1}`}
                    onChange={(event) =>
                      setAnswers(answers.map((a, j) => (j === i ? event.target.value : a)))
                    }
                  />
                )
              ) : null}
            </span>
          ))}
        </p>
      </div>
      {bank.length ? (
        <div className="p-chips p-in d3">
          {bank.map((word, i) => (
            <button
              key={i}
              type="button"
              className="p-chip"
              disabled={answers.includes(word)}
              onClick={() => put(word)}
            >
              {word}
            </button>
          ))}
        </div>
      ) : null}
      {solution.length && !result?.correct ? (
        <p className="p-note p-soft">
          <b>{words.seeAnswer}:</b> {solution.join(" · ")}
        </p>
      ) : null}
    </>
  );
}
