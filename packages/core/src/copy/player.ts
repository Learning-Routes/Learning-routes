import type { LocaleCode } from "../locales";
import { en } from "./player-en";
import { es } from "./player-es";
import { fr } from "./player-fr";
import { it } from "./player-it";
import { pt } from "./player-pt";
import type { PlayerText } from "./player-text";

// The words of the lesson player (Platform STEP 12), by locale.

export type { PlayerText } from "./player-text";

export const PLAYER_TEXT: Record<LocaleCode, PlayerText> = { es, en, pt, fr, it };

/** Fills {name} slots. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
