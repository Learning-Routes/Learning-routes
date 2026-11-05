import type { LocaleCode } from "../locales";

// The words of the app's pages in Platform STEP 4 §6: starting a route, Mis rutas
// and "Quiero enseñar". Data only. Spanish is the source; a locale missing a string
// fails the types.

export interface AppPagesText {
  /** {route} is the route's title. */
  joining: string;
  /** {creator} is who teaches it. */
  joiningBody: string;
  confirmStart: string;
  unavailableTitle: string;
  unavailableBody: string;
  seeRoutes: string;
  myRoutes: string;
  modeLabel: string;
  learn: string;
  teach: string;
  signOut: string;
  continue: string;
  emptyTitle: string;
  emptyBody: string;
  exploreRoutes: string;
  exploreMore: string;
  backToMyRoutes: string;
  teachTitle: string;
  teachIntro: string;
  nameLabel: string;
  emailLabel: string;
  teachesLabel: string;
  teachesExample: string;
  linkLabel: string;
  linkExample: string;
  linkHint: string;
  send: string;
  sending: string;
  doneTitle: string;
  /** {email} is the address they gave. */
  doneBody: string;
  privacy: string;
  fixName: string;
  fixEmail: string;
  fixTeaches: string;
  fixLink: string;
  checkFailed: string;
  tooMany: string;
  sendFailed: string;
  needsScript: string;
}

export const APP_PAGES_TEXT: Record<LocaleCode, AppPagesText> = {
  es: {
    joining: "Vas a empezar {route}",
    joiningBody: "Con {creator}. Entra con tu correo para guardar tu avance.",
    confirmStart: "Empezar esta ruta",
    unavailableTitle: "Esta ruta no está disponible",
    unavailableBody: "Puede que ya no exista o que no esté abierta. Hay más rutas para elegir.",
    seeRoutes: "Ver las rutas",
    myRoutes: "Mis rutas",
    modeLabel: "Modo",
    learn: "Aprender",
    teach: "Enseñar",
    signOut: "Salir",
    continue: "Seguir",
    emptyTitle: "Todavía no estudias ninguna ruta.",
    emptyBody: "Elige una y empieza gratis con su primer módulo.",
    exploreRoutes: "Explorar rutas",
    exploreMore: "Explorar más rutas",
    backToMyRoutes: "Volver a Mis rutas",
    teachTitle: "Enseña lo que sabes, en una ruta.",
    teachIntro:
      "Por ahora entramos por invitación. Cuéntanos qué enseñas y te escribimos en pocos días.",
    nameLabel: "Tu nombre",
    emailLabel: "Tu correo",
    teachesLabel: "¿Qué enseñas?",
    teachesExample: "Por ejemplo: matemáticas para colegio",
    linkLabel: "Dónde te siguen",
    linkExample: "https://tu-canal.com",
    linkHint: "Opcional. Nos ayuda a conocerte.",
    send: "Enviar solicitud",
    sending: "Enviando tu solicitud",
    doneTitle: "Recibimos tu solicitud.",
    doneBody: "Te escribimos a {email} en unos días.",
    privacy: "Usamos estos datos solo para responderte.",
    fixName: "Escribe tu nombre.",
    fixEmail: "Escribe un correo con @, como tu@ejemplo.com.",
    fixTeaches: "Cuéntanos qué enseñas.",
    fixLink: "Escribe una dirección web completa, con https://, o deja esto vacío.",
    checkFailed: "No pudimos comprobar que eres una persona. Inténtalo otra vez.",
    tooMany: "Se enviaron muchas solicitudes. Espera un rato y vuelve a intentarlo.",
    sendFailed: "Tu solicitud no se pudo enviar. Revisa tu conexión y vuelve a intentarlo.",
    needsScript: "Para enviar tu solicitud, activa JavaScript en tu navegador.",
  },
  en: {
    joining: "You're about to start {route}",
    joiningBody: "With {creator}. Sign in with your email to save your progress.",
    confirmStart: "Start this route",
    unavailableTitle: "This route isn't available",
    unavailableBody:
      "It may no longer exist, or may not be open. There are more routes to choose from.",
    seeRoutes: "See the routes",
    myRoutes: "My routes",
    modeLabel: "Mode",
    learn: "Learn",
    teach: "Teach",
    signOut: "Sign out",
    continue: "Continue",
    emptyTitle: "You're not studying any route yet.",
    emptyBody: "Choose one and start free with its first module.",
    exploreRoutes: "Explore routes",
    exploreMore: "Explore more routes",
    backToMyRoutes: "Back to My routes",
    teachTitle: "Teach what you know, in a route.",
    teachIntro:
      "For now, joining is by invitation. Tell us what you teach and we'll write to you within a few days.",
    nameLabel: "Your name",
    emailLabel: "Your email",
    teachesLabel: "What do you teach?",
    teachesExample: "For example: school math",
    linkLabel: "Where people follow you",
    linkExample: "https://your-channel.com",
    linkHint: "Optional. It helps us get to know you.",
    send: "Send application",
    sending: "Sending your application",
    doneTitle: "We received your application.",
    doneBody: "We'll write to you at {email} within a few days.",
    privacy: "We use this information only to reply to you.",
    fixName: "Enter your name.",
    fixEmail: "Enter an email with an @, like you@example.com.",
    fixTeaches: "Tell us what you teach.",
    fixLink: "Enter a full web address, with https://, or leave this empty.",
    checkFailed: "We couldn't confirm you're a person. Try again.",
    tooMany: "Too many applications were sent. Wait a while and try again.",
    sendFailed: "Your application couldn't be sent. Check your connection and try again.",
    needsScript: "To send your application, turn on JavaScript in your browser.",
  },
  pt: {
    joining: "Você vai começar {route}",
    joiningBody: "Com {creator}. Entre com seu e-mail para salvar seu avanço.",
    confirmStart: "Começar esta rota",
    unavailableTitle: "Esta rota não está disponível",
    unavailableBody: "Talvez não exista mais ou não esteja aberta. Há outras rotas para escolher.",
    seeRoutes: "Ver as rotas",
    myRoutes: "Minhas rotas",
    modeLabel: "Modo",
    learn: "Aprender",
    teach: "Ensinar",
    signOut: "Sair",
    continue: "Continuar",
    emptyTitle: "Você ainda não estuda nenhuma rota.",
    emptyBody: "Escolha uma e comece grátis com o primeiro módulo.",
    exploreRoutes: "Explorar rotas",
    exploreMore: "Explorar mais rotas",
    backToMyRoutes: "Voltar para Minhas rotas",
    teachTitle: "Ensine o que você sabe, em uma rota.",
    teachIntro:
      "Por enquanto, a entrada é por convite. Conte o que você ensina e escreveremos em poucos dias.",
    nameLabel: "Seu nome",
    emailLabel: "Seu e-mail",
    teachesLabel: "O que você ensina?",
    teachesExample: "Por exemplo: matemática para a escola",
    linkLabel: "Onde seguem você",
    linkExample: "https://seu-canal.com",
    linkHint: "Opcional. Ajuda a conhecer você.",
    send: "Enviar pedido",
    sending: "Enviando seu pedido",
    doneTitle: "Recebemos seu pedido.",
    doneBody: "Escreveremos para {email} em poucos dias.",
    privacy: "Usamos estes dados apenas para responder a você.",
    fixName: "Digite seu nome.",
    fixEmail: "Digite um e-mail com @, como voce@exemplo.com.",
    fixTeaches: "Conte o que você ensina.",
    fixLink: "Digite um endereço web completo, com https://, ou deixe vazio.",
    checkFailed: "Não foi possível confirmar que você é uma pessoa. Tente de novo.",
    tooMany: "Muitos pedidos foram enviados. Aguarde um pouco e tente de novo.",
    sendFailed: "Não foi possível enviar seu pedido. Confira sua conexão e tente de novo.",
    needsScript: "Para enviar seu pedido, ative o JavaScript no seu navegador.",
  },
  fr: {
    joining: "Vous allez commencer {route}",
    joiningBody:
      "Avec {creator}. Connectez-vous avec votre e-mail pour enregistrer votre progression.",
    confirmStart: "Commencer ce parcours",
    unavailableTitle: "Ce parcours n'est pas disponible",
    unavailableBody:
      "Il n'existe peut-être plus, ou n'est pas ouvert. D'autres parcours vous attendent.",
    seeRoutes: "Voir les parcours",
    myRoutes: "Mes parcours",
    modeLabel: "Mode",
    learn: "Apprendre",
    teach: "Enseigner",
    signOut: "Se déconnecter",
    continue: "Continuer",
    emptyTitle: "Vous ne suivez encore aucun parcours.",
    emptyBody: "Choisissez-en un et commencez gratuitement avec son premier module.",
    exploreRoutes: "Explorer les parcours",
    exploreMore: "Explorer d'autres parcours",
    backToMyRoutes: "Retour à Mes parcours",
    teachTitle: "Enseignez ce que vous savez, en un parcours.",
    teachIntro:
      "Pour l'instant, on entre sur invitation. Dites-nous ce que vous enseignez et nous vous écrirons sous quelques jours.",
    nameLabel: "Votre nom",
    emailLabel: "Votre e-mail",
    teachesLabel: "Qu'enseignez-vous ?",
    teachesExample: "Par exemple : les maths au collège",
    linkLabel: "Où l'on vous suit",
    linkExample: "https://votre-chaine.com",
    linkHint: "Facultatif. Cela nous aide à vous connaître.",
    send: "Envoyer la demande",
    sending: "Envoi de votre demande",
    doneTitle: "Nous avons reçu votre demande.",
    doneBody: "Nous vous écrirons à {email} sous quelques jours.",
    privacy: "Nous utilisons ces données uniquement pour vous répondre.",
    fixName: "Saisissez votre nom.",
    fixEmail: "Saisissez un e-mail avec un @, comme vous@exemple.com.",
    fixTeaches: "Dites-nous ce que vous enseignez.",
    fixLink: "Saisissez une adresse web complète, avec https://, ou laissez vide.",
    checkFailed: "Nous n'avons pas pu confirmer que vous êtes une personne. Réessayez.",
    tooMany: "Trop de demandes ont été envoyées. Patientez un peu et réessayez.",
    sendFailed: "Votre demande n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.",
    needsScript: "Pour envoyer votre demande, activez JavaScript dans votre navigateur.",
  },
  it: {
    joining: "Stai per iniziare {route}",
    joiningBody: "Con {creator}. Accedi con la tua email per salvare i tuoi progressi.",
    confirmStart: "Inizia questo percorso",
    unavailableTitle: "Questo percorso non è disponibile",
    unavailableBody:
      "Forse non esiste più o non è aperto. Ci sono altri percorsi tra cui scegliere.",
    seeRoutes: "Vedi i percorsi",
    myRoutes: "I miei percorsi",
    modeLabel: "Modalità",
    learn: "Imparare",
    teach: "Insegnare",
    signOut: "Esci",
    continue: "Continua",
    emptyTitle: "Non stai ancora seguendo nessun percorso.",
    emptyBody: "Scegline uno e inizia gratis con il primo modulo.",
    exploreRoutes: "Esplora i percorsi",
    exploreMore: "Esplora altri percorsi",
    backToMyRoutes: "Torna a I miei percorsi",
    teachTitle: "Insegna ciò che sai, in un percorso.",
    teachIntro:
      "Per ora si entra su invito. Raccontaci cosa insegni e ti scriveremo entro pochi giorni.",
    nameLabel: "Il tuo nome",
    emailLabel: "La tua email",
    teachesLabel: "Cosa insegni?",
    teachesExample: "Per esempio: matematica per la scuola",
    linkLabel: "Dove ti seguono",
    linkExample: "https://il-tuo-canale.com",
    linkHint: "Facoltativo. Ci aiuta a conoscerti.",
    send: "Invia la richiesta",
    sending: "Invio della richiesta",
    doneTitle: "Abbiamo ricevuto la tua richiesta.",
    doneBody: "Ti scriveremo a {email} entro pochi giorni.",
    privacy: "Usiamo questi dati solo per risponderti.",
    fixName: "Scrivi il tuo nome.",
    fixEmail: "Scrivi un'email con la @, come tu@esempio.com.",
    fixTeaches: "Raccontaci cosa insegni.",
    fixLink: "Scrivi un indirizzo web completo, con https://, o lascia vuoto.",
    checkFailed: "Non siamo riusciti a confermare che sei una persona. Riprova.",
    tooMany: "Sono state inviate troppe richieste. Aspetta un po' e riprova.",
    sendFailed: "Non è stato possibile inviare la richiesta. Controlla la connessione e riprova.",
    needsScript: "Per inviare la richiesta, attiva JavaScript nel browser.",
  },
};
