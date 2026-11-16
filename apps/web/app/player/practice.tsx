import { fill } from "@learning-routes/core/copy/player";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type BeatProps, Icon, list, usePlayer } from "./shared";
import { bestOf, type Heard, tokensOf } from "./speech-check";

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

/** A phrase to hear, slower if needed, and to say back; the browser listens and marks each word. */
export function Speak({ beat }: BeatProps) {
  const { t, words } = usePlayer();
  const phrase = String(beat.data.phrase ?? "");
  const lang = String(beat.data.lang ?? "");
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const check = useSpeechCheck(phrase, lang);

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
      <PhraseStage
        phrase={phrase}
        lang={lang}
        result={check.result}
        said={check.state === "right"}
        translation={beat.data.translation ? t(beat.data.translation) : ""}
      >
        {canSpeak ? (
          <div className="p-row">
            <button type="button" className="p-secondary p-small" onClick={() => say(1)}>
              <Icon name={speaking ? "pause" : "play"} /> {words.listen}
            </button>
            <button type="button" className="p-secondary p-small" onClick={() => say(0.6)}>
              {words.slower}
            </button>
          </div>
        ) : null}
      </PhraseStage>
      <MicPanel check={check} />
      <p className="p-note p-soft">
        {beat.data.tip ? plain(t(beat.data.tip)) : words.speakHint}
        {check.supported ? ` ${words.recognitionNote}` : ""}
      </p>
    </div>
  );
}

/** The phrase, each word green once heard and grey with a wave when missed. */
function PhraseStage({
  phrase,
  lang,
  result,
  said,
  translation,
  children,
}: {
  phrase: string;
  lang: string;
  result: Heard | null;
  said: boolean;
  translation: string;
  children: ReactNode;
}) {
  const tone = (i: number) => (result ? (result.hit[i] ? "is-heard" : "is-missed") : "");
  return (
    <div className={`p-stage ${said ? "is-said" : ""}`}>
      <p className="p-phrase" lang={lang}>
        {tokensOf(phrase).map((token, i) => (
          <span key={`${i}-${token.text}`} className={tone(i)}>
            {token.text}{" "}
          </span>
        ))}
      </p>
      {translation ? <p className="p-sub">{translation}</p> : null}
      {children}
    </div>
  );
}

const EMPHASIS = /[*_]{1,2}([^*_]+)[*_]{1,2}/g;

/** A short tip is plain text here: Markdown emphasis keeps its words and drops its marks. */
const plain = (text: string) => text.replace(EMPHASIS, "$1");

/** The one microphone button, and what the browser heard. */
function MicPanel({ check }: { check: ReturnType<typeof useSpeechCheck> }) {
  const { words } = usePlayer();
  if (!check.supported) {
    return <p className="p-note p-soft">{words.noRecognition}</p>;
  }
  const on = check.state === "listening";
  return (
    <div className="p-mic-row">
      <button
        type="button"
        className={`p-mic ${on ? "is-on" : ""}`}
        onClick={on ? check.stop : check.start}
        aria-pressed={on}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
        </svg>
        <span>{on ? words.listening : words.tapToSpeak}</span>
      </button>
      <SpeechVerdict state={check.state} heard={check.heard} />
    </div>
  );
}

function SpeechVerdict({ state, heard }: { state: SpeechState; heard: string }) {
  const { words } = usePlayer();
  if (state === "right") {
    return (
      <p className="p-said is-good" role="status">
        <Icon name="check" size={16} /> {words.saidRight}
      </p>
    );
  }
  if (state === "almost") {
    return (
      <p className="p-said is-close" role="status">
        {words.saidAlmost}
        {heard ? <span>{fill(words.heardAs, { heard })}</span> : null}
      </p>
    );
  }
  if (state === "nothing") {
    return (
      <p className="p-said is-close" role="status">
        {words.heardNothing}
      </p>
    );
  }
  return null;
}

type SpeechState = "idle" | "listening" | "right" | "almost" | "nothing";

interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognizerClass(): (new () => Recognizer) | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as new () => Recognizer) ?? null;
}

/** The browser's own speech recognition, one utterance at a time, graded word by word. */
function useSpeechCheck(phrase: string, lang: string) {
  const [state, setState] = useState<SpeechState>("idle");
  const [result, setResult] = useState<Heard | null>(null);
  const [heard, setHeard] = useState("");
  const live = useRef<Recognizer | null>(null);
  const Klass = recognizerClass();

  useEffect(() => () => live.current?.abort(), []);

  const start = () => {
    if (!Klass) {
      return;
    }
    live.current?.abort();
    const rec = new Klass();
    rec.lang = lang || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 5;
    let got = false;
    rec.onresult = (event) => {
      const guesses: string[] = [];
      for (let r = 0; r < event.results.length; r++) {
        for (const alternative of Array.from(event.results[r] ?? [])) {
          guesses.push(alternative.transcript);
        }
      }
      if (!guesses.length) {
        return;
      }
      got = true;
      const best = bestOf(phrase, guesses);
      setHeard(best.heard.trim());
      setResult(best.result);
      setState(best.result.passed ? "right" : "almost");
    };
    rec.onerror = () => undefined;
    rec.onend = () => {
      live.current = null;
      if (!got) {
        setState("nothing");
      }
    };
    live.current = rec;
    setState("listening");
    try {
      rec.start();
    } catch {
      setState("nothing");
    }
  };

  const stop = () => live.current?.stop();
  return { supported: Klass !== null, state, result, heard, start, stop };
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
