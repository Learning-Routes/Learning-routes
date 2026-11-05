import { BRAND, type LocaleCode } from "../locales";

// The words of connecting an assistant (Platform STEP 5 §2): the consent screen and
// Conexiones. Data only. Spanish is the source; a locale missing a string fails the types.

export interface ConnectText {
  connectIntro: string;
  copyAddress: string;
  copied: string;
  seeConnections: string;
  /** {client} is the client's name, shown as it is. */
  consentTitle: string;
  scopeRead: string;
  scopeWrite: string;
  scopePublish: string;
  allow: string;
  deny: string;
  /** {host} is where the client gets its answer. */
  returnsTo: string;
  asksTo: string;
  noSpace: string;
  /** On the sign-in page, when an assistant is waiting. */
  signInToConnect: string;
  wantToTeach: string;
  /** The other end of the line, on the consent page. */
  yourSide: string;
  connections: string;
  connectAssistant: string;
  noConnections: string;
  /** {date} is when it last called. */
  lastUsed: string;
  neverUsed: string;
  disconnect: string;
  disconnected: string;
  backToTeach: string;
  teachTitle: string;
  answered: string;
}

export const CONNECT_TEXT: Record<LocaleCode, ConnectText> = {
  es: {
    connectIntro:
      "Pega esta dirección en tu asistente y dale permiso cuando te lo pida. Todo lo que cree se queda en borrador hasta que pidas publicarlo.",
    copyAddress: "Copiar dirección",
    copied: "Copiada",
    seeConnections: "Ver tus conexiones",
    consentTitle: `{client} quiere usar tu cuenta de ${BRAND}`,
    scopeRead: "Ver tus rutas",
    scopeWrite: "Crear y cambiar borradores",
    scopePublish: "Publicar rutas en tu página",
    allow: "Permitir",
    deny: "No permitir",
    returnsTo: "Tu respuesta se envía a {host}.",
    asksTo: "Podrá:",
    noSpace: "Para conectar un asistente necesitas tener un espacio para enseñar.",
    signInToConnect: "Entra con tu correo para conectar tu asistente.",
    wantToTeach: "Quiero enseñar",
    yourSide: "Tu {brand}",
    connections: "Conexiones",
    connectAssistant: "Conecta tu asistente",
    noConnections: "Aún no hay asistentes conectados.",
    lastUsed: "Último uso: {date}",
    neverUsed: "Aún sin usar",
    disconnect: "Desconectar",
    disconnected: "Desconectado.",
    backToTeach: "Volver a Enseñar",
    teachTitle: "Enseñar",
    answered: "Listo. Puedes volver a tu asistente.",
  },
  en: {
    connectIntro:
      "Paste this address into your assistant and allow it when asked. Everything it creates stays a draft until you ask to publish it.",
    copyAddress: "Copy address",
    copied: "Copied",
    seeConnections: "See your connections",
    consentTitle: `{client} wants to use your ${BRAND} account`,
    scopeRead: "See your routes",
    scopeWrite: "Create and change drafts",
    scopePublish: "Publish routes on your page",
    allow: "Allow",
    deny: "Don't allow",
    returnsTo: "Your answer goes to {host}.",
    asksTo: "It will be able to:",
    noSpace: "To connect an assistant you need a space to teach in.",
    signInToConnect: "Sign in with your email to connect your assistant.",
    wantToTeach: "I want to teach",
    yourSide: "Your {brand}",
    connections: "Connections",
    connectAssistant: "Connect your assistant",
    noConnections: "No assistants connected yet.",
    lastUsed: "Last used: {date}",
    neverUsed: "Not used yet",
    disconnect: "Disconnect",
    disconnected: "Disconnected.",
    backToTeach: "Back to Teach",
    teachTitle: "Teach",
    answered: "Done. You can go back to your assistant.",
  },
  pt: {
    connectIntro:
      "Cole este endereço no seu assistente e dê permissão quando ele pedir. Tudo o que ele criar fica em rascunho até você pedir para publicar.",
    copyAddress: "Copiar endereço",
    copied: "Copiado",
    seeConnections: "Ver suas conexões",
    consentTitle: `{client} quer usar sua conta do ${BRAND}`,
    scopeRead: "Ver suas rotas",
    scopeWrite: "Criar e alterar rascunhos",
    scopePublish: "Publicar rotas na sua página",
    allow: "Permitir",
    deny: "Não permitir",
    returnsTo: "Sua resposta vai para {host}.",
    asksTo: "Poderá:",
    noSpace: "Para conectar um assistente, você precisa ter um espaço para ensinar.",
    signInToConnect: "Entre com seu e-mail para conectar seu assistente.",
    // Pending native review.
    wantToTeach: "Quero ensinar",
    yourSide: "Seu {brand}",
    connections: "Conexões",
    connectAssistant: "Conecte seu assistente",
    noConnections: "Ainda não há assistentes conectados.",
    lastUsed: "Último uso: {date}",
    neverUsed: "Ainda sem uso",
    disconnect: "Desconectar",
    disconnected: "Desconectado.",
    backToTeach: "Voltar para Ensinar",
    teachTitle: "Ensinar",
    answered: "Pronto. Você pode voltar ao seu assistente.",
  },
  fr: {
    connectIntro:
      "Collez cette adresse dans votre assistant et autorisez-le quand il le demande. Tout ce qu'il crée reste en brouillon jusqu'à ce que vous demandiez de le publier.",
    copyAddress: "Copier l'adresse",
    copied: "Copiée",
    seeConnections: "Voir vos connexions",
    consentTitle: `{client} veut utiliser votre compte ${BRAND}`,
    scopeRead: "Voir vos parcours",
    scopeWrite: "Créer et modifier des brouillons",
    scopePublish: "Publier des parcours sur votre page",
    allow: "Autoriser",
    deny: "Ne pas autoriser",
    returnsTo: "Votre réponse est envoyée à {host}.",
    asksTo: "Il pourra :",
    noSpace: "Pour connecter un assistant, il vous faut un espace pour enseigner.",
    signInToConnect: "Connectez-vous avec votre e-mail pour connecter votre assistant.",
    // Pending native review.
    wantToTeach: "Je veux enseigner",
    yourSide: "Votre {brand}",
    connections: "Connexions",
    connectAssistant: "Connectez votre assistant",
    noConnections: "Aucun assistant connecté pour l'instant.",
    lastUsed: "Dernière utilisation : {date}",
    neverUsed: "Pas encore utilisé",
    disconnect: "Déconnecter",
    disconnected: "Déconnecté.",
    backToTeach: "Retour à Enseigner",
    teachTitle: "Enseigner",
    answered: "C'est fait. Vous pouvez revenir à votre assistant.",
  },
  it: {
    connectIntro:
      "Incolla questo indirizzo nel tuo assistente e dagli il permesso quando lo chiede. Tutto ciò che crea resta in bozza finché non chiedi di pubblicarlo.",
    copyAddress: "Copia indirizzo",
    copied: "Copiato",
    seeConnections: "Vedi le tue connessioni",
    consentTitle: `{client} vuole usare il tuo account ${BRAND}`,
    scopeRead: "Vedere i tuoi percorsi",
    scopeWrite: "Creare e modificare bozze",
    scopePublish: "Pubblicare percorsi sulla tua pagina",
    allow: "Consenti",
    deny: "Non consentire",
    returnsTo: "La tua risposta va a {host}.",
    asksTo: "Potrà:",
    noSpace: "Per collegare un assistente ti serve uno spazio in cui insegnare.",
    signInToConnect: "Accedi con la tua email per collegare il tuo assistente.",
    // Pending native review.
    wantToTeach: "Voglio insegnare",
    yourSide: "Il tuo {brand}",
    connections: "Connessioni",
    connectAssistant: "Collega il tuo assistente",
    noConnections: "Ancora nessun assistente collegato.",
    lastUsed: "Ultimo utilizzo: {date}",
    neverUsed: "Non ancora usato",
    disconnect: "Scollega",
    disconnected: "Scollegato.",
    backToTeach: "Torna a Insegna",
    teachTitle: "Insegna",
    answered: "Fatto. Puoi tornare al tuo assistente.",
  },
};
