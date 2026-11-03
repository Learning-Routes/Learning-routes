import * as z from "zod";
import { checkBrandColor } from "../brand-color";
import { SpaceRole } from "../domain";
import { LocalizedText } from "../localized-text";
import { checkMembershipChange } from "../memberships";
import { isReservedSlug } from "../reserved-slugs";
import { ActionError, defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// A space and who belongs to it (Platform STEP 2 §6).

const HOST_LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_HOST_LABEL = 63;

/** A space's address, which is its host. Whatever makes a space uses this too. */
export const SpaceSlug = z
  .string()
  .refine((slug) => !isReservedSlug(slug), {
    message: "the platform keeps this address for itself: choose another",
    abort: true,
  })
  .regex(HOST_LABEL, "lower-case letters and numbers, joined by hyphens")
  .max(MAX_HOST_LABEL);

export const spaceGet = defineAction({
  name: "space.get",
  kind: "query",
  description: "Read a space: its name, slug and locales.",
  input: z.strictObject({ spaceId: z.uuid() }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  run: async (ctx, input) => unwrap(await ctx.repos.spaces.get(input.spaceId)),
});

/** What the creator's page says, and the colour of its actions (Platform STEP 4 §2.1). */
export const spaceUpdate = defineAction({
  name: "space.update",
  kind: "mutation",
  description:
    "Change a space's address, tagline, bio or brand colour. Owners only, from the app only.",
  input: z.strictObject({
    spaceId: z.uuid(),
    slug: SpaceSlug.optional(),
    tagline: LocalizedText.nullish(),
    bio: LocalizedText.nullish(),
    brandColor: z.string().nullish(),
  }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, { spaceId, brandColor, ...text }) {
    if (brandColor === undefined || brandColor === null) {
      unwrap(await ctx.repos.spaces.update(spaceId, { ...text, brandColor }));
      return { spaceId };
    }
    const checked = checkBrandColor(brandColor);
    if (!checked.ok) {
      throw new ActionError("invalid", checked.message);
    }
    unwrap(await ctx.repos.spaces.update(spaceId, { ...text, brandColor: checked.color }));
    return { spaceId };
  },
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
