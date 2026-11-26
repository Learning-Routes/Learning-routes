// Recorded voice for the phrases a lesson says aloud (a speaking beat, a conversation's lines).
// A recording is found by what it says: the address is a hash of the language and the words, so
// the player needs nothing in the lesson to point at it, the same phrase is recorded once however
// many lessons use it, and a phrase nobody recorded simply has no file and the browser's own
// voice speaks it.

export const VOICE_PREFIX = "/voz/";

/** The words as they are hashed: one form for "Hi!  Good morning." however it was typed. */
export function voiceText(lang: string, text: string): string {
  return `${lang.trim().toLowerCase()}\n${text.normalize("NFC").trim().replace(/\s+/g, " ")}`;
}

/** Where a phrase's recording lives, on the page's own host. */
export async function voicePath(lang: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(voiceText(lang, text)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${VOICE_PREFIX}${hex}.mp3`;
}

export const VOICE_FILE = /^\/voz\/([a-f0-9]{64})\.mp3$/;

export interface Voiced {
  lang: string;
  text: string;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Every phrase a route's blocks say aloud, each once, in the order a learner meets them. */
export function voicedPhrases(blocks: { kind: string; data: Record<string, unknown> }[]): Voiced[] {
  const seen = new Set<string>();
  const found: Voiced[] = [];
  const add = (lang: string, phrase: string) => {
    const key = voiceText(lang, phrase);
    if (lang !== "" && phrase !== "" && !seen.has(key)) {
      seen.add(key);
      found.push({ lang, text: phrase });
    }
  };
  for (const block of blocks) {
    if (block.kind === "speak") {
      add(text(block.data.lang), text(block.data.phrase));
    }
    const sim =
      block.kind === "sim" ? (block.data.sim as Record<string, unknown> | undefined) : null;
    if (sim?.kind === "roleplay" && Array.isArray(sim.turns)) {
      for (const turn of sim.turns as Record<string, unknown>[]) {
        add(text(sim.lang), text(turn?.line));
      }
    }
  }
  return found;
}
