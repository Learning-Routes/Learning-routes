// The conversation with a creator's assistant (Platform STEP 10), as the page sees it.
//
// The agent streams `StudioEvent`s; the page answers with `StudioInput`s. `studioReducer` folds the
// events into what the page draws: the assistant's last words, the choices it offers, the trail of
// what the creator decided, the planned route and how much of it is built. It is pure, so the page,
// the agent's tests and a scripted demo all share one meaning for every event.

/** Where the page opens its WebSocket to the assistant, on the app's host. */
export const STUDIO_PATH = "/creador/asistente/conexion";

/** The guided steps, in order. The page shows `STUDIO_STEPS.length` ticks. */
export const STUDIO_STEPS = [
  "meet",
  "content",
  "plan",
  "build",
  "review",
  "page",
  "publish",
] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export interface StudioOption {
  id: string;
  label: string;
  /** What stays written on the trail once it is chosen, such as "Para colegio". */
  decision?: string;
  /** The one choice that moves the work forward, drawn as the main action. */
  isPrimary?: boolean;
}

export interface PlannedLesson {
  title: string;
  /** Added after the creator asked for it, so the page can mark it. */
  isNew?: boolean;
}

export interface PlannedModule {
  title: string;
  lessons: PlannedLesson[];
}

/** One lesson as a student will see it, shown beside its station while the route is built. */
export interface LessonPreview {
  /** The lesson's place among the plan's stations, from 0: modules and lessons in order. */
  station: number;
  title: string;
  /** The block format, in words, such as "concepto y pregunta". */
  format: string;
  body: string;
  question?: { prompt: string; options: string[]; answer: number };
  previewUrl?: string;
}

export type StudioEvent =
  | { type: "began"; text: string }
  | { type: "stepped"; step: StudioStep }
  | { type: "said"; text: string }
  | { type: "working"; text: string }
  | { type: "worked" }
  /** `isFork`: each option is a branch of the trail the creator can walk. */
  | { type: "asked"; options: StudioOption[]; isFork: boolean }
  | { type: "chose"; optionId: string }
  | { type: "planned"; title: string; summary: string; modules: PlannedModule[] }
  /** How many of the plan's stations are built, counting modules and lessons in order. */
  | { type: "built"; stations: number }
  | { type: "previewed"; preview: LessonPreview | null }
  | { type: "confirming"; address: string; price: string | null }
  /** The creator said not yet: the question goes away and nothing is published. */
  | { type: "declined" }
  | { type: "published"; address: string };

/** What the page sends back. Publishing always needs the creator's explicit yes. */
export type StudioInput =
  | { type: "message"; text: string }
  | { type: "choice"; optionId: string }
  | { type: "publish"; isConfirmed: boolean };

export interface TrailStop {
  /** Which branch was walked, of how many: the map draws the fork it came from. */
  branch: number;
  branches: number;
  decision: string;
}

export interface StudioState {
  hasBegun: boolean;
  /** The creator's first words, kept at the trail's start. */
  opening: string | null;
  step: StudioStep;
  said: string;
  working: string | null;
  options: StudioOption[];
  isFork: boolean;
  trail: TrailStop[];
  route: { title: string; summary: string; modules: PlannedModule[] } | null;
  built: number;
  preview: LessonPreview | null;
  confirming: { address: string; price: string | null } | null;
  publishedAt: string | null;
}

export const INITIAL_STUDIO_STATE: StudioState = {
  hasBegun: false,
  opening: null,
  step: "meet",
  said: "",
  working: null,
  options: [],
  isFork: false,
  trail: [],
  route: null,
  built: 0,
  preview: null,
  confirming: null,
  publishedAt: null,
};

/** The plan's stations in order: each module, then its lessons. The map draws one per entry. */
export function planStations(modules: readonly PlannedModule[]) {
  return modules.flatMap((module, moduleIndex) => [
    { kind: "module" as const, moduleIndex, title: module.title, isNew: false },
    ...module.lessons.map((lesson) => ({
      kind: "lesson" as const,
      moduleIndex,
      title: lesson.title,
      isNew: lesson.isNew === true,
    })),
  ]);
}

export function studioReducer(state: StudioState, event: StudioEvent): StudioState {
  switch (event.type) {
    case "began":
      return { ...state, hasBegun: true, opening: event.text };
    case "stepped":
      return { ...state, step: event.step };
    case "said":
      return { ...state, said: event.text };
    case "working":
      return { ...state, working: event.text };
    case "worked":
      return { ...state, working: null };
    case "asked":
      return { ...state, options: event.options, isFork: event.isFork };
    case "chose": {
      const branch = state.options.findIndex((option) => option.id === event.optionId);
      const chosen = state.options[branch];
      if (!chosen) {
        return state;
      }
      const trail = state.isFork
        ? [
            ...state.trail,
            { branch, branches: state.options.length, decision: chosen.decision ?? chosen.label },
          ]
        : state.trail;
      return { ...state, options: [], isFork: false, trail };
    }
    case "planned": {
      const stations = planStations(event.modules).length;
      return {
        ...state,
        route: { title: event.title, summary: event.summary, modules: event.modules },
        built: Math.min(state.built, stations),
      };
    }
    case "built": {
      const stations = state.route ? planStations(state.route.modules).length : 0;
      return { ...state, built: Math.max(0, Math.min(event.stations, stations)) };
    }
    case "previewed":
      return { ...state, preview: event.preview };
    case "confirming":
      return { ...state, confirming: { address: event.address, price: event.price }, options: [] };
    case "declined":
      return { ...state, confirming: null };
    case "published":
      return { ...state, confirming: null, publishedAt: event.address };
  }
}
