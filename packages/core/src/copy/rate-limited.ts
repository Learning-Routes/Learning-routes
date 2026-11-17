import type { LocaleCode } from "../locales";

// What the server says when someone writes in the community faster than it allows (Platform
// STEP 17): ten posts, thirty replies and five reports an hour. Plain, and with no blame.

export const RATE_LIMITED: Record<LocaleCode, string> = {
  es: "Escribiste mucho en poco tiempo. Espera un rato y vuelve a intentarlo.",
  en: "You have written a lot in a short time. Wait a while and try again.",
  pt: "Você escreveu muito em pouco tempo. Espere um pouco e tente de novo.",
  fr: "Vous avez beaucoup écrit en peu de temps. Attendez un moment et réessayez.",
  it: "Hai scritto molto in poco tempo. Aspetta un po' e riprova.",
};
