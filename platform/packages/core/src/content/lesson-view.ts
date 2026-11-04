import type { LocalizedText } from "../localized-text";
import type { Snapshot } from "./snapshot";

// A topic as a student reads it (docs/design/reference/vision/pages.html, "Un tema"): where it sits
// in the route, and its blocks. Paying arrives in Platform STEP 9: until then, what lies past the
// free first module of a paid route is locked, and never leaves the server.

/** What this screen shows. The exercises and media arrive with Platform STEP 8. */
const SHOWN_BLOCKS = new Set(["concept", "tip", "example", "summary", "check"]);

export interface LessonBlock {
  id: string;
  kind: string;
  data: Record<string, unknown>;
}

export interface LessonView {
  locked: boolean;
  routeTitle: LocalizedText;
  sourceLocale: string;
  title: LocalizedText;
  moduleNumber: number;
  moduleTitle: LocalizedText;
  topicInModule: number;
  topicsInModule: number;
  topicNumber: number;
  topicTotal: number;
  lessonsPerModule: number[];
  blocks: LessonBlock[];
  next: { number: number; title: LocalizedText } | null;
}

type Outline = Pick<Snapshot, "modules" | "lessons">;

/** The topics of a route in order: by module, then by place in it. */
function topicsInOrder(snapshot: Outline) {
  return snapshot.modules.flatMap((module, moduleIndex) =>
    snapshot.lessons
      .filter((lesson) => lesson.moduleId === module.id)
      .map((lesson) => ({ lesson, module, moduleIndex })),
  );
}

/** The topic with this number, from 1, or null when the route has no such topic. */
export function lessonView(snapshot: Snapshot, number: number): LessonView | null {
  const topics = topicsInOrder(snapshot);
  const topic = topics[number - 1];
  if (topic === undefined) {
    return null;
  }
  const { lesson, module, moduleIndex } = topic;
  const locked = snapshot.route.pricing === "paid" && moduleIndex > 0;
  const siblings = topics.filter((other) => other.moduleIndex === moduleIndex);
  const following = topics[number];
  return {
    locked,
    routeTitle: snapshot.route.title,
    sourceLocale: snapshot.route.sourceLocale,
    title: lesson.title,
    moduleNumber: moduleIndex + 1,
    moduleTitle: module.title,
    topicInModule: siblings.findIndex((other) => other.lesson.id === lesson.id) + 1,
    topicsInModule: siblings.length,
    topicNumber: number,
    topicTotal: topics.length,
    lessonsPerModule: snapshot.modules.map(
      (each) => snapshot.lessons.filter((other) => other.moduleId === each.id).length,
    ),
    blocks: locked
      ? []
      : snapshot.blocks
          .filter((block) => block.lessonId === lesson.id && SHOWN_BLOCKS.has(block.kind))
          .map(({ id, kind, data }) => ({ id, kind, data })),
    next: following ? { number: number + 1, title: following.lesson.title } : null,
  };
}

/** Where a student carries on: the first topic not finished, or the last once all are. */
export function placeInRoute(snapshot: Outline, completedIds: readonly string[]) {
  const topics = topicsInOrder(snapshot);
  const index = topics.findIndex(({ lesson }) => !completedIds.includes(lesson.id));
  const number = index === -1 ? topics.length : index + 1;
  return {
    number: Math.max(1, number),
    title: topics[number - 1]?.lesson.title ?? null,
    finished: topics.length > 0 && index === -1,
  };
}
