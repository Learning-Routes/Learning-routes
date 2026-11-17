import * as z from "zod";
import { DisplayName } from "../community/text";
import { defineAction } from "./define";
import { refused, unwrap } from "./results";

// What a person does for themselves in the community (Platform STEP 17): follow a creator's
// space, block someone, read their feed and notifications, and say how they appear. Each acts on
// the actor's own rows only, which row-level security holds too.

const SELF = { kind: "account", id: "self", self: true } as const;
const PAGE = 20;
const Paged = {
  before: z.strictObject({ at: z.int().nonnegative(), id: z.uuid() }).nullish(),
  limit: z.int().min(1).max(50).optional(),
};
const page = (input: {
  before?: { at: number; id: string } | null | undefined;
  limit?: number | undefined;
}) => ({
  before: input.before ?? null,
  limit: input.limit ?? PAGE,
});

export const communityFollow = defineAction({
  name: "community.follow",
  kind: "mutation",
  description: "Follow a space, or stop.",
  input: z.strictObject({ spaceId: z.uuid(), follow: z.boolean() }),
  // The account's, not the space's: a follower is no member, and the log keeps it in no space.
  target: () => SELF,
  run: async (ctx, input) => {
    // not_found for a space nobody may follow.
    unwrap(await ctx.repos.community.follow(input.spaceId, ctx.actor.userId, input.follow));
    return { space: input.spaceId, follow: input.follow };
  },
});

export const communityBlock = defineAction({
  name: "community.block",
  kind: "mutation",
  description: "Block a person, or unblock.",
  input: z.strictObject({ userId: z.uuid(), blocked: z.boolean() }),
  target: () => SELF,
  run: async (ctx, input) => {
    if (input.userId === ctx.actor.userId) {
      throw refused("invalid");
    }
    unwrap(await ctx.repos.community.block(ctx.actor.userId, input.userId, input.blocked));
    return { userId: input.userId, blocked: input.blocked };
  },
});

export const communityFeed = defineAction({
  name: "community.feed",
  kind: "query",
  description: "Your community feed.",
  input: z.strictObject(Paged),
  target: () => SELF,
  run: (ctx, input) => ctx.repos.community.feed(ctx.actor.userId, page(input)),
});

export const notificationList = defineAction({
  name: "notification.list",
  kind: "query",
  description: "Your notifications.",
  input: z.strictObject(Paged),
  target: () => SELF,
  run: (ctx, input) => ctx.repos.community.notifications(ctx.actor.userId, page(input)),
});

export const notificationRead = defineAction({
  name: "notification.read",
  kind: "mutation",
  description: "Mark notifications read.",
  input: z.strictObject({ ids: z.array(z.uuid()).min(1).max(100).nullish() }),
  target: () => SELF,
  run: async (ctx, input) => {
    await ctx.repos.community.markRead(ctx.actor.userId, input.ids ?? null, ctx.clock.now());
    return { read: input.ids ?? "all" };
  },
});

export const profileGet = defineAction({
  name: "profile.get",
  kind: "query",
  description: "Your community profile.",
  input: z.strictObject({}),
  target: () => SELF,
  run: (ctx) => ctx.repos.community.profile(ctx.actor.userId),
});

export const profileUpdate = defineAction({
  name: "profile.update",
  kind: "mutation",
  description: "Change your community profile.",
  input: z
    .strictObject({ displayName: DisplayName.nullish(), sharesMilestones: z.boolean().optional() })
    .refine((input) => input.displayName !== undefined || input.sharesMilestones !== undefined),
  target: () => SELF,
  run: async (ctx, input) => {
    await ctx.repos.community.setProfile(ctx.actor.userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}),
      ...(input.sharesMilestones !== undefined ? { sharesMilestones: input.sharesMilestones } : {}),
    });
    return ctx.repos.community.profile(ctx.actor.userId);
  },
});
