import type { LocaleCode } from "../locales";

// The words of Mis rutas (docs/design/reference/vision/pages.html). Data only. Spanish is the
// source; a locale missing a string fails the types.

export interface MyRoutesText {
  explore: string;
  /** {name} is the student's. */
  hello: string;
  carryOn: string;
  /** {n} is the topic's number, {title} its title. */
  topicTitle: string;
  /** {route} is the route, {creator} who made it. */
  routeWith: string;
  /** {n} is the topic's number, {total} how many the route has. */
  onTopic: string;
  yourRoutes: string;
  routeFinished: string;
  review: string;
}

export const MY_ROUTES_TEXT: Record<LocaleCode, MyRoutesText> = {
  es: {
    explore: "Explorar",
    hello: "Hola, {name}.",
    carryOn: "Sigues donde lo dejaste",
    topicTitle: "Tema {n}: {title}",
    routeWith: "{route}, con {creator}.",
    onTopic: "Vas en el tema {n} de {total}.",
    yourRoutes: "Tus rutas",
    routeFinished: "Ruta terminada.",
    review: "Repasar",
  },
  en: {
    explore: "Explore",
    hello: "Hi, {name}.",
    carryOn: "Pick up where you left off",
    topicTitle: "Topic {n}: {title}",
    routeWith: "{route}, with {creator}.",
    onTopic: "You are on topic {n} of {total}.",
    yourRoutes: "Your routes",
    routeFinished: "Route finished.",
    review: "Review",
  },
  pt: {
    // Pending native review.
    explore: "Explorar",
    hello: "Olá, {name}.",
    carryOn: "Continue de onde parou",
    topicTitle: "Tema {n}: {title}",
    routeWith: "{route}, com {creator}.",
    onTopic: "Você está no tema {n} de {total}.",
    yourRoutes: "Suas rotas",
    routeFinished: "Rota concluída.",
    review: "Revisar",
  },
  fr: {
    // Pending native review.
    explore: "Explorer",
    hello: "Bonjour, {name}.",
    carryOn: "Reprenez là où vous en étiez",
    topicTitle: "Sujet {n} : {title}",
    routeWith: "{route}, avec {creator}.",
    onTopic: "Vous en êtes au sujet {n} sur {total}.",
    yourRoutes: "Vos parcours",
    routeFinished: "Parcours terminé.",
    review: "Réviser",
  },
  it: {
    // Pending native review.
    explore: "Esplora",
    hello: "Ciao, {name}.",
    carryOn: "Riprendi da dove eri rimasto",
    topicTitle: "Argomento {n}: {title}",
    routeWith: "{route}, con {creator}.",
    onTopic: "Sei all'argomento {n} di {total}.",
    yourRoutes: "I tuoi percorsi",
    routeFinished: "Percorso completato.",
    review: "Ripassa",
  },
};
