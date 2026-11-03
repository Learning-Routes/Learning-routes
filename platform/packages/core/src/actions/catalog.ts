import * as z from "zod";
import { ActionError, defineAction, inSpace } from "./define";
import { refused, unwrap } from "./results";

// The catalog (Platform STEP 4 §3.1): an owner asks for a published route to be listed
// and may withdraw it; only an operator decides. The note goes to the creator in STEP 7.

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
