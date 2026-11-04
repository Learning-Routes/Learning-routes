import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENT, ENROLLMENTS, ROUTE, testCtx, testWorld } from "./test-ctx";

// The test world's published route, with one topic on it.
function worldWithATopic() {
  const world = testWorld();
  const snapshot = world.versions.get(`${ROUTE}:1`)?.snapshot;
  snapshot?.lessons.push({
    id: "0192d3a0-0000-7000-8000-0000000000c1",
    moduleId: snapshot.modules[0]?.id ?? "",
    position: "V",
    title: { en: "A topic" },
  });
  return world;
}

describe("lesson.read", () => {
  it("reads a topic of the student's own enrollment", async () => {
    const world = worldWithATopic();
    const answer = await runAction(
      ACTIONS,
      "lesson.read",
      { enrollmentId: ENROLLMENT },
      testCtx("ui", world, "student-1"),
    );
    expect(answer).toMatchObject({ ok: true, output: { locked: false, topicNumber: 1 } });
  });

  it("does not exist for another student", async () => {
    const world = worldWithATopic();
    const answer = await runAction(
      ACTIONS,
      "lesson.read",
      { enrollmentId: ENROLLMENTS["student-2"] },
      testCtx("ui", world, "student-1"),
    );
    expect(answer).toMatchObject({ ok: false, code: "not_found" });
  });

  it("answers not_found for a topic past the route's end", async () => {
    const world = worldWithATopic();
    const answer = await runAction(
      ACTIONS,
      "lesson.read",
      { enrollmentId: ENROLLMENT, topic: 999 },
      testCtx("ui", world, "student-1"),
    );
    expect(answer).toMatchObject({ ok: false, code: "not_found" });
  });
});
