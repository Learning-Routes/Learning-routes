import { BRAND, type LocaleCode } from "../locales";
import type { RouteLevel } from "./route-facts";

// The words of a creator's page and a route's page (Platform STEP 4 §5), from v2's
// Vitrina and Ruta. Data only. Spanish is the source; a locale missing a string fails
// the types.

export interface CreatorText {
  routes: string;
  signIn: string;
  seeRoutes: string;
  freeLine: string;
  /** {name} is the creator's. */
  routesOf: string;
  firstModuleFree: string;
  noRoutes: string;
  madeWith: string;
  journey: string;
  /** {n} is the module's number. */
  moduleNumber: string;
  seeRoute: string;
  /** {creator} is the route's creator. */
  routeBy: string;
  free: string;
  finalExam: string;
  startTitle: string;
  startFree: string;
  /** {price} is the route's price, already written out. */
  startPaid: string;
  start: string;
  startNote: string;
  /** {language} is the route's language. */
  inLanguage: string;
  levels: Record<RouteLevel, string>;
}

export const CREATOR_TEXT: Record<LocaleCode, CreatorText> = {
  es: {
    routes: "Rutas",
    signIn: "Entrar",
    seeRoutes: "Ver las rutas",
    freeLine: "Empiezas gratis con el primer módulo.",
    routesOf: "Rutas",
    firstModuleFree: "El primer módulo es gratis",
    noRoutes: "Pronto habrá rutas aquí.",
    madeWith: `Hecho con ${BRAND}`,
    journey: "El recorrido",
    moduleNumber: "Módulo {n}",
    seeRoute: "Ver la ruta",
    routeBy: "Una ruta de {creator}",
    free: "Gratis",
    finalExam: "Examen final",
    startTitle: "Empieza gratis, hoy.",
    startFree: "El módulo 1 completo es gratis.",
    startPaid:
      "El módulo 1 completo es gratis. Si quieres seguir, pagas una vez por la ruta: {price}.",
    start: "Empezar gratis",
    startNote:
      "Entras con tu correo, sin contraseña. Tu avance queda guardado en el teléfono y en la computadora.",
    inLanguage: "En {language}.",
    levels: {
      inicial: "Para empezar desde cero.",
      intermedio: "Si ya tienes una base.",
      avanzado: "Si ya dominas lo básico.",
    },
  },
  en: {
    routes: "Routes",
    signIn: "Sign in",
    seeRoutes: "See the routes",
    freeLine: "You start free, with the first module.",
    routesOf: "Routes",
    firstModuleFree: "The first module is free",
    noRoutes: "Routes will be here soon.",
    madeWith: `Made with ${BRAND}`,
    journey: "The journey",
    moduleNumber: "Module {n}",
    seeRoute: "See the route",
    routeBy: "A route by {creator}",
    free: "Free",
    finalExam: "Final exam",
    startTitle: "Start free, today.",
    startFree: "All of module 1 is free.",
    startPaid: "All of module 1 is free. To continue, you pay once for the route: {price}.",
    start: "Start free",
    startNote:
      "You sign in with your email, no password. Your progress is saved on your phone and your computer.",
    inLanguage: "In {language}.",
    levels: {
      inicial: "For starting from zero.",
      intermedio: "If you already have a base.",
      avanzado: "If you already know the basics.",
    },
  },
  pt: {
    routes: "Rotas",
    signIn: "Entrar",
    seeRoutes: "Ver as rotas",
    freeLine: "Você começa grátis, com o primeiro módulo.",
    routesOf: "Rotas",
    firstModuleFree: "O primeiro módulo é grátis",
    noRoutes: "Em breve haverá rotas aqui.",
    madeWith: `Feito com ${BRAND}`,
    journey: "O percurso",
    // Pending native review.
    moduleNumber: "Módulo {n}",
    seeRoute: "Ver a rota",
    routeBy: "Uma rota de {creator}",
    free: "Grátis",
    finalExam: "Prova final",
    startTitle: "Comece grátis, hoje.",
    startFree: "O módulo 1 inteiro é grátis.",
    startPaid: "O módulo 1 inteiro é grátis. Para continuar, você paga uma vez pela rota: {price}.",
    start: "Começar grátis",
    startNote:
      "Você entra com seu e-mail, sem senha. Seu avanço fica salvo no celular e no computador.",
    inLanguage: "Em {language}.",
    levels: {
      inicial: "Para começar do zero.",
      intermedio: "Se você já tem uma base.",
      avanzado: "Se você já domina o básico.",
    },
  },
  fr: {
    routes: "Parcours",
    signIn: "Se connecter",
    seeRoutes: "Voir les parcours",
    freeLine: "Vous commencez gratuitement, avec le premier module.",
    routesOf: "Parcours",
    firstModuleFree: "Le premier module est gratuit",
    noRoutes: "Des parcours arriveront bientôt ici.",
    madeWith: `Fait avec ${BRAND}`,
    journey: "Le trajet",
    // Pending native review.
    moduleNumber: "Module {n}",
    seeRoute: "Voir le parcours",
    routeBy: "Un parcours de {creator}",
    free: "Gratuit",
    finalExam: "Examen final",
    startTitle: "Commencez gratuitement, aujourd'hui.",
    startFree: "Tout le module 1 est gratuit.",
    startPaid:
      "Tout le module 1 est gratuit. Pour continuer, vous payez une fois le parcours : {price}.",
    start: "Commencer gratuitement",
    startNote:
      "Vous vous connectez avec votre e-mail, sans mot de passe. Votre progression est enregistrée sur votre téléphone et votre ordinateur.",
    inLanguage: "En {language}.",
    levels: {
      inicial: "Pour partir de zéro.",
      intermedio: "Si vous avez déjà des bases.",
      avanzado: "Si vous maîtrisez déjà l'essentiel.",
    },
  },
  it: {
    routes: "Percorsi",
    signIn: "Accedi",
    seeRoutes: "Vedi i percorsi",
    freeLine: "Inizi gratis, con il primo modulo.",
    routesOf: "Percorsi",
    firstModuleFree: "Il primo modulo è gratis",
    noRoutes: "Presto qui ci saranno dei percorsi.",
    madeWith: `Fatto con ${BRAND}`,
    journey: "Il tragitto",
    // Pending native review.
    moduleNumber: "Modulo {n}",
    seeRoute: "Vedi il percorso",
    routeBy: "Un percorso di {creator}",
    free: "Gratis",
    finalExam: "Esame finale",
    startTitle: "Inizia gratis, oggi.",
    startFree: "Tutto il modulo 1 è gratis.",
    startPaid: "Tutto il modulo 1 è gratis. Per continuare, paghi una volta il percorso: {price}.",
    start: "Inizia gratis",
    startNote:
      "Accedi con la tua email, senza password. I tuoi progressi restano salvati sul telefono e sul computer.",
    inLanguage: "In {language}.",
    levels: {
      inicial: "Per partire da zero.",
      intermedio: "Se hai già una base.",
      avanzado: "Se conosci già le basi.",
    },
  },
};
