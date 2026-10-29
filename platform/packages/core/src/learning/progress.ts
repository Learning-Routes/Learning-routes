import type { Snapshot } from "../content/snapshot";
import type { Progress } from "../domain";

// Progress against a version (Platform STEP 2 §2.12). Progress is keyed by the
// stable lesson id, so it survives a new version. A lesson the pinned version no
// longer has keeps its progress, but it is not counted.

/** Completed lessons of the version, its lesson count, and progress on lessons it lacks. */
export function progressSummary(
  version: Snapshot,
  records: readonly { lessonId: string; status: Progress["status"] }[],
) {
  const lessons = new Set(version.lessons.map((lesson) => lesson.id));
  const counted = records.filter((record) => lessons.has(record.lessonId));
  return {
    completed: counted.filter((record) => record.status === "completed").length,
    total: lessons.size,
    uncounted: records.length - counted.length,
  };
}
