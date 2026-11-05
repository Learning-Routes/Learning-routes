import * as z from "zod";
import { ActionError, defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";
import { SpaceSlug } from "./spaces";

// The catalog (Platform STEP 4 §3.1): an owner asks for a published route to be listed
// and may withdraw it; only an operator decides. The note goes to the creator in STEP 10.

const NOT_LISTABLE = "publish the route, with a price or at least one module, before listing it";

export const catalogRequest = defineAction({
  name: "catalog.request",
  kind: "mutation",
  description: "Ask for a published route to be listed in the catalog. Owners only, from the app.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, { routeId }, given) {
    const { spaceId } = inSpace(given);
    const latest = await ctx.repos.routeVersions.latest(spaceId, routeId);
    if (latest === null) {
      throw new ActionError("invalid", NOT_LISTABLE);
    }
    const { snapshot } = unwrap(await ctx.repos.routeVersions.get(spaceId, routeId, latest));
    // Module 1 is always free, so a route with a module has something free to offer.
    if (snapshot.route.priceMinor === null && snapshot.modules.length === 0) {
      throw new ActionError("invalid", NOT_LISTABLE);
    }
    const { listingId } = unwrap(await ctx.repos.catalog.request(spaceId, routeId));
    return { listingId, spaceId, routeId, status: "requested" as const };
  },
});

export const catalogWithdraw = defineAction({
  name: "catalog.withdraw",
  kind: "mutation",
  description: "Take a route out of the catalog, or cancel its request. Owners only, from the app.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, { routeId }, given) {
    const { spaceId } = inSpace(given);
    unwrap(await ctx.repos.catalog.withdraw(spaceId, routeId));
    return { spaceId, routeId, status: "withdrawn" as const };
  },
});

export const catalogDecide = defineAction({
  name: "catalog.decide",
  kind: "mutation",
  description: "Approve or decline a catalog request, with an optional note. Operators only.",
  input: z.strictObject({
    listingId: z.uuid(),
    decision: z.enum(["approve", "decline"]),
    note: z.string().trim().min(1).max(1000).nullish(),
  }),
  target: () => ({ kind: "platform", id: "platform" }),
  async run(ctx, { listingId, decision, note }) {
    const listing = unwrap(await ctx.repos.catalog.get(listingId));
    if (listing.status !== "requested" && listing.status !== "approved") {
      throw refused("not_found");
    }
    const { spaceId, routeId } = listing;
    const status = decision === "approve" ? ("approved" as const) : ("declined" as const);
    unwrap(
      await ctx.repos.catalog.decide(listingId, {
        status,
        note: note ?? null,
        decidedBy: ctx.actor.userId,
        decidedVersion: await ctx.repos.routeVersions.latest(spaceId, routeId),
      }),
    );
    return { spaceId, routeId, status };
  },
});

/** A route on the landing's "Rutas para empezar", from 1 to 3, or off it (§6.4). */
export const catalogFeature = defineAction({
  name: "catalog.feature",
  kind: "mutation",
  description: "Choose a listed route for the landing, or take it off. Operators only.",
  input: z.strictObject({ listingId: z.uuid(), position: z.int().min(1).max(3).nullable() }),
  target: () => ({ kind: "platform", id: "platform" }),
  async run(ctx, { listingId, position }) {
    const listing = unwrap(await ctx.repos.catalog.get(listingId));
    if (listing.status !== "approved") {
      throw refused("not_found");
    }
    unwrap(await ctx.repos.catalog.feature(listingId, position));
    return { spaceId: listing.spaceId, routeId: listing.routeId, position };
  },
});

export const adminOverview = defineAction({
  name: "admin.overview",
  kind: "query",
  description: "What an operator looks after: applications and the catalog. Operators only.",
  input: z.strictObject({}),
  target: () => ({ kind: "platform", id: "platform" }),
  run: async (ctx) => ({
    applications: await ctx.repos.applications.list(),
    listings: await ctx.repos.catalog.queue(),
  }),
});

/** The token's hash only: the API makes the token, and mails it after the commit. */
export const applicationInvite = defineAction({
  name: "application.invite",
  kind: "mutation",
  description: "Invite someone who applied to teach, replacing any earlier link. Operators only.",
  input: z.strictObject({
    applicationId: z.uuid(),
    tokenHash: z.string().min(16).max(128),
    expiresAt: z.number().int().positive(),
  }),
  target: () => ({ kind: "platform", id: "platform" }),
  run: async (ctx, input) => unwrap(await ctx.repos.invitations.invite(input)),
});

export const invitationAccept = defineAction({
  name: "invitation.accept",
  kind: "mutation",
  description: "Use an invitation: make the signed-in person's space, as its owner.",
  input: z.strictObject({
    tokenHash: z.string().min(16).max(128),
    slug: SpaceSlug,
  }),
  target: () => ({ kind: "account", id: "self", self: true }),
  run: async (ctx, input) => unwrap(await ctx.repos.invitations.accept(input)),
});

export const applicationDecide = defineAction({
  name: "application.decide",
  kind: "mutation",
  description: "Mark an application to teach as invited, or decline it. Operators only.",
  input: z.strictObject({ applicationId: z.uuid(), status: z.enum(["invited", "declined"]) }),
  target: () => ({ kind: "platform", id: "platform" }),
  async run(ctx, { applicationId, status }) {
    unwrap(await ctx.repos.applications.decide(applicationId, status));
    return { applicationId, status };
  },
});
