import type {
  PlannedModule,
  StudioEvent,
  StudioInput,
  StudioOption,
} from "@learning-routes/core/studio/session";

// How the assistant's page talks to the assistant (Platform STEP 10). The page only knows this
// interface: the scripted demo below speaks it today, and the agent's connection replaces it.

export interface StudioTransport {
  send(input: StudioInput): void;
  /** Every event, in order. Returns the way to stop listening. */
  subscribe(listener: (event: StudioEvent) => void): () => void;
  close(): void;
}

type Pause = (ms: number) => Promise<void>;
type Choice = StudioOption & { next: () => Promise<void> };

const ADDRESS = "andres-profe.learningroutes.com";
const ROUTE_TITLE = "Álgebra sin miedo";

function demoModules(withPractice: boolean): PlannedModule[] {
  return [
    {
      title: "Lo básico",
      lessons: [
        { title: "¿Qué es una variable?" },
        { title: "Ecuaciones de un paso" },
        { title: "Ecuaciones de dos pasos" },
      ],
    },
    {
      title: "Fracciones con letras",
      lessons: [
        { title: "Sumar fracciones" },
        { title: "Simplificar" },
        ...(withPractice ? [{ title: "Práctica de fracciones", isNew: true }] : []),
      ],
    },
    {
      title: "Problemas reales",
      lessons: [
        { title: "Del texto a la ecuación" },
        { title: "Edades y distancias" },
        { title: "Repaso" },
      ],
    },
  ];
}

/**
 * A scripted conversation with fictional content, for the page before the agent exists and for its
 * tests. It plays the protocol as the agent must: one question at a time, forks for choices, a plan,
 * the build, a preview, and publishing only after an explicit yes.
 */
export class DemoTransport implements StudioTransport {
  private readonly listeners = new Set<(event: StudioEvent) => void>();
  private pending = new Map<string, () => Promise<void>>();
  private hasBegun = false;
  private isClosed = false;
  private withPractice = false;

  constructor(private readonly pause: Pause) {}

  send(input: StudioInput) {
    if (input.type === "message") {
      this.onMessage(input.text);
    } else if (input.type === "choice") {
      this.onChoice(input.optionId);
    } else {
      this.onPublish(input.isConfirmed);
    }
  }

  subscribe(listener: (event: StudioEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close() {
    this.isClosed = true;
    this.listeners.clear();
  }

  private emit(event: StudioEvent) {
    if (!this.isClosed) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  private async say(text: string) {
    this.emit({ type: "said", text });
    await this.pause(400 + text.split(" ").length * 38);
  }

  private async work(text: string, ms: number) {
    this.emit({ type: "working", text });
    await this.pause(ms);
    this.emit({ type: "worked" });
  }

  private ask(isFork: boolean, choices: Choice[]) {
    this.pending = new Map(choices.map((choice) => [choice.id, choice.next]));
    this.emit({
      type: "asked",
      isFork,
      options: choices.map(({ next: _next, ...option }) => option),
    });
  }

  private onMessage(text: string) {
    if (this.hasBegun) {
      this.emit({ type: "wrote", text });
      void this.say("Anotado. Lo aplico en tu ruta.");
      return;
    }
    this.hasBegun = true;
    void this.begin(text);
  }

  private onChoice(optionId: string) {
    const next = this.pending.get(optionId);
    if (next) {
      this.pending = new Map();
      this.emit({ type: "chose", optionId });
      void next();
    }
  }

  private onPublish(isConfirmed: boolean) {
    if (isConfirmed) {
      this.emit({ type: "published", address: ADDRESS });
      void this.say(
        "Publicada. Tus alumnos ya pueden empezar el módulo 1 gratis. ¿Pido que aparezca en el catálogo?",
      );
      return;
    }
    this.emit({ type: "declined" });
    this.emit({ type: "stepped", step: "page" });
    void this.say("Queda guardada como borrador.").then(() => this.offerPublish());
  }

  private async begin(text: string) {
    this.emit({ type: "began", text });
    await this.say("Vamos a armarla juntos. ¿Ya tienes contenido tuyo, o empezamos desde cero?");
    this.ask(true, [
      {
        id: "mine",
        label: "Tengo contenido",
        decision: "Con tus guías",
        next: () => this.content(),
      },
      { id: "zero", label: "Desde cero", next: () => this.audience() },
      {
        id: "both",
        label: "Un poco de los dos",
        decision: "Lo tuyo y lo nuevo",
        next: () => this.content(),
      },
    ]);
  }

  private async content() {
    this.emit({ type: "stepped", step: "content" });
    await this.say("Súbelas aquí y las leo sin cambiar tus palabras.");
    await this.work("Leyendo guias-algebra.pdf, 18 páginas…", 1600);
    await this.audience();
  }

  private async audience() {
    this.emit({ type: "stepped", step: "content" });
    await this.say("¿Para quién es?");
    const next = () => this.plan();
    this.ask(true, [
      { id: "school", label: "Colegio", decision: "Para colegio", next },
      { id: "university", label: "Universidad", decision: "Para universidad", next },
      { id: "adults", label: "Adultos que vuelven", decision: "Para adultos", next },
    ]);
  }

  private planned() {
    const lessons = this.withPractice ? 9 : 8;
    this.emit({
      type: "planned",
      title: ROUTE_TITLE,
      summary: `3 módulos, ${lessons} temas. El módulo 1 es gratis.`,
      modules: demoModules(this.withPractice),
    });
  }

  private async plan() {
    this.emit({ type: "stepped", step: "plan" });
    await this.work("Pensando un plan con lo que me dijiste…", 1300);
    this.planned();
    await this.say("Te propongo esta ruta: 3 módulos y 8 temas, con tus palabras. ¿La armo así?");
    this.ask(false, [
      { id: "ok", label: "Así está bien", next: () => this.build(false) },
      { id: "practice", label: "Agrega práctica de fracciones", next: () => this.build(true) },
    ]);
  }

  private async build(withPractice: boolean) {
    this.emit({ type: "stepped", step: "build" });
    if (withPractice) {
      this.withPractice = true;
      await this.work("Agregando un tema al módulo 2…", 900);
      this.planned();
    }
    await this.work("Construyendo el módulo 1…", 1500);
    this.emit({ type: "built", stations: 4 });
    this.emit({
      type: "previewed",
      preview: {
        station: 1,
        title: "¿Qué es una variable?",
        format: "concepto y pregunta",
        body: "Una variable es una caja con nombre: guarda un número que todavía no conocemos.",
        question: { prompt: "Si 2 + x = 9, ¿qué guarda x?", options: ["5", "7", "11"], answer: 1 },
      },
    });
    await this.say(
      withPractice
        ? 'Agregué "Práctica de fracciones" y construí el módulo 1. Así verá tu alumno el primer tema.'
        : "Listo el módulo 1. Así verá tu alumno el primer tema.",
    );
    this.offerRest();
  }

  private offerRest() {
    const rest = {
      id: "rest",
      label: "Sigue con el resto",
      isPrimary: true,
      next: () => this.rest(),
    };
    this.ask(false, [
      rest,
      {
        id: "look",
        label: "Quiero revisar yo",
        next: async () => {
          await this.say("Claro. Abre la vista previa completa y dime qué cambio.");
          this.ask(false, [rest]);
        },
      },
    ]);
  }

  private async rest() {
    const total = this.withPractice ? 12 : 11;
    this.emit({ type: "previewed", preview: null });
    await this.work("Construyendo el módulo 2…", 1300);
    this.emit({ type: "built", stations: this.withPractice ? 8 : 7 });
    this.emit({ type: "stepped", step: "review" });
    await this.work("Revisando exactitud, nivel y claridad…", 1200);
    await this.say(
      "La revisión encontró una cosa: en el tema 5, tu respuesta final 2/4 se puede simplificar. La dejé como 1/2 y te la marqué.",
    );
    await this.work("Construyendo el módulo 3…", 1400);
    this.emit({ type: "built", stations: total });
    this.emit({ type: "stepped", step: "page" });
    await this.say("Tu ruta está completa. ¿La publico en tu página?");
    this.offerPublish(true);
  }

  private offerPublish(withLater = false) {
    const publish = {
      id: "publish",
      label: "Publícala",
      isPrimary: true,
      next: () => this.confirm(),
    };
    const later = {
      id: "later",
      label: "Todavía no",
      next: async () => {
        await this.say('Queda guardada como borrador. Cuando quieras, me dices "publícala".');
        this.ask(false, [publish]);
      },
    };
    this.ask(false, withLater ? [publish, later] : [publish]);
  }

  private async confirm() {
    this.emit({ type: "stepped", step: "publish" });
    this.emit({ type: "confirming", address: ADDRESS, price: "$12" });
  }
}
