import * as z from "zod";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// Enrolling, and moving an enrollment to a newer version (Platform STEP 2 §6).

/** The only way to become a student (§3.8): the database checks the route is published, open and free. */
export const enrollmentCreate = defineAction({
  name: "enrollment.create",
  kind: "mutation",
  description: "Enrol in a published, open and free route, as a student of its space.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: () => "self",
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
    const enrollment = await ctx.repos.enrollments.get(spaceId, input.enrollmentId);
    if (
      !enrollment.ok ||
      enrollment.value.userId !== ctx.actor.userId ||
      enrollment.value.status !== "active"
    ) {
      throw new ActionError("not_found", "not found");
    }
    const latest = await ctx.repos.routeVersions.latest(spaceId, enrollment.value.routeId);
    if (latest !== null && latest > enrollment.value.pinnedVersion) {
      unwrap(await ctx.repos.enrollments.setPinnedVersion(spaceId, input.enrollmentId, latest));
      return { pinnedVersion: latest };
    }
    return { pinnedVersion: enrollment.value.pinnedVersion };
  },
});
