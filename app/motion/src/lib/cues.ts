// The voice leads and the picture follows, and this is the only place that
// decides when. Pure on purpose: no Motion Canvas imports, so node can run it
// directly (see test/javascript/motion_cues_test.rb), the same way
// app/javascript/lib/journey_layout.js is tested.
export type Word = {text: string; start: number; end: number};

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

let asked = 0;
let missed = 0;

// Searches FORWARD from `from` so a word the narration repeats resolves in the
// order it is spoken, not always to the first occurrence. Returns null on a
// miss, and the caller falls back to that beat's fixed duration.
//
// A punctuation-only token (e.g. "?" or ".") normalises to an empty needle —
// that is not a word a voice could ever say, so it is not a cue at all, and
// is returned as null WITHOUT touching asked/missed. A real token that is
// simply absent from `words` (or `words` is empty/missing) IS a genuine miss
// and still counts, so `cueStats()` reports the true fallback rate.
export function cueFor(text: string, words: Word[] | null | undefined, from = 0): number | null {
  const needle = norm(text);
  if (!needle) return null;
  asked++;
  if (!words || words.length === 0) { missed++; return null; }
  for (let i = Math.max(0, from); i < words.length; i++) {
    if (norm(words[i].text) === needle) return words[i].start;
  }
  missed++;
  return null;
}

export function cueStats(): {asked: number; missed: number} { return {asked, missed}; }
export function resetCueStats(): void { asked = 0; missed = 0; }

// Waits on the SCENE clock until absolute second `t`. Never waits backwards:
// a cue already passed (drift, a seek) resolves immediately rather than hanging.
export function remainingUntil(t: number, now: number): number {
  return Math.max(0, t - now);
}
