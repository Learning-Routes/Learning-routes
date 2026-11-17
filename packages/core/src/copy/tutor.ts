import type { LocaleCode } from "../locales";

// What the server says when the learner's tutor cannot answer (Platform STEP 20 §A): the day's ten
// questions are used, or no model can answer right now. Plain, and with no blame.

export const TUTOR_TEXT: Record<LocaleCode, { limited: string; unavailable: string }> = {
  es: {
    limited: "Ya hiciste tus 10 preguntas de hoy. Mañana puedes hacer 10 más.",
    unavailable: "El tutor no puede responder ahora. Inténtalo más tarde.",
  },
  en: {
    limited: "You have asked your 10 questions for today. You can ask 10 more tomorrow.",
    unavailable: "The tutor can't answer right now. Try again later.",
  },
  pt: {
    limited: "Você já fez suas 10 perguntas de hoje. Amanhã pode fazer mais 10.",
    unavailable: "O tutor não pode responder agora. Tente mais tarde.",
  },
  fr: {
    limited: "Vous avez posé vos 10 questions du jour. Demain, vous pourrez en poser 10 autres.",
    unavailable: "Le tuteur ne peut pas répondre pour le moment. Réessayez plus tard.",
  },
  it: {
    limited: "Hai già fatto le tue 10 domande di oggi. Domani potrai farne altre 10.",
    unavailable: "Il tutor non può rispondere ora. Riprova più tardi.",
  },
};
