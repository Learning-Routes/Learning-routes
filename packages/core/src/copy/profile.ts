import type { LocaleCode } from "../locales";

// One's profile: who one is here, how far one has come, and, for whoever teaches, the way in for
// their assistant. Data only. Spanish is the source; a locale missing a string fails the types.

export interface ProfileText {
  title: string;
  /** Shown where the name goes, until one gives it. */
  nameless: string;
  nameLabel: string;
  nameHelp: string;
  save: string;
  saved: string;
  failed: string;
  progress: string;
  routes: string;
  topicsDone: string;
  /** {done} and {total} are topics. */
  topicsOf: string;
  /** {topic} is the topic one carries on with. */
  nextTopic: string;
  finished: string;
  carryOn: string;
  noRoutes: string;
  explore: string;
  teaching: string;
  /** {space} is the space's name. */
  yourSpace: string;
  openPage: string;
  panel: string;
  assistant: string;
  assistantHelp: string;
  howToConnect: string;
  connected: string;
  wantToTeach: string;
  askToTeach: string;
  account: string;
  changeName: string;
  /** The three things one does to connect an assistant, in order. */
  steps: readonly [string, string, string];
  connectedNow: string;
}

export const PROFILE_TEXT: Record<LocaleCode, ProfileText> = {
  es: {
    title: "Perfil",
    nameless: "Ponle nombre a tu perfil",
    nameLabel: "Tu nombre",
    nameHelp: "Así te ven en la comunidad.",
    save: "Guardar",
    saved: "Nombre guardado",
    failed: "No se pudo guardar. Inténtalo otra vez.",
    progress: "Tu progreso",
    routes: "Rutas",
    topicsDone: "Temas completados",
    topicsOf: "{done} de {total} temas",
    nextTopic: "Sigues en: {topic}",
    finished: "Ruta terminada",
    carryOn: "Seguir",
    noRoutes: "Todavía no empiezas ninguna ruta.",
    explore: "Explorar rutas",
    teaching: "Enseñas",
    yourSpace: "Tu espacio: {space}",
    openPage: "Ver tu página pública",
    panel: "Abrir tu panel",
    assistant: "Tu asistente (MCP)",
    assistantHelp:
      "Pega esta dirección en Claude, ChatGPT u otro asistente para crear y publicar rutas desde ahí.",
    howToConnect: "Cómo conectarlo, paso a paso",
    connected: "Asistentes conectados",
    wantToTeach: "¿Quieres enseñar aquí?",
    askToTeach: "Pedir un espacio para enseñar",
    account: "Tu cuenta",
    changeName: "Cambiar nombre",
    steps: [
      "Copia la dirección.",
      "Pégala en tu asistente, donde se agregan conectores.",
      "Entra con tu cuenta y pulsa Permitir.",
    ],
    connectedNow: "Conectados ahora",
  },
  en: {
    title: "Profile",
    nameless: "Give your profile a name",
    nameLabel: "Your name",
    nameHelp: "This is how the community sees you.",
    save: "Save",
    saved: "Name saved",
    failed: "It could not be saved. Try again.",
    progress: "Your progress",
    routes: "Routes",
    topicsDone: "Topics completed",
    topicsOf: "{done} of {total} topics",
    nextTopic: "You are on: {topic}",
    finished: "Route finished",
    carryOn: "Carry on",
    noRoutes: "You have not started a route yet.",
    explore: "Explore routes",
    teaching: "You teach",
    yourSpace: "Your space: {space}",
    openPage: "See your public page",
    panel: "Open your panel",
    assistant: "Your assistant (MCP)",
    assistantHelp:
      "Paste this address into Claude, ChatGPT or another assistant to create and publish routes from there.",
    howToConnect: "How to connect it, step by step",
    connected: "Connected assistants",
    wantToTeach: "Do you want to teach here?",
    askToTeach: "Ask for a space to teach in",
    account: "Your account",
    changeName: "Change name",
    steps: [
      "Copy the address.",
      "Paste it into your assistant, where connectors are added.",
      "Sign in with your account and press Allow.",
    ],
    connectedNow: "Connected now",
  },
  pt: {
    title: "Perfil",
    nameless: "Dê um nome ao seu perfil",
    nameLabel: "Seu nome",
    nameHelp: "É assim que a comunidade vê você.",
    save: "Salvar",
    saved: "Nome salvo",
    failed: "Não foi possível salvar. Tente de novo.",
    progress: "Seu progresso",
    routes: "Rotas",
    topicsDone: "Temas concluídos",
    topicsOf: "{done} de {total} temas",
    nextTopic: "Você está em: {topic}",
    finished: "Rota concluída",
    carryOn: "Continuar",
    noRoutes: "Você ainda não começou nenhuma rota.",
    explore: "Explorar rotas",
    teaching: "Você ensina",
    yourSpace: "Seu espaço: {space}",
    openPage: "Ver sua página pública",
    panel: "Abrir seu painel",
    assistant: "Seu assistente (MCP)",
    assistantHelp:
      "Cole este endereço no Claude, no ChatGPT ou em outro assistente para criar e publicar rotas por lá.",
    howToConnect: "Como conectar, passo a passo",
    connected: "Assistentes conectados",
    wantToTeach: "Quer ensinar aqui?",
    askToTeach: "Pedir um espaço para ensinar",
    account: "Sua conta",
    changeName: "Mudar nome",
    steps: [
      "Copie o endereço.",
      "Cole no seu assistente, onde se adicionam conectores.",
      "Entre com a sua conta e toque em Permitir.",
    ],
    connectedNow: "Conectados agora",
  },
  fr: {
    title: "Profil",
    nameless: "Donnez un nom à votre profil",
    nameLabel: "Votre nom",
    nameHelp: "C’est ainsi que la communauté vous voit.",
    save: "Enregistrer",
    saved: "Nom enregistré",
    failed: "L’enregistrement a échoué. Réessayez.",
    progress: "Votre progression",
    routes: "Parcours",
    topicsDone: "Thèmes terminés",
    topicsOf: "{done} thèmes sur {total}",
    nextTopic: "Vous en êtes à : {topic}",
    finished: "Parcours terminé",
    carryOn: "Continuer",
    noRoutes: "Vous n’avez encore commencé aucun parcours.",
    explore: "Explorer les parcours",
    teaching: "Vous enseignez",
    yourSpace: "Votre espace : {space}",
    openPage: "Voir votre page publique",
    panel: "Ouvrir votre tableau de bord",
    assistant: "Votre assistant (MCP)",
    assistantHelp:
      "Collez cette adresse dans Claude, ChatGPT ou un autre assistant pour créer et publier des parcours depuis là.",
    howToConnect: "Comment le connecter, pas à pas",
    connected: "Assistants connectés",
    wantToTeach: "Vous voulez enseigner ici ?",
    askToTeach: "Demander un espace pour enseigner",
    account: "Votre compte",
    changeName: "Changer de nom",
    steps: [
      "Copiez l'adresse.",
      "Collez-la dans votre assistant, là où on ajoute des connecteurs.",
      "Connectez-vous avec votre compte et appuyez sur Autoriser.",
    ],
    connectedNow: "Connectés maintenant",
  },
  it: {
    title: "Profilo",
    nameless: "Dai un nome al tuo profilo",
    nameLabel: "Il tuo nome",
    nameHelp: "Così ti vede la comunità.",
    save: "Salva",
    saved: "Nome salvato",
    failed: "Non è stato possibile salvare. Riprova.",
    progress: "I tuoi progressi",
    routes: "Percorsi",
    topicsDone: "Argomenti completati",
    topicsOf: "{done} di {total} argomenti",
    nextTopic: "Sei a: {topic}",
    finished: "Percorso terminato",
    carryOn: "Continua",
    noRoutes: "Non hai ancora iniziato nessun percorso.",
    explore: "Esplora i percorsi",
    teaching: "Insegni",
    yourSpace: "Il tuo spazio: {space}",
    openPage: "Vedi la tua pagina pubblica",
    panel: "Apri il tuo pannello",
    assistant: "Il tuo assistente (MCP)",
    assistantHelp:
      "Incolla questo indirizzo in Claude, ChatGPT o un altro assistente per creare e pubblicare percorsi da lì.",
    howToConnect: "Come collegarlo, passo dopo passo",
    connected: "Assistenti collegati",
    wantToTeach: "Vuoi insegnare qui?",
    askToTeach: "Chiedi uno spazio per insegnare",
    account: "Il tuo account",
    changeName: "Cambia nome",
    steps: [
      "Copia l'indirizzo.",
      "Incollalo nel tuo assistente, dove si aggiungono i connettori.",
      "Accedi con il tuo account e premi Consenti.",
    ],
    connectedNow: "Connessi ora",
  },
};
