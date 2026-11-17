import * as z from "zod";
import { isCreatorRole } from "../access";
import { CommunityText, DisplayName } from "../community/text";
import { POST_KINDS, REPORT_REASONS } from "../repos/community-ports";
import { type Ctx, defineAction, inSpace } from "./define";
import { ActionError } from "./refusals";
import { refused, unwrap } from "./results";

// A route's community (Platform STEP 17). Whoever is enrolled in the route and the route's
// creators read it and write in it; to anyone else the route does not exist (not_found, from
// runAction, with row-level security behind it). Each action names its route, and everything it
// touches is looked for in that route's space.

const HOUR = 3_600_000;
/** At most, per person and per hour. */
export const COMMUNITY_LIMITS = { post: 10, reply: 30, report: 5 } as const;
const PAGE = 20;

const Cursor = z.strictObject({ at: z.int().nonnegative(), id: z.uuid() });
const Paged = { before: Cursor.nullish(), limit: z.int().min(1).max(50).optional() };
const InRoute = { routeId: z.uuid() };
const onRoute = (input: { routeId: string }) => ({ kind: "route" as const, id: input.routeId });

/** Refuses with rate_limited once this hour's share is spent. */
export async function withinLimit(ctx: Ctx, what: keyof typeof COMMUNITY_LIMITS) {
  const since = ctx.clock.now() - HOUR;
  const count = await ctx.repos.community.countSince(ctx.actor.userId, what, since);
  if (count >= COMMUNITY_LIMITS[what]) {
    throw new ActionError("rate_limited", "too much written this hour");
  }
}

async function notBanned(ctx: Ctx) {
  if (await ctx.repos.community.isBanned(ctx.actor.userId)) {
    throw new ActionError("forbidden", "banned from the community");
  }
}

/** The name a person shows: the one they chose, else their account's, never an address. */
async function shownName(ctx: Ctx): Promise<string> {
  const { displayName } = await ctx.repos.community.profile(ctx.actor.userId);
  const parsed = DisplayName.safeParse(displayName ?? ctx.actor.name ?? "");
  return parsed.success ? parsed.data : "";
}

/** A topic the post points to must be a lesson of the route's published version. */
async function inRoute(ctx: Ctx, spaceId: string, routeId: string, lessonId: string) {
  const latest = await ctx.repos.routeVersions.latest(spaceId, routeId);
  const version =
    latest === null ? null : await ctx.repos.routeVersions.get(spaceId, routeId, latest);
  if (!version?.ok || !version.value.snapshot.lessons.some((lesson) => lesson.id === lessonId)) {
    throw refused("not_found");
  }
}

export const communityList = defineAction({
  name: "community.list",
  kind: "query",
  description: "Posts and replies in a route.",
  input: z.strictObject({ ...InRoute, ...Paged }),
  target: onRoute,
  run: (ctx, input, given) =>
    ctx.repos.community.thread(inSpace(given).spaceId, input.routeId, ctx.actor.userId, {
      before: input.before ?? null,
      limit: input.limit ?? PAGE,
    }),
});

export const communityPost = defineAction({
  name: "community.post",
  kind: "mutation",
  description: "Write in a route community.",
  input: z.strictObject({
    ...InRoute,
    kind: z.enum(POST_KINDS),
    body: CommunityText,
    lessonId: z.uuid().nullish(),
  }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId, role } = inSpace(given);
    await notBanned(ctx);
    await withinLimit(ctx, "post");
    if (input.lessonId) {
      await inRoute(ctx, spaceId, input.routeId, input.lessonId);
    }
    const item = {
      routeId: input.routeId,
      parentId: null,
      kind: input.kind,
      lessonId: input.lessonId ?? null,
      moduleNumber: null,
      body: input.body,
      authorId: ctx.actor.userId,
      authorName: await shownName(ctx),
      byCreator: isCreatorRole(role),
    };
    return unwrap(await ctx.repos.community.add(spaceId, item, ctx.clock.now()));
  },
});

export const communityReply = defineAction({
  name: "community.reply",
  kind: "mutation",
  description: "Reply to a post.",
  input: z.strictObject({ ...InRoute, postId: z.uuid(), body: CommunityText }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId, role } = inSpace(given);
    await notBanned(ctx);
    await withinLimit(ctx, "reply");
    const post = await ctx.repos.community.item(
      spaceId,
      input.routeId,
      input.postId,
      ctx.actor.userId,
    );
    // A reply to a reply, a deleted post or one the replier cannot see: there is no such post.
    if (!post || post.parentId !== null || post.isDeleted || post.kind === "milestone") {
      throw refused("not_found");
    }
    const item = {
      routeId: input.routeId,
      parentId: post.id,
      kind: null,
      lessonId: null,
      moduleNumber: null,
      body: input.body,
      authorId: ctx.actor.userId,
      authorName: await shownName(ctx),
      byCreator: isCreatorRole(role),
    };
    // not_found too when the post's author blocked the replier.
    return unwrap(await ctx.repos.community.add(spaceId, item, ctx.clock.now()));
  },
});

export const communityUseful = defineAction({
  name: "community.useful",
  kind: "mutation",
  description: "Mark useful, or unmark.",
  input: z.strictObject({ ...InRoute, postId: z.uuid(), on: z.boolean() }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const item = await ctx.repos.community.item(
      spaceId,
      input.routeId,
      input.postId,
      ctx.actor.userId,
    );
    if (!item) {
      throw refused("not_found");
    }
    unwrap(await ctx.repos.community.useful(spaceId, item.id, ctx.actor.userId, input.on));
    return { postId: item.id, on: input.on };
  },
});

export const communityDelete = defineAction({
  name: "community.delete",
  kind: "mutation",
  description: "Delete your own post.",
  input: z.strictObject({ ...InRoute, postId: z.uuid() }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const item = await ctx.repos.community.item(
      spaceId,
      input.routeId,
      input.postId,
      ctx.actor.userId,
    );
    if (!item || item.authorId !== ctx.actor.userId) {
      throw refused("not_found");
    }
    unwrap(await ctx.repos.community.remove(spaceId, item.id, ctx.actor.userId, ctx.clock.now()));
    return { postId: item.id };
  },
});

export const communityReport = defineAction({
  name: "community.report",
  kind: "mutation",
  description: "Report a post or reply.",
  input: z.strictObject({ ...InRoute, postId: z.uuid(), reason: z.enum(REPORT_REASONS) }),
  target: onRoute,
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    await withinLimit(ctx, "report");
    const item = await ctx.repos.community.item(
      spaceId,
      input.routeId,
      input.postId,
      ctx.actor.userId,
    );
    if (!item || item.authorId === ctx.actor.userId) {
      throw refused("not_found");
    }
    // conflict when this person already reported it.
    unwrap(await ctx.repos.community.report(spaceId, item.id, ctx.actor.userId, input.reason));
    return { postId: item.id };
  },
});
