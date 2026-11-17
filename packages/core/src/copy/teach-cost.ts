import type { LocaleCode } from "../locales";

// Teaching has a cost (Platform STEP 21): what someone who is not a creator yet reads before the
// form. Data only. Spanish is the source; a locale missing a string fails the types.

export interface TeachCostText {
  title: string;
  body: string;
  /** The action that will load a balance; disabled until payments open. */
  button: string;
  soon: string;
  /** Why the form below is still worth filling. */
  wait: string;
}

export const TEACH_COST_TEXT: Record<LocaleCode, TeachCostText> = {
  es: {
    title: "Enseñar tiene un costo",
    body: "Para crear rutas cargas un saldo. Ese saldo paga la inteligencia artificial que construye tus rutas contigo y tu plan de creador. No se crea nada hasta que pagues, y ves el precio antes de pagar.",
    button: "Cargar saldo",
    soon: "Muy pronto",
    wait: "Los pagos abren muy pronto. Déjanos tus datos y te avisamos el día que puedas empezar.",
  },
  en: {
    title: "Teaching has a cost",
    body: "To create routes you load a balance. It pays for the AI that builds your routes with you and for your creator plan. Nothing is created until you pay, and you see the price before paying.",
    button: "Load balance",
    soon: "Very soon",
    wait: "Payments open very soon. Leave your details and we will tell you the day you can start.",
  },
  pt: {
    title: "Ensinar tem um custo",
    body: "Para criar rotas você carrega um saldo. Ele paga a inteligência artificial que constrói suas rotas com você e o seu plano de criador. Nada é criado até você pagar, e você vê o preço antes de pagar.",
    button: "Carregar saldo",
    soon: "Muito em breve",
    wait: "Os pagamentos abrem muito em breve. Deixe seus dados e avisamos no dia em que puder começar.",
  },
  fr: {
    title: "Enseigner a un coût",
    body: "Pour créer des parcours, vous chargez un solde. Il paie l’intelligence artificielle qui construit vos parcours avec vous et votre formule créateur. Rien n’est créé avant le paiement, et vous voyez le prix avant de payer.",
    button: "Charger un solde",
    soon: "Très bientôt",
    wait: "Les paiements ouvrent très bientôt. Laissez vos coordonnées et nous vous préviendrons le jour où vous pourrez commencer.",
  },
  it: {
    title: "Insegnare ha un costo",
    body: "Per creare percorsi carichi un saldo. Paga l’intelligenza artificiale che costruisce i percorsi con te e il tuo piano da creatore. Non si crea nulla finché non paghi, e vedi il prezzo prima di pagare.",
    button: "Carica saldo",
    soon: "Molto presto",
    wait: "I pagamenti aprono molto presto. Lasciaci i tuoi dati e ti avvisiamo il giorno in cui potrai iniziare.",
  },
};
