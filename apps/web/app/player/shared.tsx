import type { AnswerResult, PlayBeat } from "@learning-routes/core/actions/player";
import type { MdNode } from "@learning-routes/core/content/markdown";
import type { PlayerText } from "@learning-routes/core/copy/player";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { createContext, type ReactNode, useContext } from "react";
import { Markdown } from "../app-pages/markdown-view";
import { inLocale } from "../storefront/words";

// What every beat of the player is given (Platform STEP 12).

export interface PlayerCtx {
  locale: LocaleCode;
  source: string;
  words: PlayerText;
  /** What each kind of beat, and each simulator, is called. */
  kinds: Record<string, string>;
  /** A localized text in the learner's language. */
  t: (text: unknown) => string;
  /** The content host's code runner, or null where there is none. */
  runner: string | null;
}

export const PlayerContext = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer outside the player");
  }
  return ctx;
}

export function makeCtx(
  locale: LocaleCode,
  source: string,
  words: PlayerText,
  kinds: Record<string, string>,
  runner: string | null,
): PlayerCtx {
  return {
    locale,
    source,
    words,
    kinds,
    runner,
    t: (text) => inLocale(text as LocalizedText | null | undefined, locale, source),
  };
}

export type Submission = Record<string, unknown>;

/** What a question beat is given: the beat, the last graded answer, and where its answer goes. */
export interface BeatProps {
  beat: PlayBeat;
  /** The server's verdict on the last answer, or null while the learner is still answering. */
  result: AnswerResult | null;
  /** The answer to send when the learner presses Check, or null while it is not complete. */
  setSubmission: (submission: Submission | null) => void;
}

/** A Markdown field of a beat, in the learner's language. */
export function BeatMarkdown({ beat, field }: { beat: PlayBeat; field: keyof PlayBeat["md"] }) {
  const { locale, source } = usePlayer();
  const trees = beat.md[field];
  const nodes: MdNode[] | undefined =
    trees?.[locale] ?? trees?.[source] ?? Object.values(trees ?? {})[0];
  return nodes ? (
    <div className="p-prose">
      <Markdown nodes={nodes} />
    </div>
  ) : null;
}

export const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
export const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Small stroke icons, drawn in currentColor. */
export function Icon({
  name,
  size = 16,
}: {
  name: "close" | "check" | "x" | "chat" | "play" | "pause" | "bulb" | "warn" | "arrow" | "back";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    close: <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.4" strokeLinecap="round" />,
    check: (
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    x: <path d="M6 6l12 12M18 6L6 18" strokeWidth="3.2" strokeLinecap="round" />,
    chat: (
      <>
        <path
          d="M5 18.5V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9z"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M9 9.5h6M9 12.5h3.5" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
    pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
    bulb: (
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    ),
    warn: (
      <>
        <path d="M12 3l9 16H3z" fill="none" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 10v4M12 17h0" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    arrow: (
      <path
        d="M5 12h13M13 6l6 6-6 6"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    back: (
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor">
      {paths[name]}
    </svg>
  );
}

/** Which tone an item takes once graded. */
export function toneOf(right: boolean | null | undefined): string {
  if (right === true) {
    return "is-right";
  }
  return right === false ? "is-wrong" : "";
}
