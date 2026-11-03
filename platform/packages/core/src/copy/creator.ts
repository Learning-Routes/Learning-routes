import { BRAND, type LocaleCode } from "../locales";
import type { RouteLevel } from "./route-facts";

// The words of a creator's page and a route's page (Platform STEP 4 §5), from v2's
// Vitrina and Ruta. Data only. Spanish is the source; a locale missing a string fails
// the types.

export interface CreatorText {
  routes: string;
  about: string;
  signIn: string;
  seeRoutes: string;
  freeLine: string;
  /** {name} is the creator's. */
  routesOf: string;
  firstModuleFree: string;
  noRoutes: string;
  madeWith: string;
  journey: string;
  /** {n} is the module's number, {title} its title. */
  moduleTitle: string;
  free: string;
  finalExam: string;
  howTitle: string;
  howBody: string;
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
    about: "Sobre mí",
    signIn: "Entrar",
    seeRoutes: "Ver mis rutas",
    freeLine: "Empiezas gratis con el primer módulo.",
    routesOf: "Mis rutas",
    firstModuleFree: "El primer módulo es gratis",
    noRoutes: "Pronto habrá rutas aquí.",
    madeWith: `Hecho con ${BRAND}`,
    journey: "El recorrido",
    moduleTitle: "Módulo {n}: {title}",
    free: "Gratis",
    finalExam: "Examen final",
    howTitle: "Cómo se aprende aquí",
    howBody:
      "Temas cortos, con práctica y una pregunta cada uno. Si una pregunta cuesta, aparece práctica extra justo ahí. Lo aprendido vuelve en repasos cortos, antes de que se olvide.",
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
    about: "About me",
    signIn: "Sign in",
    seeRoutes: "See my routes",
    freeLine: "You start free, with the first module.",
    routesOf: "My routes",
    firstModuleFree: "The first module is free",
    noRoutes: "Routes will be here soon.",
    madeWith: `Made with ${BRAND}`,
    journey: "The journey",
    moduleTitle: "Module {n}: {title}",
    free: "Free",
    finalExam: "Final exam",
    howTitle: "How you learn here",
    howBody:
      "Short topics, each with practice and a question. If a question is hard, extra practice appears right there. What you learned comes back in short reviews, before you forget it.",
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
    about: "Sobre mim",
    signIn: "Entrar",
    seeRoutes: "Ver minhas rotas",
    freeLine: "Você começa grátis, com o primeiro módulo.",
    routesOf: "Minhas rotas",
    firstModuleFree: "O primeiro módulo é grátis",
    noRoutes: "Em breve haverá rotas aqui.",
    madeWith: `Feito com ${BRAND}`,
    journey: "O percurso",
    moduleTitle: "Módulo {n}: {title}",
    free: "Grátis",
    finalExam: "Prova final",
    howTitle: "Como se aprende aqui",
    howBody:
      "Temas curtos, cada um com prática e uma pergunta. Se uma pergunta pesar, aparece prática extra ali mesmo. O que você aprendeu volta em revisões curtas, antes de esquecer.",
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
    about: "À propos",
    signIn: "Se connecter",
    seeRoutes: "Voir mes parcours",
    freeLine: "Vous commencez gratuitement, avec le premier module.",
    routesOf: "Mes parcours",
    firstModuleFree: "Le premier module est gratuit",
    noRoutes: "Des parcours arriveront bientôt ici.",
    madeWith: `Fait avec ${BRAND}`,
    journey: "Le trajet",
    moduleTitle: "Module {n} : {title}",
    free: "Gratuit",
    finalExam: "Examen final",
    howTitle: "Comment on apprend ici",
    howBody:
      "Des sujets courts, chacun avec de la pratique et une question. Si une question est difficile, une pratique supplémentaire apparaît juste là. Ce que vous avez appris revient dans de courtes révisions, avant de l'oublier.",
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
    about: "Chi sono",
    signIn: "Accedi",
    seeRoutes: "Vedi i miei percorsi",
    freeLine: "Inizi gratis, con il primo modulo.",
    routesOf: "I miei percorsi",
    firstModuleFree: "Il primo modulo è gratis",
    noRoutes: "Presto qui ci saranno dei percorsi.",
    madeWith: `Fatto con ${BRAND}`,
    journey: "Il tragitto",
    moduleTitle: "Modulo {n}: {title}",
    free: "Gratis",
    finalExam: "Esame finale",
    howTitle: "Come si impara qui",
    howBody:
      "Argomenti brevi, ognuno con pratica e una domanda. Se una domanda è difficile, la pratica extra appare proprio lì. Ciò che hai imparato torna in brevi ripassi, prima che tu lo dimentichi.",
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
