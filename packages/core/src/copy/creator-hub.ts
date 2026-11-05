import type { LocaleCode } from "../locales";

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
    emptyTitle: "Tu primera ruta empieza con tu asistente",
    emptyBody:
      "Conéctalo y pídele: «Convierte estas notas en una ruta de tres módulos, como borrador». Nada se publica hasta que lo pidas.",
    emptyAction: "Conecta tu asistente",
    noSpaceTitle: "Aún no tienes un espacio",
    noSpaceBody: "Cuéntanos qué quieres enseñar y te enviamos una invitación.",
    connectBody: "La dirección y los pasos para Claude, ChatGPT y Gemini.",
    connectionsBody: "Los asistentes con acceso a tu cuenta, y cómo desconectarlos.",
    admin: "Administración",
    adminBody: "Solicitudes y catálogo.",
  },
  en: {
    title: "Teach",
    publicPage: "Your public page",
    noTagline: "Your page has no line yet. Ask your assistant to write one.",
    yourRoutes: "Your routes",
    draft: "Draft",
    published: "Published",
    viewPublic: "View public page",
    emptyTitle: "Your first route starts with your assistant",
    emptyBody:
      'Connect it and ask: "Turn these notes into a three-module route, as a draft." Nothing is published until you ask.',
    emptyAction: "Connect your assistant",
    noSpaceTitle: "You don't have a space yet",
    noSpaceBody: "Tell us what you'd like to teach and we'll send you an invitation.",
    connectBody: "The address and the steps for Claude, ChatGPT and Gemini.",
    connectionsBody: "The assistants with access to your account, and how to disconnect them.",
    admin: "Admin",
    adminBody: "Applications and the catalog.",
  },
  pt: {
    title: "Ensinar",
    publicPage: "Sua página pública",
    noTagline: "Sua página ainda não tem uma frase. Peça ao seu assistente para escrever uma.",
    yourRoutes: "Suas rotas",
    draft: "Rascunho",
    published: "Publicada",
    viewPublic: "Ver página pública",
    emptyTitle: "Sua primeira rota começa com seu assistente",
    emptyBody:
      "Conecte-o e peça: «Transforme estas notas em uma rota de três módulos, como rascunho». Nada é publicado até você pedir.",
    emptyAction: "Conecte seu assistente",
    noSpaceTitle: "Você ainda não tem um espaço",
    noSpaceBody: "Conte o que quer ensinar e enviaremos um convite.",
    connectBody: "O endereço e os passos para Claude, ChatGPT e Gemini.",
    connectionsBody: "Os assistentes com acesso à sua conta, e como desconectá-los.",
    admin: "Administração",
    adminBody: "Pedidos e catálogo.",
  },
  fr: {
    title: "Enseigner",
    publicPage: "Votre page publique",
    noTagline: "Votre page n'a pas encore de phrase. Demandez à votre assistant d'en écrire une.",
    yourRoutes: "Vos parcours",
    draft: "Brouillon",
    published: "Publié",
    viewPublic: "Voir la page publique",
    emptyTitle: "Votre premier parcours commence avec votre assistant",
    emptyBody:
      "Connectez-le et demandez : « Transforme ces notes en un parcours de trois modules, en brouillon. » Rien n'est publié sans votre demande.",
    emptyAction: "Connecter votre assistant",
    noSpaceTitle: "Vous n'avez pas encore d'espace",
    noSpaceBody: "Dites-nous ce que vous voulez enseigner et nous vous enverrons une invitation.",
    connectBody: "L'adresse et les étapes pour Claude, ChatGPT et Gemini.",
    connectionsBody: "Les assistants ayant accès à votre compte, et comment les déconnecter.",
    admin: "Administration",
    adminBody: "Demandes et catalogue.",
  },
  it: {
    title: "Insegnare",
    publicPage: "La tua pagina pubblica",
    noTagline: "La tua pagina non ha ancora una frase. Chiedi al tuo assistente di scriverne una.",
    yourRoutes: "I tuoi percorsi",
    draft: "Bozza",
    published: "Pubblicato",
    viewPublic: "Vedi la pagina pubblica",
    emptyTitle: "Il tuo primo percorso inizia con il tuo assistente",
    emptyBody:
      "Collegalo e chiedi: «Trasforma questi appunti in un percorso di tre moduli, come bozza». Niente viene pubblicato finché non lo chiedi.",
    emptyAction: "Collega il tuo assistente",
    noSpaceTitle: "Non hai ancora uno spazio",
    noSpaceBody: "Dicci cosa vuoi insegnare e ti invieremo un invito.",
    connectBody: "L'indirizzo e i passaggi per Claude, ChatGPT e Gemini.",
    connectionsBody: "Gli assistenti con accesso al tuo account, e come scollegarli.",
    admin: "Amministrazione",
    adminBody: "Richieste e catalogo.",
  },
};
