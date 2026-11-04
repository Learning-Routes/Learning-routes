import type { LocaleCode } from "../locales";

// The landing's stage and closing sheet (Platform STEP 6 §2), Spanish first. The map's names
// use the glossary's words: "práctica extra", "pregunta". {n}, {done}, {total} and {count}
// are filled in on the map. Data only. A locale missing a string fails the types.

export interface StageText {
  stageLabel: string;
  note: string;
  /** Panels 1 to 5; the hero, panel 0, is the page's headline and lead. */
  panels: { title: string; body: string }[];
  overview: string;
  map: {
    example: string;
    done: string;
    here: string;
    coming: string;
    extra: string;
    locked: string;
    module: string;
    progress: string;
    topics: string;
    free: string;
    legend: string;
    panels: string;
    extraNames: string[];
  };
}

export const STAGE_TEXT: Record<LocaleCode, StageText> = {
  es: {
    stageLabel: "Cómo se recorre una ruta",
    note: "El primer módulo es gratis.",
    panels: [
      {
        title: "Una ruta, armada por quien enseña",
        body: "Quien enseña el tema la arma en módulos, cada uno con sus temas en orden.",
      },
      {
        title: "Un tema a la vez",
        body: "Lees, practicas y respondes una pregunta. Al acertar, el tema queda hecho y la línea avanza contigo.",
      },
      {
        title: "Si algo cuesta, aparece práctica extra",
        body: "Una pregunta que no sale abre temas cortos debajo de ese tema. Al terminarlos, sigues por la ruta.",
      },
      {
        title: "Cada módulo cierra con un examen",
        body: "Confirmas lo que sabes y pasas al siguiente módulo.",
      },
      {
        title: "La ruta entera, de un vistazo",
        body: "Módulos en orden, cada uno con sus temas y su práctica extra. El primer módulo es gratis.",
      },
    ],
    overview: "Este es el recorrido de una ruta, paso a paso.",
    map: {
      example: "Ruta de ejemplo",
      done: "Hecho",
      here: "Estás aquí",
      coming: "Por llegar",
      extra: "Práctica extra",
      locked: "Bloqueado",
      module: "Módulo {n}",
      progress: "{done} de {total}",
      topics: "{count} temas",
      free: "Gratis",
      legend: "Leyenda del mapa",
      panels: "Partes del recorrido",
      extraNames: ["Repasa lo clave", "Práctica guiada", "Otra pregunta"],
    },
  },
  en: {
    stageLabel: "How a route works",
    note: "The first module is free.",
    panels: [
      {
        title: "A route, built by the person who teaches it",
        body: "Whoever teaches the subject builds it in modules, each with its topics in order.",
      },
      {
        title: "One topic at a time",
        body: "You read, practise and answer a question. Get it right and the topic is done, and the line moves with you.",
      },
      {
        title: "When something is hard, extra practice appears",
        body: "A question that doesn't go well opens short topics under that one. Finish them and carry on along the route.",
      },
      {
        title: "Every module closes with an exam",
        body: "You confirm what you know and move on to the next module.",
      },
      {
        title: "The whole route, at a glance",
        body: "Modules in order, each with its topics and its extra practice. The first module is free.",
      },
    ],
    overview: "This is how a route goes, step by step.",
    map: {
      example: "Example route",
      done: "Done",
      here: "You are here",
      coming: "Still ahead",
      extra: "Extra practice",
      locked: "Locked",
      module: "Module {n}",
      progress: "{done} of {total}",
      topics: "{count} topics",
      free: "Free",
      legend: "Map legend",
      panels: "Parts of the tour",
      extraNames: ["Review the key points", "Guided practice", "Another question"],
    },
  },
  pt: {
    stageLabel: "Como se percorre uma rota",
    note: "O primeiro módulo é grátis.",
    panels: [
      {
        title: "Uma rota, montada por quem ensina",
        body: "Quem ensina o tema a monta em módulos, cada um com seus temas em ordem.",
      },
      {
        title: "Um tema de cada vez",
        body: "Você lê, pratica e responde uma pergunta. Ao acertar, o tema fica feito e a linha avança com você.",
      },
      {
        title: "Se algo pesa, aparece prática extra",
        body: "Uma pergunta que não sai abre temas curtos embaixo desse tema. Ao terminá-los, você segue pela rota.",
      },
      {
        title: "Cada módulo fecha com uma prova",
        body: "Você confirma o que sabe e passa para o próximo módulo.",
      },
      {
        title: "A rota inteira, de relance",
        body: "Módulos em ordem, cada um com seus temas e sua prática extra. O primeiro módulo é grátis.",
      },
    ],
    overview: "Este é o percurso de uma rota, passo a passo.",
    map: {
      example: "Rota de exemplo",
      done: "Feito",
      here: "Você está aqui",
      coming: "Por vir",
      extra: "Prática extra",
      locked: "Bloqueado",
      module: "Módulo {n}",
      progress: "{done} de {total}",
      topics: "{count} temas",
      free: "Grátis",
      legend: "Legenda do mapa",
      panels: "Partes do percurso",
      extraNames: ["Revise o essencial", "Prática guiada", "Outra pergunta"],
    },
  },
  fr: {
    stageLabel: "Comment se parcourt un parcours",
    note: "Le premier module est gratuit.",
    panels: [
      {
        title: "Un parcours, construit par qui enseigne",
        body: "Qui enseigne le sujet le construit en modules, chacun avec ses sujets dans l'ordre.",
      },
      {
        title: "Un sujet à la fois",
        body: "Vous lisez, pratiquez et répondez à une question. Une bonne réponse, et le sujet est fait : la ligne avance avec vous.",
      },
      {
        title: "Si ça coince, voici la pratique supplémentaire",
        body: "Une question qui ne passe pas ouvre des sujets courts sous ce sujet. Une fois terminés, vous reprenez le parcours.",
      },
      {
        title: "Chaque module se clôt par un examen",
        body: "Vous confirmez ce que vous savez et passez au module suivant.",
      },
      {
        title: "Tout le parcours, d'un coup d'œil",
        body: "Des modules dans l'ordre, chacun avec ses sujets et sa pratique supplémentaire. Le premier module est gratuit.",
      },
    ],
    overview: "Voici comment se déroule un parcours, étape par étape.",
    map: {
      example: "Parcours d'exemple",
      done: "Fait",
      here: "Vous êtes ici",
      coming: "À venir",
      extra: "Pratique supplémentaire",
      locked: "Verrouillé",
      module: "Module {n}",
      progress: "{done} sur {total}",
      topics: "{count} sujets",
      free: "Gratuit",
      legend: "Légende de la carte",
      panels: "Étapes de la visite",
      extraNames: ["Revoir l'essentiel", "Pratique guidée", "Une autre question"],
    },
  },
  it: {
    stageLabel: "Come si segue un percorso",
    note: "Il primo modulo è gratis.",
    panels: [
      {
        title: "Un percorso, costruito da chi insegna",
        body: "Chi insegna l'argomento lo costruisce in moduli, ciascuno con i suoi argomenti in ordine.",
      },
      {
        title: "Un argomento alla volta",
        body: "Leggi, ti eserciti e rispondi a una domanda. Se è giusta, l'argomento è fatto e la linea avanza con te.",
      },
      {
        title: "Se qualcosa è difficile, compare la pratica extra",
        body: "Una domanda che non va apre argomenti brevi sotto quell'argomento. Finiti quelli, prosegui lungo il percorso.",
      },
      {
        title: "Ogni modulo si chiude con un esame",
        body: "Confermi quello che sai e passi al modulo successivo.",
      },
      {
        title: "Tutto il percorso, a colpo d'occhio",
        body: "Moduli in ordine, ciascuno con i suoi argomenti e la sua pratica extra. Il primo modulo è gratis.",
      },
    ],
    overview: "Ecco come si svolge un percorso, passo dopo passo.",
    map: {
      example: "Percorso di esempio",
      done: "Fatto",
      here: "Sei qui",
      coming: "Da fare",
      extra: "Pratica extra",
      locked: "Bloccato",
      module: "Modulo {n}",
      progress: "{done} di {total}",
      topics: "{count} argomenti",
      free: "Gratis",
      legend: "Legenda della mappa",
      panels: "Parti del percorso",
      extraNames: ["Ripassa l'essenziale", "Pratica guidata", "Un'altra domanda"],
    },
  },
};
