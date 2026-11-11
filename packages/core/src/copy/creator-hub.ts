import { BRAND, type LocaleCode } from "../locales";

// "Enseñar", the creator's hub. Spanish is the source. pt, fr and it: Pending native review.

export interface CreatorHubText {
  title: string;
  publicPage: string;
  noTagline: string;
  yourRoutes: string;
  draft: string;
  published: string;
  viewPublic: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  noSpaceTitle: string;
  noSpaceBody: string;
  connectBody: string;
  connectionsBody: string;
  admin: string;
  adminBody: string;
  previewBand: string;
  previewOutline: string;
  previewEmpty: string;
  preview: string;
  publish: string;
  /** On a route already out: puts its latest changes on the public page. */
  republish: string;
  published_ok: string;
  publishFailed: string;
  priceTitle: string;
  priceLabel: string;
  priceCurrency: string;
  priceSave: string;
  priceSaved: string;
  priceNote: string;
  priceCurrent: string;
  askCatalog: string;
  catalogAsked: string;
  catalogRefused: string;
  editPage: string;
  emptySteps: readonly [string, string, string, string];
}

export const CREATOR_HUB_TEXT: Record<LocaleCode, CreatorHubText> = {
  es: {
    title: "Enseñar",
    publicPage: "Tu página pública",
    noTagline: "Tu página aún no tiene una frase. Pídele a tu asistente que escriba una.",
    yourRoutes: "Tus rutas",
    draft: "Borrador",
    published: "Publicada",
    viewPublic: "Ver página pública",
    emptyTitle: "Trae una ruta que ya hiciste",
    emptyBody:
      "Conéctalo y pídele: «Convierte estas notas en una ruta de tres módulos, como borrador». Nada se publica hasta que lo pidas.",
    emptyAction: "Conecta tu asistente",
    noSpaceTitle: "Aún no tienes un espacio",
    noSpaceBody: "Cuéntanos qué quieres enseñar y te enviamos una invitación.",
    connectBody: "La dirección y los pasos para Claude, ChatGPT y Gemini.",
    connectionsBody: "Los asistentes con acceso a tu cuenta, y cómo desconectarlos.",
    admin: "Administración",
    adminBody: "Solicitudes y catálogo.",
    previewBand: "Vista previa del borrador",
    previewOutline: "Temas de la ruta",
    previewEmpty: "Este borrador todavía no tiene temas.",
    preview: "Vista previa",
    publish: "Publicar",
    republish: "Publicar cambios",
    published_ok: "Publicada.",
    publishFailed: "No se pudo publicar. Abre la vista previa y revisa que tenga temas.",
    priceTitle: "Precio",
    priceLabel: "Precio",
    priceCurrency: "Moneda",
    priceSave: "Guardar precio",
    priceSaved: "Precio guardado; el cobro se activa pronto.",
    priceNote: "Tus estudiantes siguen entrando gratis hasta que el cobro esté activo.",
    priceCurrent: "Precio guardado: {price}",
    askCatalog: "Pedir entrar al catálogo",
    catalogAsked: "Pedido enviado. Lo revisaremos pronto.",
    catalogRefused: "Publica la ruta primero; solo así puede entrar al catálogo.",
    editPage: "Editar tu página",
    emptySteps: [
      "Conecta tu asistente en Claude, ChatGPT o donde hiciste el curso.",
      `Dile: «Sube este documento a ${BRAND} tal como está».`,
      "Abre la vista previa y, cuando te guste, publícala.",
      "¿Hiciste algo interactivo, como un juego o un simulador? Pídele a tu asistente que lo suba tal cual.",
    ] as const,
  },
  en: {
    title: "Teach",
    publicPage: "Your public page",
    noTagline: "Your page has no line yet. Ask your assistant to write one.",
    yourRoutes: "Your routes",
    draft: "Draft",
    published: "Published",
    viewPublic: "View public page",
    emptyTitle: "Bring a route you already made",
    emptyBody:
      'Connect it and ask: "Turn these notes into a three-module route, as a draft." Nothing is published until you ask.',
    emptyAction: "Connect your assistant",
    noSpaceTitle: "You don't have a space yet",
    noSpaceBody: "Tell us what you'd like to teach and we'll send you an invitation.",
    connectBody: "The address and the steps for Claude, ChatGPT and Gemini.",
    connectionsBody: "The assistants with access to your account, and how to disconnect them.",
    admin: "Admin",
    adminBody: "Applications and the catalog.",
    previewBand: "Draft preview",
    previewOutline: "The route's topics",
    previewEmpty: "This draft has no topics yet.",
    preview: "Preview",
    publish: "Publish",
    republish: "Publish changes",
    published_ok: "Published.",
    publishFailed: "It couldn't be published. Open the preview and check it has topics.",
    priceTitle: "Price",
    priceLabel: "Price",
    priceCurrency: "Currency",
    priceSave: "Save price",
    priceSaved: "Price saved; payments arrive soon.",
    priceNote: "Your students keep starting free until payments are on.",
    priceCurrent: "Price saved: {price}",
    askCatalog: "Ask to join the catalog",
    catalogAsked: "Request sent. We'll review it soon.",
    catalogRefused: "Publish the route first: only then can it join the catalog.",
    editPage: "Edit your page",
    emptySteps: [
      "Connect your assistant in Claude, ChatGPT or wherever you made the course.",
      `Tell it: "Upload this document to ${BRAND} as it is."`,
      "Open the preview and, when you like it, publish it.",
      "Made something interactive, like a game or a simulator? Ask your assistant to upload it as it is.",
    ] as const,
  },
  pt: {
    title: "Ensinar",
    publicPage: "Sua página pública",
    noTagline: "Sua página ainda não tem uma frase. Peça ao seu assistente para escrever uma.",
    yourRoutes: "Suas rotas",
    draft: "Rascunho",
    published: "Publicada",
    viewPublic: "Ver página pública",
    emptyTitle: "Traga uma rota que você já fez",
    emptyBody:
      "Conecte-o e peça: «Transforme estas notas em uma rota de três módulos, como rascunho». Nada é publicado até você pedir.",
    emptyAction: "Conecte seu assistente",
    noSpaceTitle: "Você ainda não tem um espaço",
    noSpaceBody: "Conte o que quer ensinar e enviaremos um convite.",
    connectBody: "O endereço e os passos para Claude, ChatGPT e Gemini.",
    connectionsBody: "Os assistentes com acesso à sua conta, e como desconectá-los.",
    admin: "Administração",
    adminBody: "Pedidos e catálogo.",
    previewBand: "Prévia do rascunho",
    previewOutline: "Temas da rota",
    previewEmpty: "Este rascunho ainda não tem temas.",
    preview: "Prévia",
    publish: "Publicar",
    republish: "Publicar alterações",
    published_ok: "Publicada.",
    publishFailed: "Não foi possível publicar. Abra a prévia e confira se há temas.",
    priceTitle: "Preço",
    priceLabel: "Preço",
    priceCurrency: "Moeda",
    priceSave: "Salvar preço",
    priceSaved: "Preço salvo; a cobrança chega em breve.",
    priceNote: "Seus alunos continuam entrando grátis até a cobrança estar ativa.",
    priceCurrent: "Preço salvo: {price}",
    askCatalog: "Pedir para entrar no catálogo",
    catalogAsked: "Pedido enviado. Vamos revisar em breve.",
    catalogRefused: "Publique a rota primeiro: só assim ela pode entrar no catálogo.",
    editPage: "Editar sua página",
    emptySteps: [
      "Conecte seu assistente no Claude, ChatGPT ou onde fez o curso.",
      `Diga: «Envie este documento ao ${BRAND} como está».`,
      "Abra a prévia e, quando gostar, publique.",
      "Fez algo interativo, como um jogo ou um simulador? Peça ao seu assistente que o envie tal como está.",
    ] as const,
  },
  fr: {
    title: "Enseigner",
    publicPage: "Votre page publique",
    noTagline: "Votre page n'a pas encore de phrase. Demandez à votre assistant d'en écrire une.",
    yourRoutes: "Vos parcours",
    draft: "Brouillon",
    published: "Publié",
    viewPublic: "Voir la page publique",
    emptyTitle: "Apportez un parcours que vous avez déjà fait",
    emptyBody:
      "Connectez-le et demandez : « Transforme ces notes en un parcours de trois modules, en brouillon. » Rien n'est publié sans votre demande.",
    emptyAction: "Connecter votre assistant",
    noSpaceTitle: "Vous n'avez pas encore d'espace",
    noSpaceBody: "Dites-nous ce que vous voulez enseigner et nous vous enverrons une invitation.",
    connectBody: "L'adresse et les étapes pour Claude, ChatGPT et Gemini.",
    connectionsBody: "Les assistants ayant accès à votre compte, et comment les déconnecter.",
    admin: "Administration",
    adminBody: "Demandes et catalogue.",
    previewBand: "Aperçu du brouillon",
    previewOutline: "Sujets du parcours",
    previewEmpty: "Ce brouillon n'a pas encore de sujets.",
    preview: "Aperçu",
    publish: "Publier",
    republish: "Publier les modifications",
    published_ok: "Publié.",
    publishFailed: "Impossible de publier. Ouvrez l'aperçu et vérifiez qu'il y a des sujets.",
    priceTitle: "Prix",
    priceLabel: "Prix",
    priceCurrency: "Devise",
    priceSave: "Enregistrer le prix",
    priceSaved: "Prix enregistré ; le paiement arrive bientôt.",
    priceNote:
      "Vos élèves continuent de commencer gratuitement tant que le paiement n'est pas actif.",
    priceCurrent: "Prix enregistré : {price}",
    askCatalog: "Demander à entrer au catalogue",
    catalogAsked: "Demande envoyée. Nous la verrons bientôt.",
    catalogRefused: "Publiez d'abord le parcours : c'est la condition pour entrer au catalogue.",
    editPage: "Modifier votre page",
    emptySteps: [
      "Connectez votre assistant dans Claude, ChatGPT ou là où vous avez fait le cours.",
      `Dites-lui : « Envoie ce document à ${BRAND} tel quel. »`,
      "Ouvrez l'aperçu et, quand il vous plaît, publiez-le.",
      "Vous avez fait quelque chose d'interactif, comme un jeu ou un simulateur ? Demandez à votre assistant de l'envoyer tel quel.",
    ] as const,
  },
  it: {
    title: "Insegnare",
    publicPage: "La tua pagina pubblica",
    noTagline: "La tua pagina non ha ancora una frase. Chiedi al tuo assistente di scriverne una.",
    yourRoutes: "I tuoi percorsi",
    draft: "Bozza",
    published: "Pubblicato",
    viewPublic: "Vedi la pagina pubblica",
    emptyTitle: "Porta un percorso che hai già fatto",
    emptyBody:
      "Collegalo e chiedi: «Trasforma questi appunti in un percorso di tre moduli, come bozza». Niente viene pubblicato finché non lo chiedi.",
    emptyAction: "Collega il tuo assistente",
    noSpaceTitle: "Non hai ancora uno spazio",
    noSpaceBody: "Dicci cosa vuoi insegnare e ti invieremo un invito.",
    connectBody: "L'indirizzo e i passaggi per Claude, ChatGPT e Gemini.",
    connectionsBody: "Gli assistenti con accesso al tuo account, e come scollegarli.",
    admin: "Amministrazione",
    adminBody: "Richieste e catalogo.",
    previewBand: "Anteprima della bozza",
    previewOutline: "Argomenti del percorso",
    previewEmpty: "Questa bozza non ha ancora argomenti.",
    preview: "Anteprima",
    publish: "Pubblica",
    republish: "Pubblica le modifiche",
    published_ok: "Pubblicato.",
    publishFailed:
      "Non è stato possibile pubblicare. Apri l'anteprima e controlla che ci siano argomenti.",
    priceTitle: "Prezzo",
    priceLabel: "Prezzo",
    priceCurrency: "Valuta",
    priceSave: "Salva il prezzo",
    priceSaved: "Prezzo salvato; i pagamenti arrivano presto.",
    priceNote: "I tuoi studenti continuano a iniziare gratis finché i pagamenti non sono attivi.",
    priceCurrent: "Prezzo salvato: {price}",
    askCatalog: "Chiedi di entrare nel catalogo",
    catalogAsked: "Richiesta inviata. La vedremo presto.",
    catalogRefused: "Pubblica prima il percorso: solo così può entrare nel catalogo.",
    editPage: "Modifica la tua pagina",
    emptySteps: [
      "Collega il tuo assistente in Claude, ChatGPT o dove hai fatto il corso.",
      `Digli: «Carica questo documento su ${BRAND} così com'è».`,
      "Apri l'anteprima e, quando ti piace, pubblicala.",
      "Hai fatto qualcosa di interattivo, come un gioco o un simulatore? Chiedi al tuo assistente di caricarlo così com'è.",
    ] as const,
  },
};
