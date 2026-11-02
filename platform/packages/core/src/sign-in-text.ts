import { BRAND, type LocaleCode } from "./locales";

// The sign-in email and confirmation page, in every locale (Platform STEP 2
// review, owner's answers 2 and 5). One set of strings: the email's text and
// HTML, and the page, are built from these. A locale missing a string fails the
// types. No zod, so browser code may import it.

export interface SignInText {
  emailSubject: string;
  emailIntro: string;
  emailAction: string;
  emailExpiry: string;
  emailIgnore: string;
  pageTitle: string;
  pageQuestion: string;
  pageAction: string;
  pageNoLink: string;
}

export const SIGN_IN_TEXT: Record<LocaleCode, SignInText> = {
  es: {
    emailSubject: `Tu enlace para entrar en ${BRAND}`,
    emailIntro: `Usa este enlace para entrar en ${BRAND}.`,
    emailAction: "Entrar",
    emailExpiry: "Funciona una sola vez y caduca en 5 minutos.",
    emailIgnore: "Si no lo pediste, ignora este correo: nadie entra sin el enlace.",
    pageTitle: "Entrar",
    pageQuestion: `¿Entrar en ${BRAND}?`,
    pageAction: "Entrar",
    pageNoLink: "Este enlace no es válido o ya se usó. Pide uno nuevo.",
  },
  en: {
    emailSubject: `Your sign-in link for ${BRAND}`,
    emailIntro: `Use this link to sign in to ${BRAND}.`,
    emailAction: "Sign in",
    emailExpiry: "It works once and expires in 5 minutes.",
    emailIgnore: "If you didn't ask for it, ignore this email: no one gets in without the link.",
    pageTitle: "Sign in",
    pageQuestion: `Sign in to ${BRAND}?`,
    pageAction: "Sign in",
    pageNoLink: "This link is not valid or was already used. Ask for a new one.",
  },
  pt: {
    emailSubject: `Seu link para entrar no ${BRAND}`,
    emailIntro: `Use este link para entrar no ${BRAND}.`,
    emailAction: "Entrar",
    emailExpiry: "Ele funciona uma vez e expira em 5 minutos.",
    emailIgnore: "Se você não pediu, ignore este e-mail: ninguém entra sem o link.",
    pageTitle: "Entrar",
    pageQuestion: `Entrar no ${BRAND}?`,
    pageAction: "Entrar",
    pageNoLink: "Este link não é válido ou já foi usado. Peça um novo.",
  },
  fr: {
    emailSubject: `Votre lien de connexion à ${BRAND}`,
    emailIntro: `Utilisez ce lien pour vous connecter à ${BRAND}.`,
    emailAction: "Se connecter",
    emailExpiry: "Il ne fonctionne qu'une fois et expire dans 5 minutes.",
    emailIgnore:
      "Si vous ne l'avez pas demandé, ignorez cet e-mail : personne n'entre sans le lien.",
    pageTitle: "Connexion",
    pageQuestion: `Se connecter à ${BRAND} ?`,
    pageAction: "Se connecter",
    pageNoLink: "Ce lien n'est pas valide ou a déjà servi. Demandez-en un nouveau.",
  },
  it: {
    emailSubject: `Il tuo link per accedere a ${BRAND}`,
    emailIntro: `Usa questo link per accedere a ${BRAND}.`,
    emailAction: "Accedi",
    emailExpiry: "Funziona una sola volta e scade tra 5 minuti.",
    emailIgnore: "Se non l'hai richiesto, ignora questa email: nessuno entra senza il link.",
    pageTitle: "Accedi",
    pageQuestion: `Accedere a ${BRAND}?`,
    pageAction: "Accedi",
    pageNoLink: "Questo link non è valido o è già stato usato. Richiedine uno nuovo.",
  },
};
