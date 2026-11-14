import type { LocaleCode } from "../locales";
import type { StudioStep } from "../studio/session";

// The words of the creator's assistant page (Platform STEP 10): only the page's own frame. What the
// assistant says comes from the assistant. Data only. Spanish is the source; a locale missing a
// string fails the types.

export interface AssistantText {
  pageTitle: string;
  opening: string;
  firstPlaceholder: string;
  placeholder: string;
  attach: string;
  send: string;
  hint: string;
  steps: Record<StudioStep, string>;
  /** {n} is the step's number, {total} how many there are, {name} its name. */
  stepOf: string;
  startHere: string;
  /** {n} is the module's number. */
  moduleN: string;
  newLesson: string;
  draft: string;
  published: string;
  /** {format} is the lesson's format, in the assistant's words. */
  previewOf: string;
  openPreview: string;
  /** {title} is the route's title. */
  confirmTitle: string;
  /** {address} is where the route will be. */
  confirmWhere: string;
  /** {price} is the whole route's price. */
  confirmPrice: string;
  confirmFree: string;
  confirmYes: string;
  confirmNo: string;
  /** {address} is where the route is now. */
  publishedAt: string;
  routeList: string;
  /** {n} is how many of the route's stations are written, {total} how many it has. */
  builtOf: string;
  /** Read before each turn of the conversation, for screen readers. */
  you: string;
  assistant: string;
  noMap: string;
}

export const ASSISTANT_TEXT: Record<LocaleCode, AssistantText> = {
  es: {
    pageTitle: "Tu asistente",
    opening: "¿Qué quieres enseñar?",
    firstPlaceholder: "Quiero mi app de matemáticas para colegio…",
    placeholder: "Escribe tu respuesta…",
    attach: "Adjuntar archivos",
    send: "Enviar",
    hint: "Puedes adjuntar guías, apuntes o algo que hiciste con otra IA.",
    steps: {
      meet: "Conocerte",
      content: "Tu contenido",
      plan: "El plan",
      build: "Construir",
      review: "Revisar",
      page: "Tu página",
      publish: "Publicar",
    },
    stepOf: "Paso {n} de {total}: {name}",
    startHere: "Aquí empieza tu ruta",
    moduleN: "Módulo {n}",
    newLesson: "Nuevo",
    draft: "Borrador",
    published: "Publicada",
    previewOf: "Así lo verá tu alumno, en formato {format}",
    openPreview: "Abrir la vista previa completa",
    confirmTitle: "¿Publico «{title}»?",
    confirmWhere: "Quedará en {address}.",
    confirmPrice: "El módulo 1 es gratis y la ruta completa cuesta {price}.",
    confirmFree: "El módulo 1 es gratis.",
    confirmYes: "Sí, publícala",
    confirmNo: "Todavía no",
    publishedAt: "Publicada en {address}",
    routeList: "Tu ruta, en orden",
    builtOf: "{n} de {total} listos",
    you: "Tú",
    assistant: "Tu asistente",
    noMap: "Este navegador no muestra el mapa. Tu ruta está en la lista.",
  },
  en: {
    pageTitle: "Your assistant",
    opening: "What do you want to teach?",
    firstPlaceholder: "I want my maths app for high school…",
    placeholder: "Write your answer…",
    attach: "Attach files",
    send: "Send",
    hint: "You can attach guides, notes or something you made with another AI.",
    steps: {
      meet: "Getting to know you",
      content: "Your content",
      plan: "The plan",
      build: "Build",
      review: "Review",
      page: "Your page",
      publish: "Publish",
    },
    stepOf: "Step {n} of {total}: {name}",
    startHere: "Your route starts here",
    moduleN: "Module {n}",
    newLesson: "New",
    draft: "Draft",
    published: "Published",
    previewOf: "What your student will see, as {format}",
    openPreview: "Open the full preview",
    confirmTitle: "Publish “{title}”?",
    confirmWhere: "It will be at {address}.",
    confirmPrice: "Module 1 is free and the whole route costs {price}.",
    confirmFree: "Module 1 is free.",
    confirmYes: "Yes, publish it",
    confirmNo: "Not yet",
    publishedAt: "Published at {address}",
    routeList: "Your route, in order",
    builtOf: "{n} of {total} ready",
    you: "You",
    assistant: "Your assistant",
    noMap: "This browser can't show the map. Your route is in the list.",
  },
  pt: {
    pageTitle: "Seu assistente",
    opening: "O que você quer ensinar?",
    firstPlaceholder: "Quero meu app de matemática para o ensino médio…",
    placeholder: "Escreva sua resposta…",
    attach: "Anexar arquivos",
    send: "Enviar",
    hint: "Você pode anexar apostilas, anotações ou algo que fez com outra IA.",
    steps: {
      meet: "Conhecer você",
      content: "Seu conteúdo",
      plan: "O plano",
      build: "Construir",
      review: "Revisar",
      page: "Sua página",
      publish: "Publicar",
    },
    stepOf: "Passo {n} de {total}: {name}",
    startHere: "Sua rota começa aqui",
    moduleN: "Módulo {n}",
    newLesson: "Novo",
    draft: "Rascunho",
    published: "Publicada",
    previewOf: "Assim seu aluno vai ver, no formato {format}",
    openPreview: "Abrir a prévia completa",
    confirmTitle: "Publico «{title}»?",
    confirmWhere: "Ficará em {address}.",
    confirmPrice: "O módulo 1 é grátis e a rota completa custa {price}.",
    confirmFree: "O módulo 1 é grátis.",
    confirmYes: "Sim, publique",
    confirmNo: "Ainda não",
    publishedAt: "Publicada em {address}",
    routeList: "Sua rota, em ordem",
    builtOf: "{n} de {total} prontos",
    you: "Você",
    assistant: "Seu assistente",
    noMap: "Este navegador não mostra o mapa. Sua rota está na lista.",
  },
  fr: {
    pageTitle: "Votre assistant",
    opening: "Que voulez-vous enseigner ?",
    firstPlaceholder: "Je veux mon appli de maths pour le lycée…",
    placeholder: "Écrivez votre réponse…",
    attach: "Joindre des fichiers",
    send: "Envoyer",
    hint: "Vous pouvez joindre des fiches, des notes ou ce que vous avez fait avec une autre IA.",
    steps: {
      meet: "Faire connaissance",
      content: "Votre contenu",
      plan: "Le plan",
      build: "Construire",
      review: "Relire",
      page: "Votre page",
      publish: "Publier",
    },
    stepOf: "Étape {n} sur {total} : {name}",
    startHere: "Votre parcours commence ici",
    moduleN: "Module {n}",
    newLesson: "Nouveau",
    draft: "Brouillon",
    published: "Publié",
    previewOf: "Ce que verra votre élève, au format {format}",
    openPreview: "Ouvrir l’aperçu complet",
    confirmTitle: "Je publie « {title} » ?",
    confirmWhere: "Il sera sur {address}.",
    confirmPrice: "Le module 1 est gratuit et le parcours complet coûte {price}.",
    confirmFree: "Le module 1 est gratuit.",
    confirmYes: "Oui, publiez-le",
    confirmNo: "Pas encore",
    publishedAt: "Publié sur {address}",
    routeList: "Votre parcours, dans l’ordre",
    builtOf: "{n} sur {total} prêts",
    you: "Vous",
    assistant: "Votre assistant",
    noMap: "Ce navigateur n’affiche pas la carte. Votre parcours est dans la liste.",
  },
  it: {
    pageTitle: "Il tuo assistente",
    opening: "Che cosa vuoi insegnare?",
    firstPlaceholder: "Voglio la mia app di matematica per il liceo…",
    placeholder: "Scrivi la tua risposta…",
    attach: "Allega file",
    send: "Invia",
    hint: "Puoi allegare dispense, appunti o qualcosa che hai fatto con un'altra IA.",
    steps: {
      meet: "Conoscerti",
      content: "I tuoi contenuti",
      plan: "Il piano",
      build: "Costruire",
      review: "Rivedere",
      page: "La tua pagina",
      publish: "Pubblicare",
    },
    stepOf: "Passo {n} di {total}: {name}",
    startHere: "Il tuo percorso inizia qui",
    moduleN: "Modulo {n}",
    newLesson: "Nuovo",
    draft: "Bozza",
    published: "Pubblicato",
    previewOf: "Così lo vedrà il tuo studente, nel formato {format}",
    openPreview: "Apri l'anteprima completa",
    confirmTitle: "Pubblico «{title}»?",
    confirmWhere: "Sarà su {address}.",
    confirmPrice: "Il modulo 1 è gratis e il percorso completo costa {price}.",
    confirmFree: "Il modulo 1 è gratis.",
    confirmYes: "Sì, pubblicalo",
    confirmNo: "Non ancora",
    publishedAt: "Pubblicato su {address}",
    routeList: "Il tuo percorso, in ordine",
    builtOf: "{n} su {total} pronti",
    you: "Tu",
    assistant: "Il tuo assistente",
    noMap: "Questo browser non mostra la mappa. Il tuo percorso è nell'elenco.",
  },
};
