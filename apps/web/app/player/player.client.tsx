import type { AnswerResult, PlayView } from "@learning-routes/core/actions/player";
import { PLAYER_TEXT } from "@learning-routes/core/copy/player";
import { PRACTICE_TEXT } from "@learning-routes/core/copy/practice";
import type { LocaleCode } from "@learning-routes/core/locales";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { callAction } from "../api";
import { Beat } from "./beat";
import { firstOpen } from "./first-open";
import { Outline, Sheet, Summary, TopBar, Tutor } from "./parts";
import { Icon, makeCtx, PlayerContext, type Submission, usePlayer } from "./shared";
import "./player.css";
import "./beats.css";
import "./player-v2.css";
import newsreader from "@learning-routes/design-tokens/fonts/Newsreader-latin.woff2?url";

/** The reading face, loaded once, only where lessons are read; the CSS names it with a fallback. */
function useReadingFace() {
  useEffect(() => {
    if (typeof FontFace === "undefined" || document.fonts.check('16px "Newsreader"')) {
      return;
    }
    const face = new FontFace("Newsreader", `url(${newsreader}) format("woff2")`, {
      weight: "400 600",
      display: "swap",
    });
    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => undefined);
  }, []);
}

// The lesson player (Platform STEP 12): one beat at a time, graded on the server, with the creator's
// colour as the one accent. Rendered in the browser only, so its inline styles go through the CSSOM.

interface PlayerProps {
  view: PlayView;
  enrollmentId: string;
  locale: LocaleCode;
  runner: string | null;
}

function useBeats(view: PlayView, enrollmentId: string) {
  const [index, setIndex] = useState(() => firstOpen(view));
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [xp, setXp] = useState({ gained: 0, route: view.xp.route });
  const [firstTry, setFirstTry] = useState(0);
  const beat = view.beats[index];

  const go = useCallback((to: number) => {
    setIndex(to);
    setResult(null);
    setSubmission(null);
    setFailed(false);
    window.scrollTo({ top: 0 });
  }, []);

  const answer = async () => {
    if (!beat || !submission || busy) {
      return null;
    }
    setBusy(true);
    setFailed(false);
    try {
      const answered = await callAction("lesson.answer", {
        enrollmentId,
        blockId: beat.id,
        submission,
      });
      if (!answered.ok) {
        setFailed(true);
        return null;
      }
      const out = answered.output;
      setXp((now) => ({ gained: now.gained + out.xp.gained, route: out.xp.route }));
      if (out.correct === true && out.attempts === 1) {
        setFirstTry((n) => n + 1);
      }
      setResult(out);
      return out;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return {
    index,
    beat,
    go,
    submission,
    setSubmission,
    result,
    setResult,
    busy,
    failed,
    xp,
    firstTry,
    answer,
  };
}

function useFinish(view: PlayView, enrollmentId: string) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Only a saved finish shows the summary; a failed one stays on the last beat to try again.
  const finish = async () => {
    setFailed(false);
    try {
      const answered = await callAction("lesson.finish", { enrollmentId, topic: view.topicNumber });
      if (answered.ok) {
        setMissing(answered.output.missing);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  };
  return { missing, setMissing, failed, finish };
}

/** The beats, the end of the topic, and how one leads to the other. */
function useFlow(view: PlayView, enrollmentId: string) {
  const play = useBeats(view, enrollmentId);
  const end = useFinish(view, enrollmentId);
  const next = () => {
    if (play.index + 1 < view.beats.length) {
      play.go(play.index + 1);
    } else {
      end.finish().catch(() => undefined);
    }
  };
  const primary = usePrimary(play, next);
  useEnterKey(primary);
  const review = () => {
    const at = view.beats.findIndex((b) => end.missing?.includes(b.id));
    end.setMissing(null);
    play.go(Math.max(0, at));
  };
  const failed = play.failed || end.failed;
  return { play, end, next, review, done: end.missing !== null, primary, failed };
}

export function Player({ view, enrollmentId, locale, runner }: PlayerProps) {
  useReadingFace();
  const ctx = useMemo(
    () =>
      makeCtx(locale, view.sourceLocale, PLAYER_TEXT[locale], PRACTICE_TEXT[locale].kinds, runner),
    [locale, view.sourceLocale, runner],
  );
  const { play, end, next, review, done, primary, failed } = useFlow(view, enrollmentId);
  const total = view.beats.length;
  const [tutorOpen, setTutorOpen] = useState(false);
  const exit = `/mis-rutas/${enrollmentId}?tema=${view.topicNumber}`;
  const hrefOf = (n: number) => `/mis-rutas/${enrollmentId}/tema/${n}`;
  const brand: CSSProperties = view.brandColor
    ? ({ "--brand": view.brandColor } as CSSProperties)
    : {};
  const graded = view.beats.filter((b) => b.gradable).length;
  return (
    <PlayerContext.Provider value={ctx}>
      <div className="player" style={brand}>
        <TopBar
          route={ctx.t(view.routeTitle)}
          exit={exit}
          at={done ? total : play.index}
          total={total}
          xp={view.xp.topic + play.xp.gained}
          onTutor={() => setTutorOpen(true)}
        />
        <div className="p-body">
          <Outline view={view} hrefOf={hrefOf} />
          <main className="p-main">
            <div className="p-content" key={done ? "end" : play.beat?.id}>
              {done ? (
                <Summary
                  view={view}
                  xp={play.xp.gained}
                  routeXp={play.xp.route}
                  firstTry={play.firstTry}
                  graded={graded}
                  missing={end.missing?.length ?? 0}
                  nextHref={view.next ? hrefOf(view.next.number) : null}
                  exit={exit}
                  onReview={review}
                />
              ) : play.beat ? (
                <Beat
                  props={{
                    beat: play.beat,
                    result: play.result,
                    setSubmission: play.setSubmission,
                  }}
                  index={play.index}
                  total={total}
                />
              ) : null}
            </div>
            {done || !play.beat || play.result ? null : (
              <Footer primary={primary} failed={failed} />
            )}
            {play.result && !done ? (
              <Sheet
                result={play.result}
                onContinue={next}
                onRetry={play.result.correct === false ? () => play.setResult(null) : null}
              />
            ) : null}
          </main>
          <Tutor
            enrollmentId={enrollmentId}
            topic={view.topicNumber}
            beat={play.index}
            isOpen={tutorOpen}
            onClose={() => setTutorOpen(false)}
          />
        </div>
      </div>
    </PlayerContext.Provider>
  );
}

type Play = ReturnType<typeof useBeats>;

/** Enter does what the bottom button does, unless the focus is on something Enter already uses. */
function useEnterKey(primary: ReturnType<typeof usePrimary>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "Enter" || target.closest("textarea, button, a, input[type=range]")) {
        return;
      }
      if (!primary.disabled) {
        event.preventDefault();
        primary.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

/** The one button at the bottom: check what is asked, or move on. */
function usePrimary(play: Play, next: () => void) {
  const { beat, submission, result, busy } = play;
  const asks = beat ? beat.gradable || beat.gating || beat.kind === "open_answer" : false;
  if (!(beat && asks && !result)) {
    return { label: "continue", disabled: busy, run: next } as const;
  }
  return {
    label: beat.gradable ? "check" : beat.kind === "open_answer" ? "send" : "continue",
    disabled: busy || submission === null,
    run: () => {
      // What is not graded is kept, then the player moves on; a graded answer opens the sheet.
      play
        .answer()
        .then((out) => out && !beat.gradable && next())
        .catch(() => undefined);
    },
  } as const;
}

function Footer({ primary, failed }: { primary: ReturnType<typeof usePrimary>; failed: boolean }) {
  const { words } = usePlayer();
  const label =
    primary.label === "check"
      ? words.check
      : primary.label === "send"
        ? words.sendAnswer
        : words.continue;
  return (
    <footer className="p-foot">
      {failed ? (
        <p className="p-note p-warn" role="alert">
          <Icon name="warn" /> {words.failed}
        </p>
      ) : (
        <p className="p-foot-hint" aria-hidden="true">
          <kbd className="p-kbd">Enter</kbd>
        </p>
      )}
      <button
        type="button"
        className="p-primary p-wide"
        disabled={primary.disabled}
        onClick={() => primary.run()}
      >
        {label}
      </button>
    </footer>
  );
}
