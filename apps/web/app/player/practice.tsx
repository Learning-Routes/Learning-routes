import { fill } from "@learning-routes/core/copy/player";
import { useEffect, useRef, useState } from "react";
import { type BeatProps, Icon, list, usePlayer } from "./shared";

// The practice beats (Platform STEP 12): they teach by doing and never gate a topic. What the
// learner does here stays in the browser, except an open answer, sent to mark the beat done.

/** A solved problem, one step at a time, then "now you". */
export function WorkedExample({ beat }: BeatProps) {
  const { t, words } = usePlayer();
  const steps = list<{ label: unknown; work: string; why: unknown }>(beat.data.steps);
  const [shown, setShown] = useState(1);
  return (
    <div className="p-steps p-in d2">
      {steps.slice(0, shown).map((step, i) => (
        <div key={i} className={`p-step ${i === shown - 1 ? "p-in" : ""}`}>
          <span className="p-step-n">{i + 1}</span>
          <div>
            <span className="p-label">{t(step.label)}</span>
            <code className="p-work">{step.work}</code>
            {step.why ? <p className="p-sub">{t(step.why)}</p> : null}
          </div>
        </div>
      ))}
      {shown < steps.length ? (
        <button type="button" className="p-secondary" onClick={() => setShown(shown + 1)}>
          {fill(words.showStep, { n: shown + 1 })}
        </button>
      ) : null}
    </div>
  );
}

interface TestResult {
  call: string;
  expected: string;
  got: string;
  pass: boolean;
}

/**
 * Code with tests, run on the content host in its own opaque box (a sandboxed frame, a worker and
 * a time limit), never in the page that holds the learner's session.
 */
export function CodeCheck({ beat }: BeatProps) {
  const { t, words, runner } = usePlayer();
  const tests = list<{ call: string; expected: string }>(beat.data.tests);
  const [code, setCode] = useState(String(beat.data.starter ?? ""));
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // A message sent before the runner has loaded is lost, so Run waits for it.
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "results") {
        return;
      }
      setResults(list<TestResult>(event.data.results));
      setRunning(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const run = () => {
    setRunning(true);
    // The box has an opaque origin, so no target origin names it; it holds nothing secret.
    frame.current?.contentWindow?.postMessage({ type: "run", code, tests }, "*");
  };
  const passed = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div className="p-code p-in d2">
      <div className="p-editor">
        <div className="p-editor-bar">
          <span>JavaScript</span>
          {results ? (
            <span className={passed === tests.length ? "is-right" : "is-wrong"}>
              {fill(words.testsOf, { n: passed, total: tests.length })}
            </span>
          ) : null}
        </div>
        <textarea
          className="p-code-input"
          value={code}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="JavaScript"
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <ul className="p-tests">
        {tests.map((test, i) => {
          const r = results?.[i];
          return (
            <li key={i} className={r ? (r.pass ? "is-right" : "is-wrong") : ""}>
              <Icon name={r ? (r.pass ? "check" : "x") : "arrow"} />
              <code>{test.call}</code>
              <span>→ {test.expected}</span>
              {r && !r.pass ? <small>{r.got}</small> : null}
            </li>
          );
        })}
      </ul>
      <div className="p-row">
        <button
          type="button"
          className="p-primary p-small"
          disabled={running || !ready}
          onClick={run}
        >
          <Icon name="play" /> {words.runTests}
        </button>
        {beat.data.hint ? (
          <button type="button" className="p-link" onClick={() => setShowHint(!showHint)}>
            <Icon name="bulb" /> {showHint ? words.hideHint : words.hint}
          </button>
        ) : null}
      </div>
      {showHint ? <p className="p-note p-soft p-in">{t(beat.data.hint)}</p> : null}
      {runner ? (
        <iframe
          ref={frame}
          src={runner}
          title="runner"
          sandbox="allow-scripts"
          className="p-runner"
          onLoad={() => setReady(true)}
        />
      ) : null}
    </div>
  );
}

/** A written answer; the rubric is how the learner checks it. */
export function OpenAnswer({ beat, result, setSubmission }: BeatProps) {
  const { t, words } = usePlayer();
  const rubric = list<unknown>(beat.data.rubric);
  const [text, setText] = useState("");
  useEffect(() => {
    setSubmission(text.trim().length >= 3 ? { text: text.slice(0, 4000) } : null);
  }, [text, setSubmission]);
  return (
    <div className="p-open p-in d2">
      <textarea
        className="p-textarea"
        value={text}
        maxLength={4000}
        rows={6}
        readOnly={result !== null}
        aria-label={words.yourAnswer}
        placeholder={words.yourAnswer}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={`p-rubric ${result ? "p-in" : ""}`}>
        <span className="p-label">{words.selfCheck}</span>
        <ul>
          {rubric.map((point, i) => (
            <li key={i}>
              <Icon name="check" /> {t(point)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
