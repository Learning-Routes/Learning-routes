import * as z from "zod";
import { type Ctx, defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// Who looks after a community (Platform STEP 17). A route's creators pin a post, mark a reply as
// the answer, and hide or restore anything in it; only they have a way in (creator_required for
// anyone else in the space). The operator reviews what people reported, and may ban the author.

const InRoute = { routeId: z.uuid() };
const onRoute = (input: { routeId: string }) => ({ kind: "route" as const, id: input.routeId });

async function found(ctx: Ctx, spaceId: string, routeId: string, id: string) {
  const item = await ctx.repos.community.item(spaceId, routeId, id, ctx.actor.userId);
  if (!item || item.isDeleted) {
    throw refused("not_found");
  }
  return item;
}

export const communityPin = defineAction({
  name: "community.pin",
  kind: "mutation",
  description: "Pin or unpin a post.",
  input: z.strictObject({ ...InRoute, postId: z.uuid(), pinned: z.boolean() }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const post = await found(ctx, spaceId, input.routeId, input.postId);
    if (post.parentId !== null) {
      throw refused("invalid");
    }
    unwrap(
      await ctx.repos.community.mark(spaceId, post.id, { isPinned: input.pinned }, ctx.clock.now()),
    );
    return { postId: post.id, pinned: input.pinned };
  },
});

export const communityAnswer = defineAction({
  name: "community.answer",
  kind: "mutation",
  description: "Mark the answer, or unmark.",
  input: z.strictObject({ ...InRoute, replyId: z.uuid(), answer: z.boolean() }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const reply = await found(ctx, spaceId, input.routeId, input.replyId);
    if (reply.parentId === null) {
      throw refused("invalid");
    }
    unwrap(
      await ctx.repos.community.mark(
        spaceId,
        reply.id,
        { isAnswer: input.answer },
        ctx.clock.now(),
      ),
    );
    return { replyId: reply.id, answer: input.answer };
  },
});

export const communityHide = defineAction({
  name: "community.hide",
  kind: "mutation",
  description: "Hide or show an item.",
  input: z.strictObject({ ...InRoute, postId: z.uuid(), hidden: z.boolean() }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const item = await found(ctx, spaceId, input.routeId, input.postId);
    unwrap(
      await ctx.repos.community.mark(spaceId, item.id, { isHidden: input.hidden }, ctx.clock.now()),
    );
    return { postId: item.id, hidden: input.hidden };
  },
});

export const communityReports = defineAction({
  name: "community.reports",
  kind: "query",
  description: "Open reports. Operators only.",
  input: z.strictObject({}),
  target: () => ({ kind: "platform", id: "platform" }),
  run: (ctx) => ctx.repos.community.openReports(),
});

export const communityModerate = defineAction({
  name: "community.moderate",
  kind: "mutation",
  description: "Review a report. Operators only.",
  input: z.strictObject({ postId: z.uuid(), decision: z.enum(["hide", "restore", "ban"]) }),
  target: () => ({ kind: "platform", id: "platform" }),
  run: async (ctx, input) => {
    unwrap(
      await ctx.repos.community.moderate(
        input.postId,
        input.decision,
        ctx.actor.userId,
        ctx.clock.now(),
      ),
    );
    return { postId: input.postId, decision: input.decision };
  },
});
