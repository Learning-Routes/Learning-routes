import { fill } from "@learning-routes/core/copy/player";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { BeatMarkdown, type BeatProps, Icon, list, obj, toneOf, usePlayer } from "./shared";

// The question beats (Platform STEP 12): each keeps what the learner chose, hands the player a
// complete answer, and colours itself from the server's verdict. None of them knows the answer.

const BLANK = /_{2,}/;

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
      {solution.length ? (
        <p className="p-note p-soft">
          <b>{words.seeAnswer}:</b> {solution.join(" · ")}
        </p>
      ) : null}
    </>
  );
}

/** One statement at a time; the cards fly to the side the learner chose. */
export function TrueFalse({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const statements = list<{ text: unknown }>(beat.data.statements);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [leaving, setLeaving] = useState<"l" | "r" | null>(null);
  const detail = list<{ right: boolean; answer: boolean; why: unknown }>(result?.detail);
  const done = answers.length >= statements.length;

  useEffect(() => {
    setSubmission(done ? { answers } : null);
  }, [answers, done, setSubmission]);

  const answer = (value: boolean) => {
    if (leaving || done) {
      return;
    }
    setLeaving(value ? "r" : "l");
    window.setTimeout(() => {
      setAnswers((now) => [...now, value]);
      setLeaving(null);
    }, 300);
  };

  if (done) {
    return (
      <ol className="p-tf-list p-in d2">
        {statements.map((statement, i) => {
          const d = detail[i];
          return (
            <li key={i} className={`p-tf-row ${d ? toneOf(d.right) : ""}`}>
              <span className="p-tf-mark">{answers[i] ? words.trueLabel : words.falseLabel}</span>
              <span className="p-tf-text">
                {t(statement.text)}
                {d && !d.right && d.why ? <small>{t(d.why)}</small> : null}
              </span>
            </li>
          );
        })}
        {!result ? (
          <li>
            <button type="button" className="p-link" onClick={() => setAnswers([])}>
              <Icon name="back" /> {words.back}
            </button>
          </li>
        ) : null}
      </ol>
    );
  }
  const card = statements[answers.length];
  return (
    <div className="p-tf p-in d2">
      <div className="p-tf-stack">
        <div className="p-tf-under" aria-hidden="true" />
        <div
          className={`p-tf-card ${leaving === "r" ? "p-fly-r" : leaving === "l" ? "p-fly-l" : "p-in"}`}
          key={answers.length}
        >
          <span className="p-label">
            {answers.length + 1} / {statements.length}
          </span>
          <p>{t(card?.text)}</p>
        </div>
      </div>
      <div className="p-tf-buttons">
        <button
          type="button"
          className="p-round p-round-no"
          onClick={() => answer(false)}
          aria-label={words.falseLabel}
        >
          <Icon name="x" size={22} />
          <span>{words.falseLabel}</span>
        </button>
        <button
          type="button"
          className="p-round p-round-yes"
          onClick={() => answer(true)}
          aria-label={words.trueLabel}
        >
          <Icon name="check" size={24} />
          <span>{words.trueLabel}</span>
        </button>
      </div>
    </div>
  );
}

/** A slider with anchors; the right range shows once graded. */
export function Estimate({ beat, result, setSubmission }: BeatProps) {
  const { t, words, locale } = usePlayer();
  const min = Number(beat.data.min ?? 0);
  const max = Number(beat.data.max ?? 100);
  const step = Number(beat.data.step ?? 1);
  const unit = typeof beat.data.unit === "string" ? beat.data.unit : "";
  const [value, setValue] = useState((min + max) / 2);
  const solution = obj(result?.solution);
  const decimals = step < 1 ? Math.min(3, String(step).split(".")[1]?.length ?? 1) : 0;
  const format = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const band: CSSProperties | null =
    typeof solution.min === "number" && typeof solution.max === "number"
      ? {
          left: `${((solution.min - min) / (max - min)) * 100}%`,
          width: `${((solution.max - solution.min) / (max - min)) * 100}%`,
        }
      : null;

  useEffect(() => {
    setSubmission({ value });
  }, [value, setSubmission]);

  return (
    <>
      <div className="p-stage p-in d2">
        <span className="p-label">{words.yourEstimate}</span>
        <p className={`p-estimate ${result ? toneOf(result.correct) : ""}`}>
          {format(value)}
          {unit ? <small> {unit}</small> : null}
        </p>
        <div className="p-range-wrap">
          {band ? <span className="p-band p-pop" style={band} /> : null}
          <input
            className="p-range"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={result?.correct === true}
            aria-label={words.yourEstimate}
            aria-valuetext={`${format(value)} ${unit}`}
            onChange={(event) => setValue(Number(event.target.value))}
          />
        </div>
        <div className="p-range-ends">
          <span>{format(min)}</span>
          <span>{format(max)}</span>
        </div>
      </div>
      {list<{ value: number; label: unknown }>(beat.data.anchors).length ? (
        <div className="p-anchors p-in d3">
          {list<{ value: number; label: unknown }>(beat.data.anchors).map((anchor, i) => (
            <div key={i}>
              <b>{format(anchor.value)}</b>
              <span>{t(anchor.label)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

interface SpotProps {
  spot: { x: number; y: number; label: unknown };
  index: number;
  picked: boolean;
  result: BeatProps["result"];
  isSolution: boolean;
  onPick: () => void;
}

function Spot({ spot, index, picked, result, isSolution, onPick }: SpotProps) {
  const { t } = usePlayer();
  const right = Boolean(result && (picked ? result.correct : isSolution));
  const wrongPick = Boolean(result && picked && !result.correct);
  const marks = [picked ? "is-picked" : "", right ? "is-right" : "", wrongPick ? "is-wrong" : ""];
  return (
    <button
      type="button"
      className={`p-spot ${marks.join(" ")}`}
      style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
      aria-label={result ? t(spot.label) : `${index + 1}`}
      aria-pressed={picked}
      onClick={onPick}
    >
      {!(result || picked) ? <span className="p-spot-pulse p-pulse" /> : null}
      <span className="p-spot-dot" />
      {right || wrongPick ? <span className="p-spot-label p-pop">{t(spot.label)}</span> : null}
    </button>
  );
}

/** Points on a drawing; their names show once graded. */
export function Hotspot({
  beat,
  result,
  setSubmission,
  diagram,
}: BeatProps & { diagram?: ReactNode }) {
  const { t, words } = usePlayer();
  const spots = list<{ x: number; y: number; label: unknown }>(beat.data.spots);
  const [pick, setPick] = useState<number | null>(null);
  const solution = obj(result?.solution).spot;
  const image = typeof beat.data.image_url === "string" ? beat.data.image_url : null;

  const choose = (index: number) => {
    if (result?.correct) {
      return;
    }
    setPick(index);
    setSubmission({ spot: index });
  };

  return (
    <div className="p-hotspot p-in d2">
      <div className="p-hotspot-art">
        {image ? <img src={image} alt={t(beat.data.alt_text)} /> : diagram}
        {spots.map((spot, index) => (
          <Spot
            key={index}
            spot={spot}
            index={index}
            picked={pick === index}
            result={result}
            isSolution={solution === index}
            onPick={() => choose(index)}
          />
        ))}
      </div>
      <p className="p-sub">{words.tapAPoint}</p>
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
