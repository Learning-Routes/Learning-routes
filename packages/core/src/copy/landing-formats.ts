import type { LocaleCode } from "../locales";

// Two landing sections: the shape of a route (shown with the example routes while no route is
// published) and the ways a topic teaches. The examples inside the tiles are invented and name no
// real person. Data only. Spanish is the source; a locale missing a string fails the types.

export interface LandingFormatsText {
  shapesTitle: string;
  shapesLead: string;
  /** Marks a card as an example, not a route someone published. */
  example: string;
  /** {modules} and {topics} are counts. */
  shapeFacts: string;
  formatsTitle: string;
  formatsLead: string;
  order: { title: string; body: string; steps: [string, string, string] };
  listen: { title: string; body: string; phrase: string; meaning: string };
  code: { title: string; body: string; tests: string };
  worked: { title: string; body: string; notes: [string, string] };
  diagram: { title: string; body: string; labels: [string, string] };
}

export const LANDING_FORMATS_TEXT: Record<LocaleCode, LandingFormatsText> = {
  es: {
    shapesTitle: "Cada ruta tiene su forma.",
    shapesLead:
      "La línea es el recorrido real: cada punto es un tema y cada anillo cierra un módulo con su examen.",
    example: "Ejemplo",
    shapeFacts: "{modules} módulos · {topics} temas",
    formatsTitle: "No es un cuestionario. Es una clase.",
    formatsLead:
      "Cada tema usa la forma que mejor lo enseña: ordenar, escuchar, escribir código, seguir un ejemplo o completar un esquema.",
    order: {
      title: "Ordena los pasos",
      body: "Para procesos: entiendes por qué va cada cosa en su lugar.",
      steps: ["Mezcla la harina y el agua", "Deja reposar la masa", "Hornea 30 minutos"],
    },
    listen: {
      title: "Escucha y repite",
      body: "Para idiomas y música: oyes, repites y comparas.",
      phrase: "«Onde fica a estação?»",
      meaning: "¿Dónde queda la estación?",
    },
    code: {
      title: "Escribe y prueba",
      body: "Código que se revisa al momento.",
      tests: "3 de 3 pruebas pasan",
    },
    worked: {
      title: "Ejemplo resuelto",
      body: "Cada paso aparece cuando lo necesitas.",
      notes: ["resta 6", "divide entre 2"],
    },
    diagram: {
      title: "Completa el esquema",
      body: "Pones cada nombre en su lugar.",
      labels: ["Núcleo", "Membrana"],
    },
  },
  en: {
    shapesTitle: "Every route has its own shape.",
    shapesLead:
      "The line is the real path: each dot is a topic, and each ring closes a module with its exam.",
    example: "Example",
    shapeFacts: "{modules} modules · {topics} topics",
    formatsTitle: "Not a quiz. A class.",
    formatsLead:
      "Each topic takes the form that teaches it best: put steps in order, listen, write code, follow an example or complete a diagram.",
    order: {
      title: "Put the steps in order",
      body: "For processes: you see why each step goes where it does.",
      steps: ["Mix the flour and water", "Let the dough rest", "Bake for 30 minutes"],
    },
    listen: {
      title: "Listen and repeat",
      body: "For languages and music: you hear it, say it and compare.",
      phrase: "«Onde fica a estação?»",
      meaning: "Where is the station?",
    },
    code: {
      title: "Write and test",
      body: "Code that is checked right away.",
      tests: "3 of 3 tests pass",
    },
    worked: {
      title: "Worked example",
      body: "Each step appears when you need it.",
      notes: ["subtract 6", "divide by 2"],
    },
    diagram: {
      title: "Complete the diagram",
      body: "You put each name in its place.",
      labels: ["Nucleus", "Membrane"],
    },
  },
  pt: {
    shapesTitle: "Cada rota tem sua forma.",
    shapesLead:
      "A linha é o percurso real: cada ponto é um tema, e cada anel fecha um módulo com sua prova.",
    example: "Exemplo",
    shapeFacts: "{modules} módulos · {topics} temas",
    formatsTitle: "Não é um questionário. É uma aula.",
    formatsLead:
      "Cada tema usa a forma que melhor o ensina: ordenar, ouvir, escrever código, seguir um exemplo ou completar um esquema.",
    order: {
      title: "Ordene os passos",
      body: "Para processos: você entende por que cada coisa vai no seu lugar.",
      steps: ["Misture a farinha e a água", "Deixe a massa descansar", "Asse por 30 minutos"],
    },
    listen: {
      title: "Ouça e repita",
      body: "Para idiomas e música: você ouve, repete e compara.",
      phrase: "«¿Dónde queda la estación?»",
      meaning: "Onde fica a estação?",
    },
    code: {
      title: "Escreva e teste",
      body: "Código verificado na hora.",
      tests: "3 de 3 testes passam",
    },
    worked: {
      title: "Exemplo resolvido",
      body: "Cada passo aparece quando você precisa.",
      notes: ["subtraia 6", "divida por 2"],
    },
    diagram: {
      title: "Complete o esquema",
      body: "Você coloca cada nome no seu lugar.",
      labels: ["Núcleo", "Membrana"],
    },
  },
  fr: {
    shapesTitle: "Chaque parcours a sa forme.",
    shapesLead:
      "La ligne est le vrai chemin : chaque point est un thème, et chaque anneau clôt un module avec son examen.",
    example: "Exemple",
    shapeFacts: "{modules} modules · {topics} thèmes",
    formatsTitle: "Pas un quiz. Un cours.",
    formatsLead:
      "Chaque thème prend la forme qui l'enseigne le mieux : ordonner, écouter, écrire du code, suivre un exemple ou compléter un schéma.",
    order: {
      title: "Remettez les étapes dans l'ordre",
      body: "Pour les procédés : vous comprenez pourquoi chaque étape est à sa place.",
      steps: ["Mélangez la farine et l'eau", "Laissez reposer la pâte", "Enfournez 30 minutes"],
    },
    listen: {
      title: "Écoutez et répétez",
      body: "Pour les langues et la musique : vous écoutez, répétez et comparez.",
      phrase: "«Onde fica a estação?»",
      meaning: "Où est la gare ?",
    },
    code: {
      title: "Écrivez et testez",
      body: "Du code vérifié tout de suite.",
      tests: "3 tests sur 3 réussis",
    },
    worked: {
      title: "Exemple résolu",
      body: "Chaque étape apparaît quand vous en avez besoin.",
      notes: ["soustrayez 6", "divisez par 2"],
    },
    diagram: {
      title: "Complétez le schéma",
      body: "Vous placez chaque nom au bon endroit.",
      labels: ["Noyau", "Membrane"],
    },
  },
  it: {
    shapesTitle: "Ogni percorso ha la sua forma.",
    shapesLead:
      "La linea è il cammino reale: ogni punto è un argomento, e ogni anello chiude un modulo con il suo esame.",
    example: "Esempio",
    shapeFacts: "{modules} moduli · {topics} argomenti",
    formatsTitle: "Non è un quiz. È una lezione.",
    formatsLead:
      "Ogni argomento prende la forma che lo insegna meglio: ordinare, ascoltare, scrivere codice, seguire un esempio o completare uno schema.",
    order: {
      title: "Metti i passaggi in ordine",
      body: "Per i procedimenti: capisci perché ogni cosa va al suo posto.",
      steps: ["Mescola farina e acqua", "Lascia riposare l'impasto", "Inforna per 30 minuti"],
    },
    listen: {
      title: "Ascolta e ripeti",
      body: "Per lingue e musica: ascolti, ripeti e confronti.",
      phrase: "«Onde fica a estação?»",
      meaning: "Dov'è la stazione?",
    },
    code: {
      title: "Scrivi e prova",
      body: "Codice verificato subito.",
      tests: "3 test su 3 superati",
    },
    worked: {
      title: "Esempio svolto",
      body: "Ogni passaggio appare quando ti serve.",
      notes: ["sottrai 6", "dividi per 2"],
    },
    diagram: {
      title: "Completa lo schema",
      body: "Metti ogni nome al suo posto.",
      labels: ["Nucleo", "Membrana"],
    },
  },
};
