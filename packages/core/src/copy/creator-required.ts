import { BRAND, type LocaleCode } from "../locales";

// What the server says to someone who does not teach in a space and tries to build there
// (Platform STEP 14). Teaching costs money and payments are not open yet; prices are never named.

export const CREATOR_REQUIRED: Record<LocaleCode, string> = {
  es: `Para crear en ${BRAND} necesitas ser creador de un espacio, y eso requiere cargar saldo antes.`,
  en: `To build on ${BRAND} you need to be a creator in a space, and that takes a loaded balance first.`,
  pt: `Para criar no ${BRAND} você precisa ser criador de um espaço, e isso exige carregar saldo antes.`,
  fr: `Pour créer sur ${BRAND}, il faut être créateur d’un espace, et cela demande d’abord de charger un solde.`,
  it: `Per creare su ${BRAND} devi essere creatore di uno spazio, e serve prima caricare un saldo.`,
};
