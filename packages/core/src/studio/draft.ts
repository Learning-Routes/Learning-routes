import type { LocalizedText } from "../localized-text";
import type { RouteDraft } from "../repos/ports";
import type { LessonPreview, PlannedModule } from "./session";

// What the assistant shows of a route (Platform STEP 10 §1): always read from the real draft, never
// from what the model says it wrote. Pure: the agent reads the draft and passes it in.

const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** The text in the creator's language, else the route's own, else any. */
function textIn(text: LocalizedText | null | undefined, locale: string, source: string): string {
  if (!text) {
    return "";
  }
  const byLocale = text as Record<string, string | undefined>;
  return byLocale[locale] ?? byLocale[source] ?? Object.values(byLocale)[0] ?? "";
}

function ordered(draft: RouteDraft) {
  const modules = [...draft.modules].sort(byPosition);
  return modules.map((module) => ({
    module,
    lessons: draft.lessons.filter((lesson) => lesson.moduleId === module.id).sort(byPosition),
  }));
}

/**
 * The "planned" event for a draft. `shownLessonIds` are the lessons of the plan the creator first
 * saw: any other lesson is marked new. null before the plan was shown.
 */
export function plannedOf(
  draft: RouteDraft,
  locale: string,
  shownLessonIds: ReadonlySet<string> | null,
): { title: string; summary: string; modules: PlannedModule[] } {
  const source = draft.route.sourceLocale;
  return {
    title: textIn(draft.route.title, locale, source),
    summary: textIn(draft.route.description, locale, source),
    modules: ordered(draft).map(({ module, lessons }) => ({
      title: textIn(module.title, locale, source),
      lessons: lessons.map((lesson) => ({
        title: textIn(lesson.title, locale, source),
        ...(shownLessonIds && !shownLessonIds.has(lesson.id) ? { isNew: true } : {}),
      })),
    })),
  };
}

/** How many stations are built, in order: a lesson is built once it has a block, a module once its first lesson is. */
export function builtOf(draft: RouteDraft): number {
  const withBlocks = new Set(draft.blocks.map((block) => block.lessonId));
  let built = 0;
  for (const { lessons } of ordered(draft)) {
    if (!(lessons[0] && withBlocks.has(lessons[0].id))) {
      return built;
    }
    built += 1;
    for (const lesson of lessons) {
      if (!withBlocks.has(lesson.id)) {
        return built;
      }
      built += 1;
    }
  }
  return built;
}

type Data = Record<string, unknown>;

function questionOf(data: Data, locale: string, source: string) {
  const options = (data.options ?? []) as { label: LocalizedText; correct: boolean }[];
  return {
    prompt: textIn(data.question as LocalizedText, locale, source),
    options: options.map((option) => textIn(option.label, locale, source)),
    answer: Math.max(
      0,
      options.findIndex((option) => option.correct),
    ),
  };
}

/**
 * A lesson as a student will see it, at its station on the map; null when it is not in the draft.
 * `kindNames` says each kind of block in the creator's words; a kind it does not name is left out.
 */
export function lessonPreviewOf(
  draft: RouteDraft,
  lessonId: string,
  locale: string,
  previewUrl: string,
  kindNames: Partial<Record<string, string>>,
): LessonPreview | null {
  const source = draft.route.sourceLocale;
  const lesson = draft.lessons.find((each) => each.id === lessonId);
  if (!lesson) {
    return null;
  }
  // Stations run module, its lessons, next module…: as planStations draws them.
  let station = 0;
  for (const { module, lessons } of ordered(draft)) {
    station += 1;
    if (module.id === lesson.moduleId) {
      station += lessons.findIndex((each) => each.id === lessonId);
      break;
    }
    station += lessons.length;
  }
  const blocks = draft.blocks.filter((block) => block.lessonId === lessonId).sort(byPosition);
  const body = blocks.find((block) => typeof (block.data as Data).body === "object");
  const check = blocks.find((block) => block.kind === "check");
  return {
    station,
    title: textIn(lesson.title, locale, source),
    format: [...new Set(blocks.map((block) => kindNames[block.kind]).filter(Boolean))].join(", "),
    body: body ? textIn((body.data as Data).body as LocalizedText, locale, source) : "",
    ...(check ? { question: questionOf(check.data as Data, locale, source) } : {}),
    previewUrl,
  };
}
