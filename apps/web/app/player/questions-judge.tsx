import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { type BeatProps, Icon, list, obj, toneOf, usePlayer } from "./shared";

// Questions of judging (Platform STEP 12): true or false, an estimate, a point on a drawing.

interface TfListProps {
  statements: { text: unknown }[];
  answers: boolean[];
  result: BeatProps["result"];
  onFlip: (i: number) => void;
  onRestart: () => void;
}

/** The answers given; once checked, each says if it was right, and a wrong one can be flipped. */
function TfList({ statements, answers, result, onFlip, onRestart }: TfListProps) {
  const { t, words } = usePlayer();
  const [marks, setMarks] = useState<{ right: boolean; why: unknown }[]>([]);
  useEffect(() => {
    if (result) {
      setMarks(list<{ right: boolean; why: unknown }>(result.detail));
    }
  }, [result]);
  const flip = (i: number) => {
    onFlip(i);
    setMarks((now) => now.map((m, j) => (j === i ? { right: true, why: null } : m)));
  };
  return (
    <ol className="p-tf-list p-in d2">
      {statements.map((statement, i) => {
        const mark = marks[i];
        return (
          <li key={i}>
            <button
              type="button"
              className={`p-tf-row ${mark && !(result === null && mark.right) ? toneOf(mark.right) : ""}`}
              disabled={result !== null}
              onClick={() => flip(i)}
            >
              <span className="p-tf-mark">{answers[i] ? words.trueLabel : words.falseLabel}</span>
              <span className="p-tf-text">
                {t(statement.text)}
                {mark && !mark.right && mark.why ? <small>{t(mark.why)}</small> : null}
              </span>
            </button>
          </li>
        );
      })}
      {result ? null : (
        <li>
          <button type="button" className="p-link" onClick={onRestart}>
            <Icon name="back" /> {words.back}
          </button>
        </li>
      )}
    </ol>
  );
}

/** One statement at a time; the cards fly to the side the learner chose. */
export function TrueFalse({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const statements = list<{ text: unknown }>(beat.data.statements);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [leaving, setLeaving] = useState<"l" | "r" | null>(null);
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
      <TfList
        statements={statements}
        answers={answers}
        result={result}
        onFlip={(i) => setAnswers((now) => now.map((a, j) => (j === i ? !a : a)))}
        onRestart={() => setAnswers([])}
      />
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
