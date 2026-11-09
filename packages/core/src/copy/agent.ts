import type { LocaleCode } from "../locales";

// What the creator's assistant says on its own, without a model (Platform STEP 10 §1, §4): the one
// quiet line while it works, and the plain words when it cannot go on. Data only. Spanish is the
// source; a locale missing a string fails the types. Never a token count.

export type WorkingOn =
  | "reading"
  | "create_route"
  | "update_route_details"
  | "add_module"
  | "add_lesson"
  | "add_blocks"
  | "upload_document"
  | "import_route"
  | "publishing";

/** The kinds of block a lesson preview names, as a creator would say them. */
export type NamedKind =
  | "concept"
  | "example"
  | "tip"
  | "check"
  | "summary"
  | "cards"
  | "interactive"
  | "video";

export interface AgentText {
  working: Record<WorkingOn, string>;
  kinds: Record<NamedKind, string>;
  /** Said once, when a fifth of the month's help is left. */
  budgetLow: string;
  /** The month's help is used up: what still works, and when it comes back. */
  budgetOut: string;
  /** The assistant is not switched on for this platform yet. */
  notOn: string;
  /** A model call failed on our side. */
  failed: string;
  /** A turn ran out of steps before it finished. */
  tooLong: string;
  declined: string;
  /** {address} is where the route is now. */
  published: string;
  /** Publishing failed; nothing changed. */
  publishFailed: string;
}

export const AGENT_TEXT: Record<LocaleCode, AgentText> = {
  es: {
    kinds: {
      concept: "concepto",
      example: "ejemplo",
      tip: "consejo",
      check: "pregunta",
      summary: "resumen",
      cards: "tarjetas",
      interactive: "actividad",
      video: "video",
    },
    working: {
      reading: "Leyendo tu ruta…",
      create_route: "Creando tu ruta…",
      update_route_details: "Actualizando los datos de la ruta…",
      add_module: "Creando el módulo…",
      add_lesson: "Escribiendo el tema…",
      add_blocks: "Escribiendo el tema…",
      upload_document: "Subiendo tu documento tal cual…",
      import_route: "Armando la ruta completa…",
      publishing: "Publicando…",
    },
    budgetLow:
      "Te cuento algo: queda poca ayuda del asistente para este mes. Tu ruta y todo lo que hicimos están guardados.",
    budgetOut:
      "Este mes ya usaste toda la ayuda del asistente. Tu ruta está guardada: puedes revisarla, publicarla y editarla en Enseñar. La ayuda vuelve el día 1.",
    notOn:
      "El asistente todavía no está encendido. Mientras tanto, puedes armar tu ruta desde Enseñar o con tu propio asistente.",
    failed:
      "No pude responder esta vez, por un problema nuestro. Lo que hicimos está guardado: vuelve a escribirme.",
    tooLong: "Me detuve aquí para no hacer demasiado de una vez. Lo hecho está guardado. ¿Sigo?",
    declined: "De acuerdo, queda como borrador. Cuando quieras, la publicamos.",
    published: "Publicada. Ya está en {address}.",
    publishFailed: "No pude publicarla, y nada cambió. Vuelve a intentarlo en un momento.",
  },
  en: {
    kinds: {
      concept: "concept",
      example: "example",
      tip: "tip",
      check: "question",
      summary: "summary",
      cards: "cards",
      interactive: "activity",
      video: "video",
    },
    working: {
      reading: "Reading your route…",
      create_route: "Creating your route…",
      update_route_details: "Updating the route's details…",
      add_module: "Creating the module…",
      add_lesson: "Writing the topic…",
      add_blocks: "Writing the topic…",
      upload_document: "Uploading your document as it is…",
      import_route: "Putting the whole route together…",
      publishing: "Publishing…",
    },
    budgetLow:
      "A heads-up: there is little assistant help left this month. Your route and everything we did are saved.",
    budgetOut:
      "You have used all of this month's assistant help. Your route is saved: you can review, publish and edit it in Teach. Help comes back on the 1st.",
    notOn:
      "The assistant is not switched on yet. Meanwhile, you can build your route in Teach or with your own assistant.",
    failed:
      "I couldn't answer this time, because of a problem on our side. What we did is saved: write to me again.",
    tooLong:
      "I stopped here so as not to do too much at once. What's done is saved. Shall I go on?",
    declined: "Fine, it stays a draft. We can publish it whenever you want.",
    published: "Published. It's at {address}.",
    publishFailed: "I couldn't publish it, and nothing changed. Try again in a moment.",
  },
  pt: {
    kinds: {
      concept: "conceito",
      example: "exemplo",
      tip: "dica",
      check: "pergunta",
      summary: "resumo",
      cards: "cartões",
      interactive: "atividade",
      video: "vídeo",
    },
    working: {
      reading: "Lendo a sua rota…",
      create_route: "Criando a sua rota…",
      update_route_details: "Atualizando os dados da rota…",
      add_module: "Criando o módulo…",
      add_lesson: "Escrevendo o tema…",
      add_blocks: "Escrevendo o tema…",
      upload_document: "Enviando o seu documento como está…",
      import_route: "Montando a rota completa…",
      publishing: "Publicando…",
    },
    budgetLow:
      "Um aviso: resta pouca ajuda do assistente neste mês. A sua rota e tudo o que fizemos estão salvos.",
    budgetOut:
      "Você já usou toda a ajuda do assistente deste mês. A sua rota está salva: pode revisá-la, publicá-la e editá-la em Ensinar. A ajuda volta no dia 1.",
    notOn:
      "O assistente ainda não está ligado. Enquanto isso, você pode montar a sua rota em Ensinar ou com o seu próprio assistente.",
    failed:
      "Não consegui responder desta vez, por um problema nosso. O que fizemos está salvo: escreva de novo.",
    tooLong: "Parei aqui para não fazer demais de uma vez. O que foi feito está salvo. Continuo?",
    declined: "Certo, fica como rascunho. Quando quiser, publicamos.",
    published: "Publicada. Já está em {address}.",
    publishFailed: "Não consegui publicá-la, e nada mudou. Tente de novo em um momento.",
  },
  fr: {
    kinds: {
      concept: "notion",
      example: "exemple",
      tip: "astuce",
      check: "question",
      summary: "résumé",
      cards: "cartes",
      interactive: "activité",
      video: "vidéo",
    },
    working: {
      reading: "Je lis votre parcours…",
      create_route: "Je crée votre parcours…",
      update_route_details: "Je mets à jour les informations du parcours…",
      add_module: "Je crée le module…",
      add_lesson: "J'écris le thème…",
      add_blocks: "J'écris le thème…",
      upload_document: "J'envoie votre document tel quel…",
      import_route: "J'assemble le parcours complet…",
      publishing: "Publication…",
    },
    budgetLow:
      "Pour info : il reste peu d'aide de l'assistant ce mois-ci. Votre parcours et tout ce que nous avons fait sont enregistrés.",
    budgetOut:
      "Vous avez utilisé toute l'aide de l'assistant ce mois-ci. Votre parcours est enregistré : vous pouvez le relire, le publier et le modifier dans Enseigner. L'aide revient le 1er.",
    notOn:
      "L'assistant n'est pas encore activé. En attendant, vous pouvez créer votre parcours dans Enseigner ou avec votre propre assistant.",
    failed:
      "Je n'ai pas pu répondre cette fois, à cause d'un problème de notre côté. Ce que nous avons fait est enregistré : écrivez-moi à nouveau.",
    tooLong:
      "Je m'arrête ici pour ne pas trop en faire d'un coup. Ce qui est fait est enregistré. Je continue ?",
    declined: "D'accord, il reste un brouillon. Nous le publierons quand vous voudrez.",
    published: "Publié. Il est sur {address}.",
    publishFailed: "Je n'ai pas pu le publier, et rien n'a changé. Réessayez dans un instant.",
  },
  it: {
    kinds: {
      concept: "concetto",
      example: "esempio",
      tip: "consiglio",
      check: "domanda",
      summary: "riassunto",
      cards: "schede",
      interactive: "attività",
      video: "video",
    },
    working: {
      reading: "Leggo il tuo percorso…",
      create_route: "Creo il tuo percorso…",
      update_route_details: "Aggiorno i dati del percorso…",
      add_module: "Creo il modulo…",
      add_lesson: "Scrivo l'argomento…",
      add_blocks: "Scrivo l'argomento…",
      upload_document: "Carico il tuo documento così com'è…",
      import_route: "Monto il percorso completo…",
      publishing: "Pubblico…",
    },
    budgetLow:
      "Ti avviso: questo mese resta poco aiuto dell'assistente. Il tuo percorso e tutto ciò che abbiamo fatto sono salvati.",
    budgetOut:
      "Questo mese hai usato tutto l'aiuto dell'assistente. Il tuo percorso è salvato: puoi rivederlo, pubblicarlo e modificarlo in Insegnare. L'aiuto torna il giorno 1.",
    notOn:
      "L'assistente non è ancora acceso. Nel frattempo puoi costruire il tuo percorso in Insegnare o con il tuo assistente.",
    failed:
      "Questa volta non sono riuscito a rispondere, per un problema nostro. Ciò che abbiamo fatto è salvato: scrivimi di nuovo.",
    tooLong: "Mi fermo qui per non fare troppo in una volta. Ciò che è fatto è salvato. Continuo?",
    declined: "D'accordo, resta una bozza. La pubblichiamo quando vuoi.",
    published: "Pubblicato. È su {address}.",
    publishFailed:
      "Non sono riuscito a pubblicarlo, e non è cambiato nulla. Riprova tra un momento.",
  },
};
