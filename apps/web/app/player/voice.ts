import { voicePath } from "@learning-routes/core/voice";
import { useCallback, useEffect, useRef } from "react";

// Saying a phrase aloud: its recording when there is one, the browser's own voice when there is
// not. A phrase found to have no recording is not asked for again while its beat is on screen.

export const canSay = () =>
  typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);

function withBrowserVoice(text: string, lang: string, rate: number, onEnd: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
}

/** A beat's voice: say(text, lang, pace, onEnd), silenced when the beat leaves the screen. */
export function useVoice() {
  const playing = useRef<HTMLAudioElement | null>(null);
  const unrecorded = useRef(new Set<string>());

  const hush = useCallback(() => {
    playing.current?.pause();
    playing.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);
  useEffect(() => hush, [hush]);

  /** Says the phrase at the given pace (1 is natural), and calls onEnd when it is over. */
  const say = useCallback(
    async (text: string, lang: string, rate = 1, onEnd: () => void = () => {}) => {
      hush();
      const path = await voicePath(lang, text).catch(() => null);
      if (path === null || unrecorded.current.has(path)) {
        withBrowserVoice(text, lang, rate, onEnd);
        return;
      }
      const audio = new Audio(path);
      // A recording slows less than a synthetic voice does before it stops sounding like a person.
      audio.playbackRate = rate < 1 ? Math.max(rate, 0.75) : rate;
      audio.onended = onEnd;
      playing.current = audio;
      try {
        await audio.play();
      } catch {
        if (playing.current === audio) {
          playing.current = null;
          unrecorded.current.add(path);
          withBrowserVoice(text, lang, rate, onEnd);
        }
      }
    },
    [hush],
  );
  return say;
}
