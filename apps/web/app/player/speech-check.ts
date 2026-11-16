// Did the learner say the phrase? The browser's speech recognition writes down what it heard; this
// lines those words up with the phrase's, the way a teacher listens: order matters, case and
// punctuation do not, a contraction counts as its long form, and a near miss on one word is a miss on
// that word only. A phrase passes when at least PASS of its words were heard.

export const PASS = 0.8;

const QUOTES = /[’‘`]/g;
const NOT_WORD = /[^\p{L}\p{N}'\s-]/gu;
const HYPHEN = /-/g;
const SPACES = /\s+/;
const EDGE_QUOTES = /^'+|'+$/g;

const LONG: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "you're": ["you", "are"],
  "we're": ["we", "are"],
  "they're": ["they", "are"],
  "he's": ["he", "is"],
  "she's": ["she", "is"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "what's": ["what", "is"],
  "where's": ["where", "is"],
  "there's": ["there", "is"],
  "i'd": ["i", "would"],
  "i'll": ["i", "will"],
  "you'll": ["you", "will"],
  "we'll": ["we", "will"],
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "weren't": ["were", "not"],
  "can't": ["can", "not"],
  "won't": ["will", "not"],
  "i've": ["i", "have"],
  "let's": ["let", "us"],
};

/** The words of a text, lower case, without punctuation, contractions spelled out. */
export function wordsOf(text: string): string[] {
  const out: string[] = [];
  const cleaned = text
    .toLowerCase()
    .replace(QUOTES, "'")
    .replace(NOT_WORD, " ")
    .replace(HYPHEN, " ");
  for (const raw of cleaned.split(SPACES)) {
    const word = raw.replace(EDGE_QUOTES, "");
    if (!word) {
      continue;
    }
    out.push(...(LONG[word] ?? [word]));
  }
  return out;
}

/** The phrase as the learner sees it: each written word, and the words it stands for. */
export function tokensOf(phrase: string): { text: string; words: string[] }[] {
  return phrase
    .split(SPACES)
    .filter(Boolean)
    .map((text) => ({ text, words: wordsOf(text) }));
}

export interface Heard {
  /** For each written word of the phrase, whether it was heard. */
  hit: boolean[];
  /** The share of the phrase's words that were heard, 0 to 1. */
  score: number;
  passed: boolean;
}

/** Lines up what was heard with the phrase (longest common subsequence over words). */
export function compare(phrase: string, heard: string): Heard {
  const tokens = tokensOf(phrase);
  const target = tokens.flatMap((token, i) => token.words.map((word) => ({ word, i })));
  const said = wordsOf(heard);
  const n = target.length;
  const m = said.length;
  // The table is flat: cell (a, b) is at a * (m + 1) + b.
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  const at = (x: number, y: number) => table[x * width + y] ?? 0;
  const same = (x: number, y: number) => target[x]?.word === said[y];
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      table[x * width + y] = same(x, y)
        ? at(x + 1, y + 1) + 1
        : Math.max(at(x + 1, y), at(x, y + 1));
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  for (let x = 0, y = 0; x < n && y < m; ) {
    if (same(x, y)) {
      matched[x] = true;
      x++;
      y++;
    } else if (at(x + 1, y) >= at(x, y + 1)) {
      x++;
    } else {
      y++;
    }
  }
  const hit = tokens.map(
    (token, i) => token.words.length === 0 || target.every((t, k) => t.i !== i || matched[k]),
  );
  const score = n ? matched.filter(Boolean).length / n : 1;
  return { hit, score, passed: score >= PASS };
}

/** The best of the recognizer's guesses for this phrase. */
export function bestOf(phrase: string, guesses: string[]): { heard: string; result: Heard } {
  let best = { heard: guesses[0] ?? "", result: compare(phrase, guesses[0] ?? "") };
  for (const guess of guesses.slice(1)) {
    const result = compare(phrase, guess);
    if (result.score > best.result.score) {
      best = { heard: guess, result };
    }
  }
  return best;
}
