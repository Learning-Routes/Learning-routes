import { fill } from "@learning-routes/core/copy/player";
import { useEffect, useRef, useState } from "react";
import { type BeatProps, Icon, list, usePlayer } from "./shared";

// The practice beats (Platform STEP 12): they teach by doing and never gate a topic. What the
// learner does here stays in the browser, except an open answer, which is kept as written.

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

/** A phrase to hear, slower if needed, and to say back; a recording stays on the device. */
export function Speak({ beat }: BeatProps) {
  const { t, words } = usePlayer();
  const phrase = String(beat.data.phrase ?? "");
  const lang = String(beat.data.lang ?? "");
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const say = (rate: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return (
    <div className="p-speak p-in d2">
      <div className="p-stage">
        <p className="p-phrase" lang={lang}>
          {phrase}
        </p>
        {beat.data.translation ? <p className="p-sub">{t(beat.data.translation)}</p> : null}
        {canSpeak ? (
          <div className="p-row">
            <button type="button" className="p-primary p-small" onClick={() => say(1)}>
              <Icon name={speaking ? "pause" : "play"} /> {words.listen}
            </button>
            <button type="button" className="p-secondary p-small" onClick={() => say(0.6)}>
              {words.slower}
            </button>
          </div>
        ) : null}
        {speaking ? (
          <span className="p-wave" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} className={`w${i % 5}`} />
            ))}
          </span>
        ) : null}
      </div>
      <Recorder />
      <p className="p-note p-soft">{beat.data.tip ? t(beat.data.tip) : words.speakHint}</p>
    </div>
  );
}

/** Record yourself and listen back. Nothing leaves the device. */
function Recorder() {
  const { words } = usePlayer();
  const [state, setState] = useState<"idle" | "recording" | "done" | "denied">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (event) => chunks.push(event.data);
      rec.onstop = () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        setUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
        setState("done");
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setState("denied");
    }
  };

  if (!supported || state === "denied") {
    return null;
  }
  return (
    <div className="p-row p-recorder">
      {state === "recording" ? (
        <button type="button" className="p-record is-on" onClick={() => recorder.current?.stop()}>
          <span className="p-rec-dot p-blink" /> {words.stop}
        </button>
      ) : (
        <button type="button" className="p-record" onClick={start}>
          <span className="p-rec-dot" /> {state === "done" ? words.recordAgain : words.record}
        </button>
      )}
      {/* biome-ignore lint/a11y/useMediaCaption: the learner's own voice, recorded a moment ago */}
      {url && state === "done" ? <audio src={url} controls className="p-audio" /> : null}
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
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              const { selectionStart: at, selectionEnd: end } = event.currentTarget;
              setCode(`${code.slice(0, at)}  ${code.slice(end)}`);
            }
          }}
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
          disabled={running || !runner}
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
