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
  tipLabel: string;
  exampleLabel: string;
  imageFailed: string;
  watchVideo: string;
  /** {host} is where it loads from. */
  videoLoads: string;
  openVideo: string;
  videoMissing: string;
  flipCard: string;
  seeAnswer: string;
  expectedOutput: string;
  transcript: string;
  /** An interactive block with no title of its own. */
  activity: string;
  /** {creator} is whose space it is. */
  madeBy: string;
  fullScreen: string;
  /** When a creation says it was finished, through lr:done. */
  creationDone: string;
  /** Without JavaScript, or when the frame does not load. */
  creationNeeds: string;
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
    tipLabel: "Consejo",
    exampleLabel: "Ejemplo",
    imageFailed: "No pudimos cargar esta imagen.",
    watchVideo: "Ver el video",
    videoLoads: "Se carga de {host} solo cuando lo pidas.",
    openVideo: "Abrir el video",
    videoMissing: "Este video no tiene una dirección segura.",
    flipCard: "Toca para voltear",
    seeAnswer: "Ver la respuesta",
    expectedOutput: "Lo que debe salir",
    transcript: "Transcripción",
    activity: "Actividad",
    madeBy: "Hecho por {creator}. Funciona dentro de esta página.",
    fullScreen: "Pantalla completa",
    creationDone: "Lo terminaste.",
    creationNeeds:
      "Esta actividad necesita un navegador moderno con JavaScript activado. El resto del tema funciona igual.",
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
    tipLabel: "Tip",
    exampleLabel: "Example",
    imageFailed: "We couldn't load this image.",
    watchVideo: "Watch the video",
    videoLoads: "It loads from {host} only when you ask.",
    openVideo: "Open the video",
    videoMissing: "This video has no safe address.",
    flipCard: "Tap to flip",
    seeAnswer: "See the answer",
    expectedOutput: "What it should print",
    transcript: "Transcript",
    activity: "Activity",
    madeBy: "Made by {creator}. It runs inside this page.",
    fullScreen: "Full screen",
    creationDone: "You finished it.",
    creationNeeds:
      "This activity needs a modern browser with JavaScript turned on. The rest of the topic works as usual.",
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
    tipLabel: "Dica",
    exampleLabel: "Exemplo",
    imageFailed: "Não conseguimos carregar esta imagem.",
    watchVideo: "Ver o vídeo",
    videoLoads: "Só carrega do {host} quando você pedir.",
    openVideo: "Abrir o vídeo",
    videoMissing: "Este vídeo não tem um endereço seguro.",
    flipCard: "Toque para virar",
    seeAnswer: "Ver a resposta",
    expectedOutput: "O que deve aparecer",
    transcript: "Transcrição",
    activity: "Atividade",
    madeBy: "Feito por {creator}. Funciona dentro desta página.",
    fullScreen: "Tela cheia",
    creationDone: "Você terminou.",
    creationNeeds:
      "Esta atividade precisa de um navegador moderno com JavaScript ativado. O resto do tema funciona normalmente.",
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
    tipLabel: "Conseil",
    exampleLabel: "Exemple",
    imageFailed: "Nous n'avons pas pu charger cette image.",
    watchVideo: "Voir la vidéo",
    videoLoads: "Elle se charge depuis {host} seulement à votre demande.",
    openVideo: "Ouvrir la vidéo",
    videoMissing: "Cette vidéo n'a pas d'adresse sûre.",
    flipCard: "Touchez pour retourner",
    seeAnswer: "Voir la réponse",
    expectedOutput: "Ce qui doit s'afficher",
    transcript: "Transcription",
    activity: "Activité",
    madeBy: "Créé par {creator}. Fonctionne dans cette page.",
    fullScreen: "Plein écran",
    creationDone: "Vous l'avez terminé.",
    creationNeeds:
      "Cette activité a besoin d'un navigateur récent avec JavaScript activé. Le reste du sujet fonctionne normalement.",
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
    tipLabel: "Consiglio",
    exampleLabel: "Esempio",
    imageFailed: "Non siamo riusciti a caricare questa immagine.",
    watchVideo: "Guarda il video",
    videoLoads: "Si carica da {host} solo quando lo chiedi.",
    openVideo: "Apri il video",
    videoMissing: "Questo video non ha un indirizzo sicuro.",
    flipCard: "Tocca per girare",
    seeAnswer: "Vedi la risposta",
    expectedOutput: "Cosa deve uscire",
    transcript: "Trascrizione",
    activity: "Attività",
    madeBy: "Creato da {creator}. Funziona dentro questa pagina.",
    fullScreen: "Schermo intero",
    creationDone: "L'hai finito.",
    creationNeeds:
      "Questa attività ha bisogno di un browser recente con JavaScript attivo. Il resto dell'argomento funziona come sempre.",
  },
};
