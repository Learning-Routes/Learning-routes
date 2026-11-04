import type { LocaleCode } from "../locales";

// The words of a topic's screen (docs/design/reference/vision/pages.html, "Un tema"). Data only.
// Spanish is the source; a locale missing a string fails the types.

export interface LessonText {
  /** {module} is the module's number, {topic} the topic's place in it, {total} how many it has. */
  whereAmI: string;
  exit: string;
  question: string;
  check: string;
  pickOne: string;
  right: string;
  wrong: string;
  topicDone: string;
  /** {n} is the next topic's number, {title} its title. */
  nextIs: string;
  nextTopic: string;
  routeDone: string;
  /** Until Platform STEP 8 saves progress. */
  notSaved: string;
  lockedTitle: string;
  lockedBody: string;
  empty: string;
}

export const LESSON_TEXT: Record<LocaleCode, LessonText> = {
  es: {
    whereAmI: "Módulo {module}, tema {topic} de {total}",
    exit: "Salir",
    question: "Pregunta",
    check: "Comprobar",
    pickOne: "Elige una respuesta para comprobarla.",
    right: "Bien.",
    wrong: "Todavía no. Prueba con otra.",
    topicDone: "Tema hecho.",
    nextIs: "Sigue el tema {n}: {title}.",
    nextTopic: "Siguiente tema",
    routeDone: "Era el último tema de esta ruta.",
    notSaved: "Por ahora tu avance no se guarda.",
    lockedTitle: "Este tema es de la ruta completa",
    lockedBody: "El primer módulo es gratis. Muy pronto podrás pagar la ruta para seguir.",
    empty: "Este tema todavía no tiene contenido.",
  },
  en: {
    whereAmI: "Module {module}, topic {topic} of {total}",
    exit: "Exit",
    question: "Question",
    check: "Check",
    pickOne: "Choose an answer to check it.",
    right: "Right.",
    wrong: "Not yet. Try another one.",
    topicDone: "Topic done.",
    nextIs: "Next is topic {n}: {title}.",
    nextTopic: "Next topic",
    routeDone: "That was the last topic on this route.",
    notSaved: "Your progress isn't saved yet.",
    lockedTitle: "This topic is part of the full route",
    lockedBody: "The first module is free. You'll soon be able to pay for the route to carry on.",
    empty: "This topic has no content yet.",
  },
  pt: {
    // Pending native review.
    whereAmI: "Módulo {module}, tema {topic} de {total}",
    exit: "Sair",
    question: "Pergunta",
    check: "Verificar",
    pickOne: "Escolha uma resposta para verificá-la.",
    right: "Isso.",
    wrong: "Ainda não. Tente outra.",
    topicDone: "Tema concluído.",
    nextIs: "A seguir, o tema {n}: {title}.",
    nextTopic: "Próximo tema",
    routeDone: "Este era o último tema desta rota.",
    notSaved: "Por enquanto seu progresso não é salvo.",
    lockedTitle: "Este tema faz parte da rota completa",
    lockedBody: "O primeiro módulo é grátis. Em breve você poderá pagar a rota para continuar.",
    empty: "Este tema ainda não tem conteúdo.",
  },
  fr: {
    // Pending native review.
    whereAmI: "Module {module}, sujet {topic} sur {total}",
    exit: "Quitter",
    question: "Question",
    check: "Vérifier",
    pickOne: "Choisissez une réponse pour la vérifier.",
    right: "C'est ça.",
    wrong: "Pas encore. Essayez-en une autre.",
    topicDone: "Sujet terminé.",
    nextIs: "Ensuite, le sujet {n} : {title}.",
    nextTopic: "Sujet suivant",
    routeDone: "C'était le dernier sujet de ce parcours.",
    notSaved: "Votre progression n'est pas encore enregistrée.",
    lockedTitle: "Ce sujet fait partie du parcours complet",
    lockedBody:
      "Le premier module est gratuit. Vous pourrez bientôt payer le parcours pour continuer.",
    empty: "Ce sujet n'a pas encore de contenu.",
  },
  it: {
    // Pending native review.
    whereAmI: "Modulo {module}, argomento {topic} di {total}",
    exit: "Esci",
    question: "Domanda",
    check: "Verifica",
    pickOne: "Scegli una risposta per verificarla.",
    right: "Esatto.",
    wrong: "Non ancora. Provane un'altra.",
    topicDone: "Argomento completato.",
    nextIs: "Poi c'è l'argomento {n}: {title}.",
    nextTopic: "Argomento successivo",
    routeDone: "Era l'ultimo argomento di questo percorso.",
    notSaved: "Per ora i tuoi progressi non vengono salvati.",
    lockedTitle: "Questo argomento fa parte del percorso completo",
    lockedBody: "Il primo modulo è gratis. Presto potrai pagare il percorso per continuare.",
    empty: "Questo argomento non ha ancora contenuti.",
  },
};
