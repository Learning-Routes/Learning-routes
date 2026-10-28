// The block vocabulary, declared once (lesson 8). Replaces v1's
// ContentEngine::LessonBlocks and the type lists in LearningRoutesEngine::BlockGrader.
// v1's `partial` and `chrome` were view concerns of the Rails app and are not ported.

interface BlockSpec {
  /** The `:::name` an author writes, or null when the type has no fence. */
  fence: string | null;
  /** "## Prefix:" headings that open the type, in v1's order. */
  headings: readonly string[];
  /** False when the platform adds the block and no author writes it. */
  authored: boolean;
  /** Whether a submission can be graded right or wrong. */
  gradable: boolean;
  /** Whether the block must be satisfied before the lesson completes. */
  gating: boolean;
  /** v1's default title, used when the author gave none (en and es only in v1). */
  defaultTitle: { en: string; es: string };
}

const BLOCKS = {
  concept: {
    fence: "concept",
    headings: ["Concepto", "Concept"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Concept", es: "Concepto" },
  },
  check: {
    fence: "check",
    headings: ["Pregunta", "Question"],
    authored: true,
    gradable: true,
    gating: true,
    defaultTitle: { en: "Check your understanding", es: "Comprueba tu conocimiento" },
  },
  tip: {
    fence: "tip",
    headings: ["Tip", "Consejo"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Tip", es: "Consejo" },
  },
  example: {
    fence: "example",
    headings: ["Ejemplo", "Example"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Example", es: "Ejemplo" },
  },
  summary: {
    fence: "summary",
    headings: ["Resumen", "Summary"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Summary", es: "Resumen" },
  },
  drag_drop: {
    fence: "drag_drop",
    headings: ["Match", "Emparejar"],
    authored: true,
    gradable: true,
    gating: true,
    defaultTitle: { en: "Match", es: "Emparejar" },
  },
  fill_blank: {
    fence: "fill_blank",
    headings: ["Complete", "Completa"],
    authored: true,
    gradable: true,
    gating: true,
    defaultTitle: { en: "Complete", es: "Completa" },
  },
  code_playground: {
    fence: "code_playground",
    headings: ["Playground"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Playground", es: "Práctica" },
  },
  simulation: {
    fence: "simulation",
    headings: ["Simulation", "Simulacion"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Simulation", es: "Simulación" },
  },
  scenario: {
    fence: "scenario",
    headings: ["Scenario", "Escenario"],
    authored: true,
    gradable: false,
    gating: true,
    defaultTitle: { en: "Scenario", es: "Escenario" },
  },
  flashcards: {
    fence: "flashcards",
    headings: ["Flashcards"],
    authored: true,
    gradable: false,
    gating: true,
    defaultTitle: { en: "Flashcards", es: "Tarjetas" },
  },
  visual: {
    fence: null,
    headings: ["Visual"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Visual", es: "Visual" },
  },
  motion: {
    fence: null,
    headings: ["Motion"],
    authored: true,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Motion", es: "Movimiento" },
  },
  audio: {
    fence: null,
    headings: [],
    authored: false,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Audio", es: "Audio" },
  },
  audio_explainer: {
    fence: null,
    headings: [],
    authored: false,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Audio explanation", es: "Audio explicación" },
  },
  video: {
    fence: null,
    headings: ["Video", "Vídeo"],
    authored: false,
    gradable: false,
    gating: false,
    defaultTitle: { en: "Video", es: "Vídeo" },
  },
} as const satisfies Record<string, BlockSpec>;

export type BlockTypeName = keyof typeof BLOCKS;

const entries = Object.entries(BLOCKS) as [BlockTypeName, BlockSpec][];

export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockTypeName[];
export const AUTHORED_BLOCK_TYPES = entries
  .filter(([, spec]) => spec.authored)
  .map(([type]) => type);
export const SYSTEM_BLOCK_TYPES = entries
  .filter(([, spec]) => !spec.authored)
  .map(([type]) => type);

/** v1 `LessonBlocks.known?`: exact, case-sensitive. */
export function isKnownBlockType(type: string): type is BlockTypeName {
  return Object.hasOwn(BLOCKS, type);
}

/** v1 `LessonBlocks.fence_types`. */
export function fenceTypes(): string[] {
  return entries.flatMap(([, spec]) => (spec.fence ? [spec.fence] : []));
}

/** v1 `LessonBlocks.heading_map`: "## Prefix:" to type. */
export function headingMap(): Record<string, BlockTypeName> {
  return Object.fromEntries(
    entries.flatMap(([type, spec]) => spec.headings.map((heading) => [heading, type])),
  );
}

/** v1 `LessonBlocks.default_title`, resolved when read; null for an unknown type. */
export function defaultTitle(type: string, locale: "en" | "es"): string | null {
  return isKnownBlockType(type) ? BLOCKS[type].defaultTitle[locale] : null;
}

/**
 * v1 `BlockGrader.gradable?` and `.gating?`. A type that is not gradable is
 * engagement only, including any type nobody declared, so a new type can never
 * trap a student behind a gate it cannot grade.
 */
export function blockRole(type: string) {
  const spec: BlockSpec | null = isKnownBlockType(type) ? BLOCKS[type] : null;
  const gradable = spec?.gradable ?? false;
  return { gradable, gating: spec?.gating ?? false, engagementOnly: !gradable };
}
