import type { LocaleCode } from "../locales";

// The landing's four example routes (Platform STEP 6 §2). Invented, and no real creator's
// name: they only fill the map. Each: tab, title, and for each of three modules its name;
// then the first module's five topics and the second's four, each module closing in an exam.
// Data only. A locale missing one fails the types.

export type ExampleRouteKey = "pt" | "py" | "gt" | "fn";
export const EXAMPLE_ROUTE_KEYS: readonly ExampleRouteKey[] = ["pt", "py", "gt", "fn"];

type Compact = {
  tab: string;
  title: string;
  modules: [string, string, string];
  first: [string, string, string, string, string];
  second: [string, string, string, string];
};

export interface ExampleRoutes {
  exam: string;
  routes: Record<ExampleRouteKey, Compact>;
}

export const EXAMPLE_ROUTES: Record<LocaleCode, ExampleRoutes> = {
  es: {
    exam: "Examen del módulo",
    routes: {
      pt: {
        tab: "Portugués",
        title: "Portugués para viajar",
        modules: ["Fundamentos", "En el camino", "Conversación real"],
        first: ["Saludos", "Pronombres", "Ser y estar", "Números", "Direcciones"],
        second: ["Transporte", "En el hotel", "En el restaurante", "De compras"],
      },
      py: {
        tab: "Python",
        title: "Python desde cero",
        modules: ["Primeros pasos", "Trabajar con datos", "Proyectos"],
        first: ["Variables", "Tipos de datos", "Condicionales", "Bucles", "Funciones"],
        second: ["Listas", "Diccionarios", "Archivos", "Errores"],
      },
      gt: {
        tab: "Guitarra",
        title: "Guitarra para empezar",
        modules: ["Lo básico", "Tus canciones", "Tocar con otros"],
        first: ["Postura", "Afinar", "Primeros acordes", "Ritmo", "Cambios de acorde"],
        second: ["Rasgueos", "Arpegios", "Tu primera canción", "La cejilla"],
      },
      fn: {
        tab: "Finanzas",
        title: "Finanzas personales",
        modules: ["Tu dinero hoy", "Hacerlo crecer", "Largo plazo"],
        first: ["Ingresos", "Gastos", "Presupuesto", "Ahorro", "Deudas"],
        second: ["Fondo de emergencia", "Invertir", "Impuestos", "Metas"],
      },
    },
  },
  en: {
    exam: "Module exam",
    routes: {
      pt: {
        tab: "Portuguese",
        title: "Portuguese for travel",
        modules: ["The basics", "On the road", "Real conversation"],
        first: ["Greetings", "Pronouns", "To be", "Numbers", "Directions"],
        second: ["Transport", "At the hotel", "At the restaurant", "Shopping"],
      },
      py: {
        tab: "Python",
        title: "Python from scratch",
        modules: ["First steps", "Working with data", "Projects"],
        first: ["Variables", "Data types", "Conditionals", "Loops", "Functions"],
        second: ["Lists", "Dictionaries", "Files", "Errors"],
      },
      gt: {
        tab: "Guitar",
        title: "Guitar for beginners",
        modules: ["The basics", "Your songs", "Playing with others"],
        first: ["Posture", "Tuning", "First chords", "Rhythm", "Chord changes"],
        second: ["Strumming", "Arpeggios", "Your first song", "The barre"],
      },
      fn: {
        tab: "Finance",
        title: "Personal finance",
        modules: ["Your money today", "Making it grow", "The long term"],
        first: ["Income", "Expenses", "Budget", "Savings", "Debts"],
        second: ["Emergency fund", "Investing", "Taxes", "Goals"],
      },
    },
  },
  pt: {
    exam: "Prova do módulo",
    routes: {
      pt: {
        tab: "Espanhol",
        title: "Espanhol para viajar",
        modules: ["Fundamentos", "No caminho", "Conversa real"],
        first: ["Saudações", "Pronomes", "Ser e estar", "Números", "Direções"],
        second: ["Transporte", "No hotel", "No restaurante", "Compras"],
      },
      py: {
        tab: "Python",
        title: "Python do zero",
        modules: ["Primeiros passos", "Trabalhar com dados", "Projetos"],
        first: ["Variáveis", "Tipos de dados", "Condicionais", "Laços", "Funções"],
        second: ["Listas", "Dicionários", "Arquivos", "Erros"],
      },
      gt: {
        tab: "Violão",
        title: "Violão para começar",
        modules: ["O básico", "Suas músicas", "Tocar com outros"],
        first: ["Postura", "Afinar", "Primeiros acordes", "Ritmo", "Trocas de acorde"],
        second: ["Batidas", "Arpejos", "Sua primeira música", "A pestana"],
      },
      fn: {
        tab: "Finanças",
        title: "Finanças pessoais",
        modules: ["Seu dinheiro hoje", "Fazer crescer", "Longo prazo"],
        first: ["Renda", "Gastos", "Orçamento", "Poupança", "Dívidas"],
        second: ["Reserva de emergência", "Investir", "Impostos", "Metas"],
      },
    },
  },
  fr: {
    exam: "Examen du module",
    routes: {
      pt: {
        tab: "Portugais",
        title: "Le portugais pour voyager",
        modules: ["Les bases", "En chemin", "Vraie conversation"],
        first: ["Salutations", "Pronoms", "Être", "Nombres", "Directions"],
        second: ["Transports", "À l'hôtel", "Au restaurant", "Les achats"],
      },
      py: {
        tab: "Python",
        title: "Python de zéro",
        modules: ["Premiers pas", "Travailler avec des données", "Projets"],
        first: ["Variables", "Types de données", "Conditions", "Boucles", "Fonctions"],
        second: ["Listes", "Dictionnaires", "Fichiers", "Erreurs"],
      },
      gt: {
        tab: "Guitare",
        title: "La guitare pour débuter",
        modules: ["Les bases", "Vos chansons", "Jouer avec les autres"],
        first: ["Posture", "Accorder", "Premiers accords", "Rythme", "Changements d'accord"],
        second: ["Grattage", "Arpèges", "Votre première chanson", "Le barré"],
      },
      fn: {
        tab: "Finances",
        title: "Finances personnelles",
        modules: ["Votre argent aujourd'hui", "Le faire grandir", "Le long terme"],
        first: ["Revenus", "Dépenses", "Budget", "Épargne", "Dettes"],
        second: ["Fonds d'urgence", "Investir", "Impôts", "Objectifs"],
      },
    },
  },
  it: {
    exam: "Esame del modulo",
    routes: {
      pt: {
        tab: "Portoghese",
        title: "Portoghese per viaggiare",
        modules: ["Le basi", "In cammino", "Conversazione vera"],
        first: ["Saluti", "Pronomi", "Essere e stare", "Numeri", "Indicazioni"],
        second: ["Trasporti", "In hotel", "Al ristorante", "Acquisti"],
      },
      py: {
        tab: "Python",
        title: "Python da zero",
        modules: ["Primi passi", "Lavorare con i dati", "Progetti"],
        first: ["Variabili", "Tipi di dati", "Condizioni", "Cicli", "Funzioni"],
        second: ["Liste", "Dizionari", "File", "Errori"],
      },
      gt: {
        tab: "Chitarra",
        title: "Chitarra per iniziare",
        modules: ["Le basi", "Le tue canzoni", "Suonare con altri"],
        first: ["Postura", "Accordare", "Primi accordi", "Ritmo", "Cambi di accordo"],
        second: ["Strumming", "Arpeggi", "La tua prima canzone", "Il barré"],
      },
      fn: {
        tab: "Finanze",
        title: "Finanze personali",
        modules: ["I tuoi soldi oggi", "Farli crescere", "Il lungo periodo"],
        first: ["Entrate", "Spese", "Budget", "Risparmio", "Debiti"],
        second: ["Fondo di emergenza", "Investire", "Tasse", "Obiettivi"],
      },
    },
  },
};

/** One example route as the map reads it: each module's name and its topics. */
export function exampleRouteForMap(locale: LocaleCode, key: ExampleRouteKey) {
  const { exam, routes } = EXAMPLE_ROUTES[locale];
  const { title, modules, first, second } = routes[key];
  return {
    title,
    modules: [
      [modules[0], [...first, exam]],
      [modules[1], [...second, exam]],
      [modules[2], []],
    ],
  };
}
