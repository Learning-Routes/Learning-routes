import { fill } from "@learning-routes/core/copy/player";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type BeatProps, Icon, usePlayer } from "./shared";
import { bestOf, type Heard, tokensOf } from "./speech-check";
import { canSay, useVoice } from "./voice";

// A speaking beat (Platform STEP 13): hear the phrase, say it, and see which words were heard.

/** A phrase to hear, slower if needed, and to say back; the browser listens and marks each word. */
export function Speak({ beat }: BeatProps) {
  const { t, words } = usePlayer();
  const phrase = String(beat.data.phrase ?? "");
  const lang = String(beat.data.lang ?? "");
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = canSay();
  const check = useSpeechCheck(phrase, lang);
  const say = useVoice();

  const listen = (rate: number) => {
    setSpeaking(true);
    void say(phrase, lang, rate, () => setSpeaking(false));
  };

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
            <button type="button" className="p-secondary p-small" onClick={() => listen(1)}>
              <Icon name={speaking ? "pause" : "play"} /> {words.listen}
            </button>
            <button type="button" className="p-secondary p-small" onClick={() => listen(0.6)}>
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
