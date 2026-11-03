import type { LocaleCode } from "../locales";

// A route's topic and level (Platform STEP 4 §2.2), and how each reads in every locale.
// Data only, so browser code may load it. The values go in the database and in URLs, so
// they carry no accents. A locale missing a name fails the types.

export const ROUTE_TOPICS = [
  "idiomas",
  "matematicas",
  "programacion",
  "ciencias",
  "musica",
  "negocios",
  "arte",
  "otros",
] as const;
export type RouteTopic = (typeof ROUTE_TOPICS)[number];

export const ROUTE_LEVELS = ["inicial", "intermedio", "avanzado"] as const;
export type RouteLevel = (typeof ROUTE_LEVELS)[number];

export const TOPIC_NAMES: Record<LocaleCode, Record<RouteTopic, string>> = {
  es: {
    idiomas: "Idiomas",
    matematicas: "Matemáticas",
    programacion: "Programación",
    ciencias: "Ciencias",
    musica: "Música",
    negocios: "Negocios",
    arte: "Arte",
    otros: "Otros",
  },
  en: {
    idiomas: "Languages",
    matematicas: "Math",
    programacion: "Programming",
    ciencias: "Science",
    musica: "Music",
    negocios: "Business",
    arte: "Art",
    otros: "Other",
  },
  pt: {
    idiomas: "Idiomas",
    matematicas: "Matemática",
    programacion: "Programação",
    ciencias: "Ciências",
    musica: "Música",
    negocios: "Negócios",
    arte: "Arte",
    otros: "Outros",
  },
  fr: {
    idiomas: "Langues",
    matematicas: "Mathématiques",
    programacion: "Programmation",
    ciencias: "Sciences",
    musica: "Musique",
    negocios: "Commerce",
    arte: "Art",
    otros: "Autres",
  },
  it: {
    idiomas: "Lingue",
    matematicas: "Matematica",
    programacion: "Programmazione",
    ciencias: "Scienze",
    musica: "Musica",
    negocios: "Economia",
    arte: "Arte",
    otros: "Altro",
  },
};

export const LEVEL_NAMES: Record<LocaleCode, Record<RouteLevel, string>> = {
  es: { inicial: "Inicial", intermedio: "Intermedio", avanzado: "Avanzado" },
  en: { inicial: "Beginner", intermedio: "Intermediate", avanzado: "Advanced" },
  pt: { inicial: "Inicial", intermedio: "Intermediário", avanzado: "Avançado" },
  fr: { inicial: "Débutant", intermedio: "Intermédiaire", avanzado: "Avancé" },
  it: { inicial: "Base", intermedio: "Intermedio", avanzado: "Avanzato" },
};
