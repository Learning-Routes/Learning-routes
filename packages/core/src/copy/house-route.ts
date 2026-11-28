import type { LocaleCode } from "../locales";

// The house route as the landing shows it: English from scratch, with its own modules and
// topics, in every language the site speaks. Data only. A locale missing a string fails the types.

type Topics = [string, string, string, string];
export interface HouseRoute {
  exam: string;
  title: string;
  review: string;
  /** One name per stretch, in EXAMPLE_ROUTE_KEYS' order. */
  tabs: [string, string, string, string];
  /** The route's modules in order; topics only where a stretch draws them. */
  modules: [string, Topics | null][];
}

export const HOUSE_ROUTE: Record<LocaleCode, HouseRoute> = {
  es: {
    exam: "Examen del módulo",
    title: "Inglés desde cero",
    review: "Repaso",
    tabs: ["Desde cero", "Día a día", "Tu gente", "Viajes"],
    modules: [
      [
        "Hola: preséntate",
        ["Hello y goodbye", "My name is…", "Where are you from?", "Tu primera conversación"],
      ],
      [
        "El verbo to be",
        ["I am, you are, he is", "Cómo estás y cómo eres", "No y preguntas", "Habla de ti"],
      ],
      ["Números, hora y fechas", null],
      [
        "Tu día a día",
        ["Mi rutina", "He works, she studies", "Siempre, a veces, nunca", "¿Qué haces tú?"],
      ],
      [
        "Comida y café",
        [
          "Pedir en una cafetería",
          "Some, any y cuánto cuesta",
          "En el restaurante",
          "Pide tu comida",
        ],
      ],
      [
        "La ciudad y cómo llegar",
        ["There is, there are", "Dónde está", "Pedir indicaciones", "Muévete por la ciudad"],
      ],
      [
        "Gente y familia",
        ["Mi familia", "Cómo es alguien", "Lo que te gusta", "Habla de tu gente"],
      ],
      [
        "Lo que pasa ahora",
        ["Estoy haciendo", "Cómo se escribe el -ing", "Al teléfono", "¿Qué estás haciendo?"],
      ],
      ["Cuenta lo que pasó", null],
      [
        "Planes y viajes",
        [
          "Going to",
          "Will para decidir y ofrecer",
          "En el aeropuerto y el hotel",
          "Tu primer viaje en inglés",
        ],
      ],
    ],
  },
  en: {
    exam: "Module exam",
    title: "English from scratch",
    review: "Review",
    tabs: ["From scratch", "Day to day", "Your people", "Travel"],
    modules: [
      [
        "Hello: introduce yourself",
        ["Hello and goodbye", "My name is…", "Where are you from?", "Your first conversation"],
      ],
      [
        "The verb to be",
        [
          "I am, you are, he is",
          "How you are and what you are like",
          "No and questions",
          "Talk about yourself",
        ],
      ],
      ["Numbers, time and dates", null],
      [
        "Your day to day",
        ["My routine", "He works, she studies", "Always, sometimes, never", "What do you do?"],
      ],
      [
        "Food and coffee",
        ["Ordering at a café", "Some, any and how much", "At the restaurant", "Order your meal"],
      ],
      [
        "The city and getting around",
        ["There is, there are", "Where it is", "Asking for directions", "Get around the city"],
      ],
      [
        "People and family",
        ["My family", "What someone is like", "What you like", "Talk about your people"],
      ],
      [
        "What is happening now",
        ["I am doing", "How to spell -ing", "On the phone", "What are you doing?"],
      ],
      ["Say what happened", null],
      [
        "Plans and trips",
        [
          "Going to",
          "Will to decide and offer",
          "At the airport and the hotel",
          "Your first trip in English",
        ],
      ],
    ],
  },
  pt: {
    exam: "Prova do módulo",
    title: "Inglês do zero",
    review: "Revisão",
    tabs: ["Do zero", "Dia a dia", "Sua gente", "Viagens"],
    modules: [
      [
        "Olá: apresente-se",
        ["Hello e goodbye", "My name is…", "Where are you from?", "Sua primeira conversa"],
      ],
      [
        "O verbo to be",
        ["I am, you are, he is", "Como você está e como você é", "Não e perguntas", "Fale de você"],
      ],
      ["Números, horas e datas", null],
      [
        "Seu dia a dia",
        ["Minha rotina", "He works, she studies", "Sempre, às vezes, nunca", "O que você faz?"],
      ],
      [
        "Comida e café",
        ["Pedir em uma cafeteria", "Some, any e quanto custa", "No restaurante", "Peça sua comida"],
      ],
      [
        "A cidade e como chegar",
        ["There is, there are", "Onde fica", "Pedir indicações", "Ande pela cidade"],
      ],
      [
        "Pessoas e família",
        ["Minha família", "Como alguém é", "Do que você gosta", "Fale da sua gente"],
      ],
      [
        "O que acontece agora",
        ["Estou fazendo", "Como se escreve o -ing", "Ao telefone", "O que você está fazendo?"],
      ],
      ["Conte o que aconteceu", null],
      [
        "Planos e viagens",
        [
          "Going to",
          "Will para decidir e oferecer",
          "No aeroporto e no hotel",
          "Sua primeira viagem em inglês",
        ],
      ],
    ],
  },
  fr: {
    exam: "Examen du module",
    title: "L'anglais de zéro",
    review: "Révision",
    tabs: ["De zéro", "Au quotidien", "Vos proches", "Voyages"],
    modules: [
      [
        "Bonjour : présentez-vous",
        ["Hello et goodbye", "My name is…", "Where are you from?", "Votre première conversation"],
      ],
      [
        "Le verbe to be",
        [
          "I am, you are, he is",
          "Comment vous allez, comment vous êtes",
          "Non et questions",
          "Parlez de vous",
        ],
      ],
      ["Nombres, heure et dates", null],
      [
        "Votre quotidien",
        ["Ma routine", "He works, she studies", "Toujours, parfois, jamais", "Que faites-vous ?"],
      ],
      [
        "Repas et café",
        [
          "Commander dans un café",
          "Some, any et combien ça coûte",
          "Au restaurant",
          "Commandez votre repas",
        ],
      ],
      [
        "La ville et s'y rendre",
        ["There is, there are", "Où ça se trouve", "Demander son chemin", "Déplacez-vous en ville"],
      ],
      [
        "Proches et famille",
        ["Ma famille", "Comment est quelqu'un", "Ce que vous aimez", "Parlez de vos proches"],
      ],
      [
        "Ce qui se passe maintenant",
        [
          "Je suis en train de",
          "Comment écrire le -ing",
          "Au téléphone",
          "Que faites-vous en ce moment ?",
        ],
      ],
      ["Racontez ce qui s'est passé", null],
      [
        "Projets et voyages",
        [
          "Going to",
          "Will pour décider et proposer",
          "À l'aéroport et à l'hôtel",
          "Votre premier voyage en anglais",
        ],
      ],
    ],
  },
  it: {
    exam: "Esame del modulo",
    title: "Inglese da zero",
    review: "Ripasso",
    tabs: ["Da zero", "Ogni giorno", "La tua gente", "Viaggi"],
    modules: [
      [
        "Ciao: presentati",
        ["Hello e goodbye", "My name is…", "Where are you from?", "La tua prima conversazione"],
      ],
      [
        "Il verbo to be",
        ["I am, you are, he is", "Come stai e come sei", "No e domande", "Parla di te"],
      ],
      ["Numeri, ora e date", null],
      [
        "La tua giornata",
        ["La mia routine", "He works, she studies", "Sempre, a volte, mai", "Tu cosa fai?"],
      ],
      [
        "Cibo e caffè",
        ["Ordinare al bar", "Some, any e quanto costa", "Al ristorante", "Ordina da mangiare"],
      ],
      [
        "La città e come arrivare",
        ["There is, there are", "Dove si trova", "Chiedere indicazioni", "Muoviti in città"],
      ],
      [
        "Persone e famiglia",
        ["La mia famiglia", "Com'è una persona", "Cosa ti piace", "Parla della tua gente"],
      ],
      [
        "Cosa succede adesso",
        ["Sto facendo", "Come si scrive -ing", "Al telefono", "Cosa stai facendo?"],
      ],
      ["Racconta cosa è successo", null],
      [
        "Programmi e viaggi",
        [
          "Going to",
          "Will per decidere e offrire",
          "In aeroporto e in hotel",
          "Il tuo primo viaggio in inglese",
        ],
      ],
    ],
  },
};
