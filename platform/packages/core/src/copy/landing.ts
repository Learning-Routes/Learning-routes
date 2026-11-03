import { BRAND, type LocaleCode } from "../locales";

// The landing's words, Spanish first, from v2's Main (Platform STEP 4 §4). The header
// and the "Quiero enseñar" block share the catalog's words. Data only. A locale missing
// a string fails the types.

export interface LandingText {
  description: string;
  headline: string;
  lead: string;
  teachLink: string;
  /** What the route drawing shows, for a screen reader. */
  mapLabel: string;
  mapHere: string;
  mapTopic: string;
  mapExtra: string;
  mapExam: string;
  mapFirst: string;
  stepsTitle: string;
  steps: { title: string; body: string }[];
  routesTitle: string;
  allRoutes: string;
  teachInvitation: string;
}

export const LANDING_TEXT: Record<LocaleCode, LandingText> = {
  es: {
    description: `${BRAND}: rutas armadas por quien mejor enseña cada tema. Avanzas un tema a la vez, y el primer módulo es gratis.`,
    headline: "Aprende con quien mejor lo enseña.",
    lead: "Cada ruta es un camino claro, armado por alguien que enseña ese tema. Avanzas un tema a la vez, y el primer módulo es gratis.",
    teachLink: "¿Enseñas algo? Crea tu ruta",
    mapLabel:
      "Una ruta: dos temas hechos, el tema actual en dorado y los siguientes por recorrer, con una parada de práctica extra y un examen al final.",
    mapHere: "Estás aquí",
    mapTopic: "Tema 3: Ser y estar",
    mapExtra: "Práctica extra",
    mapExam: "Examen",
    mapFirst: "Saludos",
    stepsTitle: "Así se recorre una ruta",
    steps: [
      {
        title: "Elige con quién aprender",
        body: "Cada ruta la arma alguien que enseña ese tema. Ves sus módulos antes de empezar.",
      },
      {
        title: "Avanza un tema a la vez",
        body: "Lees, practicas y respondes una pregunta. Si algo cuesta, aparece práctica extra justo ahí.",
      },
      {
        title: "Cierra cada módulo con un examen",
        body: "Confirmas lo que sabes y sigues. El primer módulo es gratis; pagas solo si quieres seguir.",
      },
    ],
    routesTitle: "Rutas para empezar",
    allRoutes: "Ver todas las rutas",
    teachInvitation: "Por ahora entramos por invitación.",
  },
  en: {
    description: `${BRAND}: routes built by the people who teach each subject best. You move one topic at a time, and the first module is free.`,
    headline: "Learn from those who teach it best.",
    lead: "Each route is a clear path, built by someone who teaches that subject. You move one topic at a time, and the first module is free.",
    teachLink: "Do you teach something? Create your route",
    mapLabel:
      "A route: two topics done, the current topic in gold and the next ones still ahead, with a stop for extra practice and an exam at the end.",
    mapHere: "You are here",
    mapTopic: "Topic 3: To be",
    mapExtra: "Extra practice",
    mapExam: "Exam",
    mapFirst: "Greetings",
    stepsTitle: "How you travel a route",
    steps: [
      {
        title: "Choose who to learn from",
        body: "Every route is built by someone who teaches that subject. You see its modules before you start.",
      },
      {
        title: "Move one topic at a time",
        body: "Read, practice and answer a question. If something is hard, extra practice appears right there.",
      },
      {
        title: "Close each module with an exam",
        body: "Confirm what you know and carry on. The first module is free; you pay only if you want to continue.",
      },
    ],
    routesTitle: "Routes to start with",
    allRoutes: "See all routes",
    teachInvitation: "For now, joining is by invitation.",
  },
  pt: {
    description: `${BRAND}: rotas montadas por quem melhor ensina cada tema. Você avança um tema de cada vez, e o primeiro módulo é grátis.`,
    headline: "Aprenda com quem melhor ensina.",
    lead: "Cada rota é um caminho claro, montado por alguém que ensina esse tema. Você avança um tema de cada vez, e o primeiro módulo é grátis.",
    teachLink: "Você ensina algo? Crie sua rota",
    mapLabel:
      "Uma rota: dois temas concluídos, o tema atual em dourado e os próximos pela frente, com uma parada de prática extra e uma prova no final.",
    mapHere: "Você está aqui",
    mapTopic: "Tema 3: Ser e estar",
    mapExtra: "Prática extra",
    mapExam: "Prova",
    mapFirst: "Saudações",
    stepsTitle: "Como se percorre uma rota",
    steps: [
      {
        title: "Escolha com quem aprender",
        body: "Cada rota é montada por alguém que ensina esse tema. Você vê os módulos antes de começar.",
      },
      {
        title: "Avance um tema de cada vez",
        body: "Você lê, pratica e responde a uma pergunta. Se algo pesar, aparece prática extra ali mesmo.",
      },
      {
        title: "Feche cada módulo com uma prova",
        body: "Confirme o que sabe e siga em frente. O primeiro módulo é grátis; você só paga se quiser continuar.",
      },
    ],
    routesTitle: "Rotas para começar",
    allRoutes: "Ver todas as rotas",
    teachInvitation: "Por enquanto, a entrada é por convite.",
  },
  fr: {
    description: `${BRAND} : des parcours construits par celles et ceux qui enseignent le mieux chaque sujet. Vous avancez un sujet à la fois, et le premier module est gratuit.`,
    headline: "Apprenez auprès de qui l'enseigne le mieux.",
    lead: "Chaque parcours est un chemin clair, construit par une personne qui enseigne ce sujet. Vous avancez un sujet à la fois, et le premier module est gratuit.",
    teachLink: "Vous enseignez ? Créez votre parcours",
    mapLabel:
      "Un parcours : deux sujets terminés, le sujet actuel en doré et les suivants à venir, avec une halte de pratique supplémentaire et un examen à la fin.",
    mapHere: "Vous êtes ici",
    mapTopic: "Sujet 3 : Être",
    mapExtra: "Pratique supplémentaire",
    mapExam: "Examen",
    mapFirst: "Salutations",
    stepsTitle: "Comment suivre un parcours",
    steps: [
      {
        title: "Choisissez auprès de qui apprendre",
        body: "Chaque parcours est construit par une personne qui enseigne ce sujet. Vous voyez ses modules avant de commencer.",
      },
      {
        title: "Avancez un sujet à la fois",
        body: "Vous lisez, vous pratiquez et vous répondez à une question. Si c'est difficile, une pratique supplémentaire apparaît juste là.",
      },
      {
        title: "Terminez chaque module par un examen",
        body: "Confirmez ce que vous savez et continuez. Le premier module est gratuit ; vous ne payez que si vous voulez continuer.",
      },
    ],
    routesTitle: "Des parcours pour commencer",
    allRoutes: "Voir tous les parcours",
    teachInvitation: "Pour l'instant, on entre sur invitation.",
  },
  it: {
    description: `${BRAND}: percorsi costruiti da chi insegna meglio ogni materia. Avanzi un argomento alla volta, e il primo modulo è gratis.`,
    headline: "Impara da chi lo insegna meglio.",
    lead: "Ogni percorso è una strada chiara, costruita da chi insegna quella materia. Avanzi un argomento alla volta, e il primo modulo è gratis.",
    teachLink: "Insegni qualcosa? Crea il tuo percorso",
    mapLabel:
      "Un percorso: due argomenti fatti, l'argomento attuale in oro e i prossimi da percorrere, con una tappa di pratica extra e un esame alla fine.",
    mapHere: "Sei qui",
    mapTopic: "Argomento 3: Essere",
    mapExtra: "Pratica extra",
    mapExam: "Esame",
    mapFirst: "Saluti",
    stepsTitle: "Come si percorre un percorso",
    steps: [
      {
        title: "Scegli da chi imparare",
        body: "Ogni percorso è costruito da chi insegna quella materia. Vedi i suoi moduli prima di iniziare.",
      },
      {
        title: "Avanza un argomento alla volta",
        body: "Leggi, ti eserciti e rispondi a una domanda. Se qualcosa è difficile, la pratica extra appare proprio lì.",
      },
      {
        title: "Chiudi ogni modulo con un esame",
        body: "Confermi ciò che sai e prosegui. Il primo modulo è gratis; paghi solo se vuoi continuare.",
      },
    ],
    routesTitle: "Percorsi per iniziare",
    allRoutes: "Vedi tutti i percorsi",
    teachInvitation: "Per ora si entra su invito.",
  },
};
