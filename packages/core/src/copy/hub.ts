import type { LocaleCode } from "../locales";

// The words of the pages that gather everything: Inicio, Comunidad and Avisos (Platform STEP 23).
// Apart from the frame's own words, so the pages that never show these do not carry them. Data
// only. Spanish is the source; a locale missing a string fails the types.

export interface HubText {
  questionsTitle: string;
  noQuestions: string;
  ask: string;
  seeAll: string;
  noNotices: string;
  noticeReply: string;
  noticeAnswer: string;
  noticePinned: string;
  markRead: string;
  feedTitle: string;
  feedEmpty: string;
  yourCommunities: string;
  /** {route} is the route a post belongs to. */
  inRoute: string;
}

export const HUB_TEXT: Record<LocaleCode, HubText> = {
  es: {
    questionsTitle: "Preguntas de tu ruta",
    noQuestions: "Nadie ha preguntado todavía. La primera pregunta puede ser tuya.",
    ask: "Hacer una pregunta",
    seeAll: "Ver todas",
    noNotices: "No tienes avisos nuevos.",
    noticeReply: "Respondieron a lo que escribiste",
    noticeAnswer: "Eligieron una respuesta a tu pregunta",
    noticePinned: "Fijaron lo que escribiste",
    markRead: "Marcar como leídos",
    feedTitle: "Lo último en tus rutas",
    feedEmpty: "Aquí verás lo que se pregunta y se comparte en las rutas que estudias.",
    yourCommunities: "Las comunidades de tus rutas",
    inRoute: "en {route}",
  },
  en: {
    questionsTitle: "Questions in your route",
    noQuestions: "Nobody has asked yet. The first question can be yours.",
    ask: "Ask a question",
    seeAll: "See all",
    noNotices: "You have no new notices.",
    noticeReply: "Someone replied to what you wrote",
    noticeAnswer: "An answer to your question was chosen",
    noticePinned: "What you wrote was pinned",
    markRead: "Mark as read",
    feedTitle: "The latest in your routes",
    feedEmpty: "What people ask and share in the routes you study will show here.",
    yourCommunities: "Your routes' communities",
    inRoute: "in {route}",
  },
  pt: {
    // Pending native review.
    questionsTitle: "Perguntas da sua rota",
    noQuestions: "Ninguém perguntou ainda. A primeira pergunta pode ser sua.",
    ask: "Fazer uma pergunta",
    seeAll: "Ver todas",
    noNotices: "Você não tem avisos novos.",
    noticeReply: "Responderam ao que você escreveu",
    noticeAnswer: "Escolheram uma resposta para a sua pergunta",
    noticePinned: "Fixaram o que você escreveu",
    markRead: "Marcar como lidos",
    feedTitle: "O mais recente nas suas rotas",
    feedEmpty: "Aqui aparece o que se pergunta e se compartilha nas rotas que você estuda.",
    yourCommunities: "As comunidades das suas rotas",
    inRoute: "em {route}",
  },
  fr: {
    // Pending native review.
    questionsTitle: "Questions de votre parcours",
    noQuestions: "Personne n'a encore posé de question. La première peut être la vôtre.",
    ask: "Poser une question",
    seeAll: "Tout voir",
    noNotices: "Vous n'avez pas de nouveaux avis.",
    noticeReply: "On a répondu à ce que vous avez écrit",
    noticeAnswer: "Une réponse à votre question a été choisie",
    noticePinned: "Ce que vous avez écrit a été épinglé",
    markRead: "Marquer comme lus",
    feedTitle: "Les nouveautés de vos parcours",
    feedEmpty: "Vous verrez ici ce qui se demande et se partage dans vos parcours.",
    yourCommunities: "Les communautés de vos parcours",
    inRoute: "dans {route}",
  },
  it: {
    // Pending native review.
    questionsTitle: "Domande del tuo percorso",
    noQuestions: "Nessuno ha ancora chiesto. La prima domanda può essere la tua.",
    ask: "Fai una domanda",
    seeAll: "Vedi tutte",
    noNotices: "Non hai nuovi avvisi.",
    noticeReply: "Hanno risposto a quello che hai scritto",
    noticeAnswer: "È stata scelta una risposta alla tua domanda",
    noticePinned: "Quello che hai scritto è stato fissato",
    markRead: "Segna come letti",
    feedTitle: "Le novità dei tuoi percorsi",
    feedEmpty: "Qui vedrai cosa si chiede e si condivide nei percorsi che studi.",
    yourCommunities: "Le comunità dei tuoi percorsi",
    inRoute: "in {route}",
  },
};
