import * as z from "zod";
import { lessonView, placeInRoute } from "../content/lesson-view";
import type { Repos } from "../repos/ports";
import { defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// Enrolling, and moving an enrollment to a newer version (Platform STEP 2 §6).

/** The actor's own active enrollment, or not_found: another's, or a revoked one, does not exist for them. */
export async function ownEnrollment(
  repos: Repos,
  spaceId: string,
  enrollmentId: string,
  userId: string,
) {
  const enrollment = await repos.enrollments.get(spaceId, enrollmentId);
  if (
    !enrollment.ok ||
    enrollment.value.userId !== userId ||
    enrollment.value.status !== "active"
  ) {
    throw refused("not_found");
  }
  return enrollment.value;
}

/** The only way to become a student (§3.8): the database checks the route is published and open. */
export const enrollmentCreate = defineAction({
  name: "enrollment.create",
  kind: "mutation",
  description: "Enrol in a published, open route, as a student of its space. Module 1 is free.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: (input) => ({ kind: "route", id: input.routeId, self: true }),
  run: async (ctx, input) => unwrap(await ctx.repos.enrollments.enroll(input.routeId)),
});

/** "Mis rutas" (Platform STEP 4 §6.2): only ever the actor's own. */
export const enrollmentList = defineAction({
  name: "enrollment.list",
  kind: "query",
  description: "List your own active enrollments, and whether you teach anywhere.",
  input: z.strictObject({}),
  target: () => ({ kind: "account", id: "self", self: true }),
  run: (ctx) => ctx.repos.enrollments.listOwn(ctx.actor.userId),
});

export const enrollmentUpgrade = defineAction({
  name: "enrollment.upgrade",
  kind: "mutation",
  description:
    "Move your enrollment to the route's latest published version. Progress is kept by lesson.",
  input: z.strictObject({ enrollmentId: z.uuid() }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (ctx, input, given) =>
    unwrap(await ctx.repos.enrollments.upgrade(inSpace(given).spaceId, input.enrollmentId)),
});

/** A topic of the actor's own enrollment, at the version they are on. Reads only: saving is STEP 8. */
export const lessonRead = defineAction({
  name: "lesson.read",
  kind: "query",
  description: "Read a topic of your own enrollment. With no topic, the one you are on.",
  input: z.strictObject({
    enrollmentId: z.uuid(),
    topic: z.int().positive().max(10_000).optional(),
  }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const enrollment = await ownEnrollment(
      ctx.repos,
      spaceId,
      input.enrollmentId,
      ctx.actor.userId,
    );
    const { snapshot } = unwrap(
      await ctx.repos.routeVersions.get(spaceId, enrollment.routeId, enrollment.pinnedVersion),
    );
    const progress = await ctx.repos.learning.progress(spaceId, enrollment.id);
    const completed = progress
      .filter((record) => record.status === "completed")
      .map((record) => record.lessonId);
    const space = unwrap(await ctx.repos.spaces.get(spaceId));
    const view = lessonView(snapshot, input.topic ?? placeInRoute(snapshot, completed).number, {
      spaceId,
      kind: "p",
      creator: space.name,
    });
    if (view === null) {
      throw refused("not_found");
    }
    return view;
  },
});
