import type { LocaleCode } from "../locales";

// The catalog's words, and what the storefront's pages share (Platform STEP 4 §3). Data
// only, so browser code may load it. Spanish is the source; a locale missing a string
// fails the types.

export interface CatalogText {
  explore: string;
  teach: string;
  signIn: string;
  title: string;
  description: string;
  searchLabel: string;
  searchExample: string;
  search: string;
  filterLabel: string;
  allTopics: string;
  firstFree: string;
  /** {creator} is the creator's name. */
  withCreator: string;
  /** {n} is the count. */
  moduleOne: string;
  moduleMany: string;
  topicOne: string;
  topicMany: string;
  /** {modules} and {topics} are the two counts in words, {language} the route's language. */
  facts: string;
  /** {search} is what the visitor typed. */
  noResults: string;
  /** {topic} is the topic's name. */
  noResultsInTopic: string;
  clearFilters: string;
  teachTitle: string;
  teachBody: string;
  teachAction: string;
  paginationLabel: string;
  previous: string;
  next: string;
  /** {page} is the page's number. */
  pageTitle: string;
}

export const CATALOG_TEXT: Record<LocaleCode, CatalogText> = {
  es: {
    explore: "Explorar rutas",
    teach: "Enseñar",
    signIn: "Entrar",
    title: "¿Qué quieres aprender?",
    description: "Rutas de quienes mejor enseñan cada tema, con el primer módulo gratis en todas.",
    searchLabel: "Buscar rutas",
    searchExample: "Inglés, cálculo, guitarra…",
    search: "Buscar",
    filterLabel: "Filtrar por tema",
    allTopics: "Todo",
    firstFree: "Todas empiezan con un módulo gratis",
    withCreator: "Con {creator}",
    moduleOne: "{n} módulo",
    moduleMany: "{n} módulos",
    topicOne: "{n} tema",
    topicMany: "{n} temas",
    facts: "{modules} y {topics}, en {language}",
    noResults: "No encontramos rutas para «{search}»",
    noResultsInTopic: "No encontramos rutas de {topic}",
    clearFilters: "Quitar los filtros",
    teachTitle: "¿Enseñas algo que sabes bien?",
    teachBody:
      "Conviértelo en una ruta con tu propia página, y véndela a tus estudiantes. Tu asistente te ayuda a armarla y tú decides cada paso.",
    teachAction: "Quiero enseñar",
    paginationLabel: "Páginas de resultados",
    previous: "Anteriores",
    next: "Siguientes",
    pageTitle: "página {page}",
  },
  en: {
    explore: "Explore routes",
    teach: "Teach",
    signIn: "Sign in",
    title: "What do you want to learn?",
    description:
      "Routes from the people who teach each subject best, each with a free first module.",
    searchLabel: "Search routes",
    searchExample: "English, calculus, guitar…",
    search: "Search",
    filterLabel: "Filter by topic",
    allTopics: "All",
    firstFree: "Every route starts with a free module",
    withCreator: "With {creator}",
    moduleOne: "{n} module",
    moduleMany: "{n} modules",
    topicOne: "{n} topic",
    topicMany: "{n} topics",
    facts: "{modules} and {topics}, in {language}",
    noResults: "We found no routes for “{search}”",
    noResultsInTopic: "We found no routes in {topic}",
    clearFilters: "Clear the filters",
    teachTitle: "Do you teach something you know well?",
    teachBody:
      "Turn it into a route with your own page, and sell it to your students. Your assistant helps you build it, and you decide every step.",
    teachAction: "I want to teach",
    paginationLabel: "Result pages",
    previous: "Previous",
    next: "Next",
    pageTitle: "page {page}",
  },
  pt: {
    explore: "Explorar rotas",
    teach: "Ensinar",
    signIn: "Entrar",
    title: "O que você quer aprender?",
    description: "Rotas de quem melhor ensina cada tema, todas com o primeiro módulo grátis.",
    searchLabel: "Buscar rotas",
    searchExample: "Inglês, cálculo, violão…",
    search: "Buscar",
    filterLabel: "Filtrar por tema",
    allTopics: "Tudo",
    firstFree: "Todas começam com um módulo grátis",
    withCreator: "Com {creator}",
    moduleOne: "{n} módulo",
    moduleMany: "{n} módulos",
    topicOne: "{n} tema",
    topicMany: "{n} temas",
    facts: "{modules} e {topics}, em {language}",
    noResults: "Não encontramos rotas para “{search}”",
    noResultsInTopic: "Não encontramos rotas de {topic}",
    clearFilters: "Limpar os filtros",
    teachTitle: "Você ensina algo que sabe bem?",
    teachBody:
      "Transforme isso em uma rota com sua própria página e venda para seus estudantes. Seu assistente ajuda a montá-la e você decide cada passo.",
    teachAction: "Quero ensinar",
    paginationLabel: "Páginas de resultados",
    previous: "Anteriores",
    next: "Próximas",
    pageTitle: "página {page}",
  },
  fr: {
    explore: "Explorer les parcours",
    teach: "Enseigner",
    signIn: "Se connecter",
    title: "Que voulez-vous apprendre ?",
    description:
      "Des parcours de celles et ceux qui enseignent le mieux chaque sujet, tous avec un premier module gratuit.",
    searchLabel: "Rechercher des parcours",
    searchExample: "Anglais, calcul, guitare…",
    search: "Rechercher",
    filterLabel: "Filtrer par thème",
    allTopics: "Tout",
    firstFree: "Tous commencent par un module gratuit",
    withCreator: "Avec {creator}",
    moduleOne: "{n} module",
    moduleMany: "{n} modules",
    topicOne: "{n} sujet",
    topicMany: "{n} sujets",
    facts: "{modules} et {topics}, en {language}",
    noResults: "Aucun parcours trouvé pour « {search} »",
    noResultsInTopic: "Aucun parcours trouvé en {topic}",
    clearFilters: "Effacer les filtres",
    teachTitle: "Vous enseignez ce que vous connaissez bien ?",
    teachBody:
      "Faites-en un parcours avec votre page, et vendez-le à vos élèves. Votre assistant vous aide à le construire, et vous décidez de chaque étape.",
    teachAction: "Je veux enseigner",
    paginationLabel: "Pages de résultats",
    previous: "Précédents",
    next: "Suivants",
    pageTitle: "page {page}",
  },
  it: {
    explore: "Esplora i percorsi",
    teach: "Insegnare",
    signIn: "Accedi",
    title: "Cosa vuoi imparare?",
    description: "Percorsi di chi insegna meglio ogni materia, tutti con il primo modulo gratis.",
    searchLabel: "Cerca percorsi",
    searchExample: "Inglese, calcolo, chitarra…",
    search: "Cerca",
    filterLabel: "Filtra per tema",
    allTopics: "Tutto",
    firstFree: "Tutti iniziano con un modulo gratis",
    withCreator: "Con {creator}",
    moduleOne: "{n} modulo",
    moduleMany: "{n} moduli",
    topicOne: "{n} argomento",
    topicMany: "{n} argomenti",
    facts: "{modules} e {topics}, in {language}",
    noResults: "Nessun percorso trovato per «{search}»",
    noResultsInTopic: "Nessun percorso trovato in {topic}",
    clearFilters: "Togli i filtri",
    teachTitle: "Insegni qualcosa che conosci bene?",
    teachBody:
      "Trasformalo in un percorso con la tua pagina, e vendilo ai tuoi studenti. Il tuo assistente ti aiuta a costruirlo e tu decidi ogni passo.",
    teachAction: "Voglio insegnare",
    paginationLabel: "Pagine dei risultati",
    previous: "Precedenti",
    next: "Successivi",
    pageTitle: "pagina {page}",
  },
};

/** A locale's name in a page's language, lower case as it reads mid-sentence. */
export const LANGUAGE_NAMES: Record<LocaleCode, Record<LocaleCode, string>> = {
  es: { es: "español", en: "inglés", pt: "portugués", fr: "francés", it: "italiano" },
  en: { es: "Spanish", en: "English", pt: "Portuguese", fr: "French", it: "Italian" },
  pt: { es: "espanhol", en: "inglês", pt: "português", fr: "francês", it: "italiano" },
  fr: { es: "espagnol", en: "anglais", pt: "portugais", fr: "français", it: "italien" },
  it: { es: "spagnolo", en: "inglese", pt: "portoghese", fr: "francese", it: "italiano" },
};
