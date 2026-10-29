import * as z from "zod";
import { SpaceRole } from "../domain";
import { checkMembershipChange } from "../memberships";
import { defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// A space and who belongs to it (Platform STEP 2 §6).

export const spaceGet = defineAction({
  name: "space.get",
  kind: "query",
  description: "Read a space: its name, slug and locales.",
  input: z.strictObject({ spaceId: z.uuid() }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  run: async (ctx, input) => unwrap(await ctx.repos.spaces.get(input.spaceId)),
});

/** Adds an existing user by id. Email invitations come later. */
export const membershipAdd = defineAction({
  name: "membership.add",
  kind: "mutation",
  description: "Give an existing user a role in the space. Owners only, from the app only.",
  input: z.strictObject({ spaceId: z.uuid(), userId: z.uuid(), role: SpaceRole }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const scope = inSpace(given);
    const members = await ctx.repos.memberships.list(scope.spaceId);
    const actor = { userId: ctx.actor.userId, role: scope.role };
    const refusal = checkMembershipChange(members, actor, {
      kind: "add",
      userId: input.userId,
      role: input.role,
    });
    if (refusal !== null) {
      throw refused(refusal);
    }
    unwrap(
      await ctx.repos.memberships.add(scope.spaceId, { userId: input.userId, role: input.role }),
    );
    return { userId: input.userId, role: input.role };
  },
});
