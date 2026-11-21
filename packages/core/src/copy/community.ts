import type { LocaleCode } from "../locales";

// The words of a route's community page (Platform STEP 22). Data only. Spanish is the source; a
// locale missing a string fails the types.

export interface CommunityText {
  title: string;
  /** Shown when a writer has no name to show. */
  someone: string;
  lessons: string;
  community: string;
  placeholder: string;
  kindQuestion: string;
  kindWin: string;
  kindNote: string;
  publish: string;
  useful: string;
  replies: string;
  reply: string;
  replyPlaceholder: string;
  send: string;
  pinned: string;
  answer: string;
  byCreator: string;
  hidden: string;
  deleted: string;
  empty: string;
  emptyBody: string;
  report: string;
  reportSpam: string;
  reportAbuse: string;
  reportOther: string;
  reported: string;
  tooMuch: string;
  failed: string;
  older: string;
  ago: string;
  now: string;
  kindLabel: string;
}

export const COMMUNITY_TEXT: Record<LocaleCode, CommunityText> = {
  es: {
    title: "Comunidad",
    someone: "Alguien",
    lessons: "Lecciones",
    community: "Comunidad",
    placeholder: "Pregunta algo o cuenta un logro",
    kindQuestion: "Pregunta",
    kindWin: "Logro",
    kindNote: "Nota",
    publish: "Publicar",
    useful: "Útil",
    replies: "Respuestas: {n}",
    reply: "Responder",
    replyPlaceholder: "Escribe una respuesta",
    send: "Enviar",
    pinned: "Fijada por la profe",
    answer: "La respuesta, elegida por la profe",
    byCreator: "Profe",
    hidden: "Oculta: solo la ves tú y quien enseña la ruta",
    deleted: "Publicación eliminada",
    empty: "Aquí todavía no hay nadie",
    emptyBody:
      "Haz la primera pregunta o cuenta tu primer logro. Quien enseña esta ruta también lee por aquí.",
    report: "Reportar",
    reportSpam: "Es spam o publicidad",
    reportAbuse: "Es ofensiva o acosa a alguien",
    reportOther: "Otra cosa",
    reported: "Gracias. Tu reporte es anónimo y alguien lo va a revisar.",
    tooMuch: "Has escrito mucho en esta hora. Vuelve a intentarlo en un rato.",
    failed: "No se pudo guardar. Inténtalo otra vez.",
    older: "Ver anteriores",
    ago: "hace {t}",
    now: "ahora",
    kindLabel: "Tipo de publicación",
  },
  en: {
    title: "Community",
    someone: "Someone",
    lessons: "Lessons",
    community: "Community",
    placeholder: "Ask something or share a win",
    kindQuestion: "Question",
    kindWin: "Win",
    kindNote: "Note",
    publish: "Post",
    useful: "Useful",
    replies: "Replies: {n}",
    reply: "Reply",
    replyPlaceholder: "Write a reply",
    send: "Send",
    pinned: "Pinned by the teacher",
    answer: "The answer, chosen by the teacher",
    byCreator: "Teacher",
    hidden: "Hidden: only you and the route’s teacher see it",
    deleted: "Post deleted",
    empty: "Nobody here yet",
    emptyBody:
      "Ask the first question or share your first win. The teacher of this route reads here too.",
    report: "Report",
    reportSpam: "It is spam or advertising",
    reportAbuse: "It is offensive or harasses someone",
    reportOther: "Something else",
    reported: "Thank you. Your report is anonymous and someone will review it.",
    tooMuch: "You have written a lot this hour. Try again in a while.",
    failed: "It could not be saved. Try again.",
    older: "See earlier",
    ago: "{t} ago",
    now: "now",
    kindLabel: "Kind of post",
  },
  pt: {
    title: "Comunidade",
    someone: "Alguém",
    lessons: "Lições",
    community: "Comunidade",
    placeholder: "Pergunte algo ou conte uma conquista",
    kindQuestion: "Pergunta",
    kindWin: "Conquista",
    kindNote: "Nota",
    publish: "Publicar",
    useful: "Útil",
    replies: "Respostas: {n}",
    reply: "Responder",
    replyPlaceholder: "Escreva uma resposta",
    send: "Enviar",
    pinned: "Fixada pela professora",
    answer: "A resposta, escolhida por quem ensina",
    byCreator: "Prof",
    hidden: "Oculta: só você e quem ensina a rota veem",
    deleted: "Publicação apagada",
    empty: "Ainda não há ninguém aqui",
    emptyBody:
      "Faça a primeira pergunta ou conte sua primeira conquista. Quem ensina esta rota também lê aqui.",
    report: "Denunciar",
    reportSpam: "É spam ou publicidade",
    reportAbuse: "É ofensiva ou assedia alguém",
    reportOther: "Outra coisa",
    reported: "Obrigado. Sua denúncia é anônima e alguém vai revisar.",
    tooMuch: "Você escreveu muito nesta hora. Tente de novo daqui a pouco.",
    failed: "Não foi possível salvar. Tente de novo.",
    older: "Ver anteriores",
    ago: "há {t}",
    now: "agora",
    kindLabel: "Tipo de publicação",
  },
  fr: {
    title: "Communauté",
    someone: "Quelqu’un",
    lessons: "Leçons",
    community: "Communauté",
    placeholder: "Posez une question ou partagez une réussite",
    kindQuestion: "Question",
    kindWin: "Réussite",
    kindNote: "Note",
    publish: "Publier",
    useful: "Utile",
    replies: "Réponses : {n}",
    reply: "Répondre",
    replyPlaceholder: "Écrivez une réponse",
    send: "Envoyer",
    pinned: "Épinglée par l’enseignant",
    answer: "La réponse, choisie par l’enseignant",
    byCreator: "Prof",
    hidden: "Masquée : seuls vous et l’enseignant la voyez",
    deleted: "Publication supprimée",
    empty: "Personne ici pour l’instant",
    emptyBody:
      "Posez la première question ou partagez votre première réussite. L’enseignant de ce parcours lit ici aussi.",
    report: "Signaler",
    reportSpam: "C’est du spam ou de la publicité",
    reportAbuse: "C’est offensant ou du harcèlement",
    reportOther: "Autre chose",
    reported: "Merci. Votre signalement est anonyme et sera examiné.",
    tooMuch: "Vous avez beaucoup écrit cette heure-ci. Réessayez dans un moment.",
    failed: "Impossible d’enregistrer. Réessayez.",
    older: "Voir les précédentes",
    ago: "il y a {t}",
    now: "à l’instant",
    kindLabel: "Type de publication",
  },
  it: {
    title: "Comunità",
    someone: "Qualcuno",
    lessons: "Lezioni",
    community: "Comunità",
    placeholder: "Fai una domanda o racconta un traguardo",
    kindQuestion: "Domanda",
    kindWin: "Traguardo",
    kindNote: "Nota",
    publish: "Pubblica",
    useful: "Utile",
    replies: "Risposte: {n}",
    reply: "Rispondi",
    replyPlaceholder: "Scrivi una risposta",
    send: "Invia",
    pinned: "Fissata dall’insegnante",
    answer: "La risposta, scelta dall’insegnante",
    byCreator: "Prof",
    hidden: "Nascosta: la vedete solo tu e chi insegna il percorso",
    deleted: "Pubblicazione eliminata",
    empty: "Qui non c’è ancora nessuno",
    emptyBody:
      "Fai la prima domanda o racconta il tuo primo traguardo. Anche chi insegna questo percorso legge qui.",
    report: "Segnala",
    reportSpam: "È spam o pubblicità",
    reportAbuse: "È offensiva o molesta qualcuno",
    reportOther: "Altro",
    reported: "Grazie. La segnalazione è anonima e qualcuno la esaminerà.",
    tooMuch: "Hai scritto molto in quest’ora. Riprova tra poco.",
    failed: "Non è stato possibile salvare. Riprova.",
    older: "Vedi precedenti",
    ago: "{t} fa",
    now: "adesso",
    kindLabel: "Tipo di pubblicazione",
  },
};
