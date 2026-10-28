// A route's lessons form a graph through their prerequisites (Platform STEP 2
// §2.8). It must stay acyclic, or some lesson could never be reached.

export interface Prerequisite {
  lessonId: string;
  requiresLessonId: string;
}

/** Whether adding edge to the existing, acyclic edges would close a cycle. */
export function createsCycle(edges: readonly Prerequisite[], edge: Prerequisite): boolean {
  const requires = new Map<string, string[]>();
  for (const { lessonId, requiresLessonId } of edges) {
    requires.set(lessonId, [...(requires.get(lessonId) ?? []), requiresLessonId]);
  }
  // A cycle closes when the required lesson already leads back to the lesson.
  const stack = [edge.requiresLessonId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const lesson = stack.pop() as string;
    if (lesson === edge.lessonId) {
      return true;
    }
    if (!seen.has(lesson)) {
      seen.add(lesson);
      stack.push(...(requires.get(lesson) ?? []));
    }
  }
  return false;
}
