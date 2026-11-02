import { BRAND, type LocaleCode } from "../locales";

// The landing's words, Spanish first, from the approved mockup (Platform STEP 3 §4).
// Data only. A locale missing a string fails the types.

export interface LandingText {
  description: string;
  howItWorks: string;
  signIn: string;
  cta: string;
  headline: string;
  lead: string;
  firstFree: string;
  /** {n} is the module's number. */
  moduleName: string;
  /** {done} of {total} topics. */
  moduleProgress: string;
  moduleFree: string;
  /** {n} topics. */
  moduleTopics: string;
  steps: { title: string; body: string }[];
  closingTitle: string;
}

export const LANDING_TEXT: Record<LocaleCode, LandingText> = {
  es: {
    description: `${BRAND} convierte lo que quieres aprender en una ruta: módulos en orden, temas cortos con práctica y un examen al cerrar cada módulo.`,
    howItWorks: "Cómo funciona",
    signIn: "Entrar",
    cta: "Crear mi ruta",
    headline: "Aprende lo que quieras, bien.",
    lead: `${BRAND} lo convierte en una ruta: módulos en orden, temas cortos con práctica y un examen al cerrar cada módulo.`,
    firstFree: "El primer módulo es gratis.",
    moduleName: "Módulo {n}",
    moduleProgress: "{done} de {total}",
    moduleFree: "Gratis",
    moduleTopics: "{n} temas",
    steps: [
      {
        title: "Tu ruta, armada para ti",
        body: "Nos dices qué quieres aprender y cuánto sabes. La ruta se arma en módulos, cada uno con sus temas en orden.",
      },
      {
        title: "Un tema a la vez",
        body: "Lees, practicas y respondes una comprobación. Al acertar, el tema queda hecho y la línea avanza contigo.",
      },
      {
        title: "Si algo cuesta, aparece un refuerzo",
        body: "Fallar una comprobación abre temas cortos de refuerzo debajo de ese tema. Al terminarlos, sigues por la ruta.",
      },
      {
        title: "Cada módulo cierra con un examen",
        body: "Confirma lo que sabes y pasas al siguiente módulo de tu ruta.",
      },
    ],
    closingTitle: "Tu ruta entera, de un vistazo",
  },
  en: {
    description: `${BRAND} turns what you want to learn into a route: modules in order, short topics with practice, and an exam at the end of each module.`,
    howItWorks: "How it works",
    signIn: "Sign in",
    cta: "Create my route",
    headline: "Learn anything, and learn it well.",
    lead: `${BRAND} turns it into a route: modules in order, short topics with practice, and an exam at the end of each module.`,
    firstFree: "The first module is free.",
    moduleName: "Module {n}",
    moduleProgress: "{done} of {total}",
    moduleFree: "Free",
    moduleTopics: "{n} topics",
    steps: [
      {
        title: "Your route, built for you",
        body: "Tell us what you want to learn and how much you know. The route takes shape in modules, each with its topics in order.",
      },
      {
        title: "One topic at a time",
        body: "Read, practice and answer a check. Get it right and the topic is done, and the line moves forward with you.",
      },
      {
        title: "If something is hard, a refresher appears",
        body: "Missing a check opens short refresher topics under that topic. Finish them and you carry on along the route.",
      },
      {
        title: "Every module ends with an exam",
        body: "Confirm what you know and move on to the next module of your route.",
      },
    ],
    closingTitle: "Your whole route, at a glance",
  },
  pt: {
    description: `${BRAND} transforma o que você quer aprender em uma rota: módulos em ordem, temas curtos com prática e uma prova ao fechar cada módulo.`,
    howItWorks: "Como funciona",
    signIn: "Entrar",
    cta: "Criar minha rota",
    headline: "Aprenda o que quiser, e aprenda bem.",
    lead: `${BRAND} transforma isso em uma rota: módulos em ordem, temas curtos com prática e uma prova ao fechar cada módulo.`,
    firstFree: "O primeiro módulo é grátis.",
    moduleName: "Módulo {n}",
    moduleProgress: "{done} de {total}",
    moduleFree: "Grátis",
    moduleTopics: "{n} temas",
    steps: [
      {
        title: "Sua rota, montada para você",
        body: "Você nos diz o que quer aprender e quanto já sabe. A rota se monta em módulos, cada um com seus temas em ordem.",
      },
      {
        title: "Um tema de cada vez",
        body: "Você lê, pratica e responde a uma verificação. Ao acertar, o tema fica concluído e a linha avança com você.",
      },
      {
        title: "Se algo pesar, aparece um reforço",
        body: "Errar uma verificação abre temas curtos de reforço abaixo desse tema. Ao terminá-los, você segue pela rota.",
      },
      {
        title: "Cada módulo fecha com uma prova",
        body: "Confirme o que sabe e passe para o próximo módulo da sua rota.",
      },
    ],
    closingTitle: "Sua rota inteira, de uma só vez",
  },
  fr: {
    description: `${BRAND} transforme ce que vous voulez apprendre en parcours : des modules dans l'ordre, des sujets courts avec de la pratique et un examen à la fin de chaque module.`,
    howItWorks: "Comment ça marche",
    signIn: "Se connecter",
    cta: "Créer mon parcours",
    headline: "Apprenez ce que vous voulez, et apprenez bien.",
    lead: `${BRAND} en fait un parcours : des modules dans l'ordre, des sujets courts avec de la pratique et un examen à la fin de chaque module.`,
    firstFree: "Le premier module est gratuit.",
    moduleName: "Module {n}",
    moduleProgress: "{done} sur {total}",
    moduleFree: "Gratuit",
    moduleTopics: "{n} sujets",
    steps: [
      {
        title: "Votre parcours, construit pour vous",
        body: "Dites-nous ce que vous voulez apprendre et ce que vous savez déjà. Le parcours se construit en modules, chacun avec ses sujets dans l'ordre.",
      },
      {
        title: "Un sujet à la fois",
        body: "Vous lisez, vous pratiquez et vous répondez à une vérification. Une bonne réponse termine le sujet, et la ligne avance avec vous.",
      },
      {
        title: "Si c'est difficile, un renfort apparaît",
        body: "Rater une vérification ouvre de courts sujets de renfort sous ce sujet. Une fois terminés, vous reprenez le parcours.",
      },
      {
        title: "Chaque module se termine par un examen",
        body: "Confirmez ce que vous savez et passez au module suivant de votre parcours.",
      },
    ],
    closingTitle: "Tout votre parcours, d'un coup d'œil",
  },
  it: {
    description: `${BRAND} trasforma ciò che vuoi imparare in un percorso: moduli in ordine, argomenti brevi con pratica e un esame alla fine di ogni modulo.`,
    howItWorks: "Come funziona",
    signIn: "Accedi",
    cta: "Crea il mio percorso",
    headline: "Impara ciò che vuoi, e imparalo bene.",
    lead: `${BRAND} lo trasforma in un percorso: moduli in ordine, argomenti brevi con pratica e un esame alla fine di ogni modulo.`,
    firstFree: "Il primo modulo è gratis.",
    moduleName: "Modulo {n}",
    moduleProgress: "{done} di {total}",
    moduleFree: "Gratis",
    moduleTopics: "{n} argomenti",
    steps: [
      {
        title: "Il tuo percorso, costruito per te",
        body: "Dicci cosa vuoi imparare e quanto sai già. Il percorso prende forma in moduli, ognuno con i suoi argomenti in ordine.",
      },
      {
        title: "Un argomento alla volta",
        body: "Leggi, ti eserciti e rispondi a una verifica. Se è giusta, l'argomento è fatto e la linea avanza con te.",
      },
      {
        title: "Se qualcosa è difficile, arriva un rinforzo",
        body: "Sbagliare una verifica apre brevi argomenti di rinforzo sotto quell'argomento. Finiti quelli, prosegui lungo il percorso.",
      },
      {
        title: "Ogni modulo si chiude con un esame",
        body: "Conferma ciò che sai e passa al modulo successivo del tuo percorso.",
      },
    ],
    closingTitle: "Tutto il tuo percorso, a colpo d'occhio",
  },
};
