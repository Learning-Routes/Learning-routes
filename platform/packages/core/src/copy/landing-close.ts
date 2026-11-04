import type { LocaleCode } from "../locales";

// The landing's closing sheet (Platform STEP 6 §2): the field searches the catalog. Data
// only. A locale missing a string fails the types.

export interface CloseText {
  title: string;
  line: string;
  label: string;
  placeholder: string;
  button: string;
  ideasLabel: string;
  ideasGroup: string;
  figureTitle: string;
  figureLine: string;
}

export const CLOSE_TEXT: Record<LocaleCode, CloseText> = {
  es: {
    title: "¿Qué quieres aprender?",
    line: "Escríbelo con tus palabras y te mostramos las rutas de quienes lo enseñan.",
    label: "Qué quieres aprender",
    placeholder: "Por ejemplo: inglés para el trabajo",
    button: "Buscar rutas",
    ideasLabel: "Ideas:",
    ideasGroup: "Ideas para empezar",
    figureTitle: "Así se ve una ruta.",
    figureLine: "Módulos en orden, cada uno con sus temas. El primer módulo es gratis.",
  },
  en: {
    title: "What do you want to learn?",
    line: "Say it in your own words, and we'll show you the routes from the people who teach it.",
    label: "What you want to learn",
    placeholder: "For example: English for work",
    button: "Search routes",
    ideasLabel: "Ideas:",
    ideasGroup: "Ideas to start with",
    figureTitle: "This is what a route looks like.",
    figureLine: "Modules in order, each with its topics. The first module is free.",
  },
  pt: {
    title: "O que você quer aprender?",
    line: "Escreva com suas palavras, e mostramos as rotas de quem ensina isso.",
    label: "O que você quer aprender",
    placeholder: "Por exemplo: inglês para o trabalho",
    button: "Buscar rotas",
    ideasLabel: "Ideias:",
    ideasGroup: "Ideias para começar",
    figureTitle: "É assim que uma rota se parece.",
    figureLine: "Módulos em ordem, cada um com seus temas. O primeiro módulo é grátis.",
  },
  fr: {
    title: "Que voulez-vous apprendre ?",
    line: "Dites-le avec vos mots, et nous vous montrons les parcours de celles et ceux qui l'enseignent.",
    label: "Ce que vous voulez apprendre",
    placeholder: "Par exemple : l'anglais pour le travail",
    button: "Chercher des parcours",
    ideasLabel: "Idées :",
    ideasGroup: "Idées pour commencer",
    figureTitle: "Voici à quoi ressemble un parcours.",
    figureLine: "Des modules dans l'ordre, chacun avec ses sujets. Le premier module est gratuit.",
  },
  it: {
    title: "Che cosa vuoi imparare?",
    line: "Scrivilo con parole tue e ti mostriamo i percorsi di chi lo insegna.",
    label: "Che cosa vuoi imparare",
    placeholder: "Per esempio: inglese per il lavoro",
    button: "Cerca percorsi",
    ideasLabel: "Idee:",
    ideasGroup: "Idee per iniziare",
    figureTitle: "Ecco come appare un percorso.",
    figureLine: "Moduli in ordine, ciascuno con i suoi argomenti. Il primo modulo è gratis.",
  },
};
