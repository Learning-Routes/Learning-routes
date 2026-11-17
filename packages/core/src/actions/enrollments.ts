import * as z from "zod";
import { PLATFORM_BLOCK_TYPES } from "../blocks/types";
import { lessonView, placeInRoute } from "../content/lesson-view";
import { forLearner } from "../content/player-view";
import type { Repos } from "../repos/ports";
import { defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// Enrolling, and moving an enrollment to a newer version (Platform STEP 2 §6).

/**
 * The actor's own active enrollment with its snapshot and its space, in one read (Platform STEP
 * 15), or not_found, as ownEnrollment.
 */
export async function ownReading(
  repos: Repos,
  spaceId: string,
  enrollmentId: string,
  userId: string,
) {
  const found = await repos.enrollments.reading(spaceId, enrollmentId);
  const enrollment = found.ok ? found.value.enrollment : null;
  if (!found.ok || enrollment?.userId !== userId || enrollment.status !== "active") {
    throw refused("not_found");
  }
  return found.value;
}

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
  description: "List your own active enrollments, whether you teach anywhere, and your name.",
  input: z.strictObject({}),
  target: () => ({ kind: "account", id: "self", self: true }),
  // The name comes with the list, so Mis rutas reads the session once, not twice (Platform STEP 15).
  run: async (ctx) => ({
    ...(await ctx.repos.enrollments.listOwn(ctx.actor.userId)),
    name: ctx.actor.name?.trim() ?? "",
  }),
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
    // Two queries: the enrollment with its version and space, then its progress (Platform STEP 15).
    const { enrollment, snapshot, space } = await ownReading(
      ctx.repos,
      spaceId,
      input.enrollmentId,
      ctx.actor.userId,
    );
    const progress = await ctx.repos.learning.progress(spaceId, enrollment.id);
    const completed = progress
      .filter((record) => record.status === "completed")
      .map((record) => record.lessonId);
    const view = lessonView(snapshot, input.topic ?? placeInRoute(snapshot, completed).number, {
      spaceId,
      kind: "p",
      creator: space.name,
    });
    if (view === null) {
      throw refused("not_found");
    }
    // The player's kinds are answered in the player, so the reading page gets them without answers.
    const blocks = view.blocks.map((block) =>
      (PLATFORM_BLOCK_TYPES as readonly string[]).includes(block.kind)
        ? { ...block, data: forLearner(block.id, block.kind, block.data) }
        : block,
    );
    return { ...view, blocks };
  },
});
