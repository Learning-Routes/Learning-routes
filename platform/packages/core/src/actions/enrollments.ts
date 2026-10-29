import * as z from "zod";
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

/** The only way to become a student (§3.8): the database checks the route is published, open and free. */
export const enrollmentCreate = defineAction({
  name: "enrollment.create",
  kind: "mutation",
  description: "Enrol in a published, open and free route, as a student of its space.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: (input) => ({ kind: "route", id: input.routeId, self: true }),
  run: async (ctx, input) => unwrap(await ctx.repos.enrollments.enroll(input.routeId)),
});

export const enrollmentUpgrade = defineAction({
  name: "enrollment.upgrade",
  kind: "mutation",
  description:
    "Move your enrollment to the route's latest published version. Progress is kept by lesson.",
  input: z.strictObject({ enrollmentId: z.uuid() }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const enrollment = await ownEnrollment(
      ctx.repos,
      spaceId,
      input.enrollmentId,
      ctx.actor.userId,
    );
    const latest = await ctx.repos.routeVersions.latest(spaceId, enrollment.routeId);
    if (latest !== null && latest > enrollment.pinnedVersion) {
      unwrap(await ctx.repos.enrollments.setPinnedVersion(spaceId, input.enrollmentId, latest));
      return { pinnedVersion: latest };
    }
    return { pinnedVersion: enrollment.pinnedVersion };
  },
});
