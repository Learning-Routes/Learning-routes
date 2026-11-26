import type { LocaleCode } from "../locales";

// The tutor's panel in the lesson player (Platform STEP 20 §A). Its own file: the panel loads
// after the lesson does, and its words come with it.

export interface TutorPanelText {
  hello: string;
  placeholder: string;
  send: string;
  close: string;
  /** Questions one tap away, sent as written. */
  starters: [string, string, string];
  perDay: string;
  failed: string;
  thinking: string;
}

export const TUTOR_PANEL_TEXT: Record<LocaleCode, TutorPanelText> = {
  es: {
    hello: "Pregúntame lo que no quedó claro de este paso. Te doy pistas, no la respuesta.",
    placeholder: "Escribe tu pregunta…",
    send: "Enviar",
    close: "Cerrar el tutor",
    starters: ["Dame una pista", "Explícamelo de otra forma", "Dame otro ejemplo"],
    perDay: "10 preguntas al día",
    failed: "No llegó la respuesta. Revisa tu conexión e inténtalo otra vez.",
    thinking: "Pensando…",
  },
  en: {
    hello: "Ask me what was not clear in this step. I give hints, not the answer.",
    placeholder: "Write your question…",
    send: "Send",
    close: "Close the tutor",
    starters: ["Give me a hint", "Explain it another way", "Give me another example"],
    perDay: "10 questions a day",
    failed: "The answer did not arrive. Check your connection and try again.",
    thinking: "Thinking…",
  },
  pt: {
    hello: "Pergunte o que não ficou claro neste passo. Dou pistas, não a resposta.",
    placeholder: "Escreva sua pergunta…",
    send: "Enviar",
    close: "Fechar o tutor",
    starters: ["Me dê uma pista", "Explique de outro jeito", "Me dê outro exemplo"],
    perDay: "10 perguntas por dia",
    failed: "A resposta não chegou. Verifique sua conexão e tente de novo.",
    thinking: "Pensando…",
  },
  fr: {
    hello:
      "Demandez-moi ce qui n’est pas clair dans cette étape. Je donne des indices, pas la réponse.",
    placeholder: "Écrivez votre question…",
    send: "Envoyer",
    close: "Fermer le tuteur",
    starters: ["Donne-moi un indice", "Explique-le autrement", "Donne-moi un autre exemple"],
    perDay: "10 questions par jour",
    failed: "La réponse n’est pas arrivée. Vérifiez votre connexion et réessayez.",
    thinking: "Je réfléchis…",
  },
  it: {
    hello: "Chiedimi cosa non è chiaro in questo passo. Do indizi, non la risposta.",
    placeholder: "Scrivi la tua domanda…",
    send: "Invia",
    close: "Chiudi il tutor",
    starters: ["Dammi un indizio", "Spiegamelo in un altro modo", "Dammi un altro esempio"],
    perDay: "10 domande al giorno",
    failed: "La risposta non è arrivata. Controlla la connessione e riprova.",
    thinking: "Sto pensando…",
  },
};
