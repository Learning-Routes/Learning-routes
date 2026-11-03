import { BRAND, type LocaleCode } from "../locales";

// The landing's words, Spanish first (Platform STEP 6 §2): the page's meta, its headline and
// lead, and what the Open Graph image draws. landing-stage.ts holds the rest. The header and
// "Quiero enseñar" share the catalog's words. Data only. A locale missing a string fails the types.

export interface LandingText {
  description: string;
  headline: string;
  lead: string;
  /** What the route drawing shows, for a screen reader. */
  mapLabel: string;
  mapHere: string;
  mapTopic: string;
  mapExtra: string;
  mapExam: string;
  mapFirst: string;
  routesTitle: string;
  allRoutes: string;
  teachInvitation: string;
}

export const LANDING_TEXT: Record<LocaleCode, LandingText> = {
  es: {
    description: `${BRAND}: rutas armadas por quien mejor enseña cada tema. Avanzas un tema a la vez, y el primer módulo es gratis.`,
    headline: "Aprende con quien mejor lo enseña.",
    lead: "Cada ruta la arma alguien que enseña ese tema: módulos en orden, temas cortos con práctica y un examen al cerrar cada módulo.",
    mapLabel:
      "Una ruta: dos temas hechos, el tema actual en dorado y los siguientes por recorrer, con una parada de práctica extra y un examen al final.",
    mapHere: "Estás aquí",
    mapTopic: "Tema 3: Ser y estar",
    mapExtra: "Práctica extra",
    mapExam: "Examen",
    mapFirst: "Saludos",
    routesTitle: "Rutas para empezar",
    allRoutes: "Ver todas las rutas",
    teachInvitation: "Por ahora entramos por invitación.",
  },
  en: {
    description: `${BRAND}: routes built by the people who teach each subject best. You move one topic at a time, and the first module is free.`,
    headline: "Learn from those who teach it best.",
    lead: "Each route is built by someone who teaches the subject: modules in order, short topics with practice, and an exam to close each module.",
    mapLabel:
      "A route: two topics done, the current topic in gold and the next ones still ahead, with a stop for extra practice and an exam at the end.",
    mapHere: "You are here",
    mapTopic: "Topic 3: To be",
    mapExtra: "Extra practice",
    mapExam: "Exam",
    mapFirst: "Greetings",
    routesTitle: "Routes to start with",
    allRoutes: "See all routes",
    teachInvitation: "For now, joining is by invitation.",
  },
  pt: {
    description: `${BRAND}: rotas montadas por quem melhor ensina cada tema. Você avança um tema de cada vez, e o primeiro módulo é grátis.`,
    headline: "Aprenda com quem melhor ensina.",
    lead: "Cada rota é montada por quem ensina o tema: módulos em ordem, temas curtos com prática e uma prova ao fechar cada módulo.",
    mapLabel:
      "Uma rota: dois temas concluídos, o tema atual em dourado e os próximos pela frente, com uma parada de prática extra e uma prova no final.",
    mapHere: "Você está aqui",
    mapTopic: "Tema 3: Ser e estar",
    mapExtra: "Prática extra",
    mapExam: "Prova",
    mapFirst: "Saudações",
    routesTitle: "Rotas para começar",
    allRoutes: "Ver todas as rotas",
    teachInvitation: "Por enquanto, a entrada é por convite.",
  },
  fr: {
    description: `${BRAND} : des parcours construits par celles et ceux qui enseignent le mieux chaque sujet. Vous avancez un sujet à la fois, et le premier module est gratuit.`,
    headline: "Apprenez avec qui l'enseigne le mieux.",
    lead: "Chaque parcours est construit par qui enseigne le sujet : des modules dans l'ordre, des sujets courts et un examen à la fin de chacun.",
    mapLabel:
      "Un parcours : deux sujets terminés, le sujet actuel en doré et les suivants à venir, avec une halte de pratique supplémentaire et un examen à la fin.",
    mapHere: "Vous êtes ici",
    mapTopic: "Sujet 3 : Être",
    mapExtra: "Pratique supplémentaire",
    mapExam: "Examen",
    mapFirst: "Salutations",
    routesTitle: "Des parcours pour commencer",
    allRoutes: "Voir tous les parcours",
    teachInvitation: "Pour l'instant, on entre sur invitation.",
  },
  it: {
    description: `${BRAND}: percorsi costruiti da chi insegna meglio ogni materia. Avanzi un argomento alla volta, e il primo modulo è gratis.`,
    headline: "Impara da chi lo insegna meglio.",
    lead: "Ogni percorso è costruito da chi insegna l'argomento: moduli in ordine, argomenti brevi con pratica e un esame alla fine di ogni modulo.",
    mapLabel:
      "Un percorso: due argomenti fatti, l'argomento attuale in oro e i prossimi da percorrere, con una tappa di pratica extra e un esame alla fine.",
    mapHere: "Sei qui",
    mapTopic: "Argomento 3: Essere",
    mapExtra: "Pratica extra",
    mapExam: "Esame",
    mapFirst: "Saluti",
    routesTitle: "Percorsi per iniziare",
    allRoutes: "Vedi tutti i percorsi",
    teachInvitation: "Per ora si entra su invito.",
  },
};
