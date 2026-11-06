import * as z from "zod";
import { creationsIn } from "../content/creations";
import { contentHash, SNAPSHOT_FORMAT, snapshotOf, upcastSnapshot } from "../content/snapshot";
import { ROUTE_LEVELS, ROUTE_TOPICS } from "../copy/route-facts";
import { Money, Route } from "../domain";
import { Locale, LocalizedText } from "../localized-text";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// Routes: a draft each, published as frozen versions (Platform STEP 2 §6).

const RouteFields = z
  .strictObject({
    spaceId: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lower-case words joined by hyphens"),
    title: LocalizedText,
    description: LocalizedText.nullish(),
    sourceLocale: Locale,
    access: Route.shape.access,
    pricing: Route.shape.pricing,
    topic: z.enum(ROUTE_TOPICS).default("otros"),
    level: z.enum(ROUTE_LEVELS).default("inicial"),
    /** The route's one-time price. Left out, the route is not for sale yet. */
    price: Money.nullish(),
  })
  .refine((route) => route.title[route.sourceLocale] !== undefined, {
    message: "the title needs the source locale",
    path: ["title"],
  });

const CURRENCY = /^[A-Z]{3}$/;

export const routeCreate = defineAction({
  name: "route.create",
  kind: "mutation",
  description: "Create a route's draft in a space. A paid route is created only from the app.",
  input: RouteFields,
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const scope = inSpace(given);
    // Pricing is set in the app, by an owner, never by an agent or over MCP.
    const setsPrice = input.pricing !== "free" || (input.price ?? null) !== null;
    if (setsPrice && (ctx.actor.via !== "ui" || scope.role !== "owner")) {
      throw new ActionError("forbidden", "an owner sets a price, in the app");
    }
    const { spaceId: _, description, price, ...fields } = input;
    const routeId = ctx.ids.newId();
    const created = unwrap(
      await ctx.repos.routeDrafts.create(scope.spaceId, {
        ...fields,
        id: routeId,
        description: description ?? null,
        priceMinor: price?.amountMinor ?? null,
        currency: price?.currency ?? null,
      }),
    );
    return { routeId, revision: created.revision };
  },
});

export const routeGet = defineAction({
  name: "route.get",
  kind: "query",
  description:
    "Read a route's draft: its modules, lessons, prerequisites and blocks, and its revision.",
  input: z.strictObject({ routeId: z.uuid() }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  run: async (ctx, input, given) =>
    unwrap(await ctx.repos.routeDrafts.get(inSpace(given).spaceId, input.routeId)),
});

export const routeList = defineAction({
  name: "route.list",
  kind: "query",
  description: "List the routes of a space, by slug.",
  input: z.strictObject({ spaceId: z.uuid() }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  run: (ctx, input) => ctx.repos.routeDrafts.list(input.spaceId),
});

export const routeUpdate = defineAction({
  name: "route.update",
  kind: "mutation",
  description: "Change a draft's title, description, topic or level. Never its price or address.",
  input: z
    .strictObject({
      routeId: z.uuid(),
      expectedRevision: z.int().nonnegative(),
      title: LocalizedText.optional(),
      description: LocalizedText.nullish(),
      topic: z.enum(ROUTE_TOPICS).optional(),
      level: z.enum(ROUTE_LEVELS).optional(),
    })
    .refine((input) => Object.keys(input).length > 2, "nothing to change"),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { routeId, expectedRevision, ...details } = input;
    const { revision } = unwrap(
      await ctx.repos.routeDrafts.updateDetails(
        inSpace(given).spaceId,
        routeId,
        expectedRevision,
        details,
      ),
    );
    return { routeId, revision };
  },
});

/** The price is the owner's, in the app: an assistant may only read it. */
export const routeSetPrice = defineAction({
  name: "route.set_price",
  kind: "mutation",
  description: "Save a route's price, for when payments arrive. Owners only, from the app only.",
  input: z
    .strictObject({
      routeId: z.uuid(),
      expectedRevision: z.int().nonnegative(),
      priceMinor: z.int().positive().nullable(),
      currency: z.string().regex(CURRENCY).nullable(),
    })
    .refine(
      (input) => (input.priceMinor === null) === (input.currency === null),
      "price and currency go together",
    ),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, { routeId, expectedRevision, priceMinor, currency }, given) {
    const { revision } = unwrap(
      await ctx.repos.routeDrafts.setPrice(inSpace(given).spaceId, routeId, expectedRevision, {
        priceMinor,
        currency,
      }),
    );
    return { routeId, revision };
  },
});

export const routePublish = defineAction({
  name: "route.publish",
  kind: "mutation",
  description:
    "Publish the draft as the route's next version: a frozen snapshot that students can enrol in.",
  input: z.strictObject({ routeId: z.uuid(), expectedRevision: z.int().nonnegative() }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    return ctx.repos.transaction(async (repos) => {
      // Locked first: an edit cannot land between this read and the version it freezes.
      unwrap(await repos.routeDrafts.lockDraft(spaceId, input.routeId, input.expectedRevision));
      const draft = unwrap(await repos.routeDrafts.get(spaceId, input.routeId));
      const snapshot = snapshotOf(draft);
      // A version is read back through upcastSnapshot; never store one it would refuse.
      if (!upcastSnapshotAccepts(snapshot)) {
        throw new ActionError("invalid", "the draft is not a valid version");
      }
      const version = (draft.latestPublishedVersion ?? 0) + 1;
      const hash = await contentHash(snapshot);
      // A double click: the revision did not move, but the second publish must not make a copy.
      if (draft.latestPublishedVersion !== null) {
        const last = await repos.routeVersions.get(
          spaceId,
          input.routeId,
          draft.latestPublishedVersion,
        );
        if (last.ok && last.value.contentHash === hash) {
          throw new ActionError("conflict", "the draft is already the latest version");
        }
      }
      unwrap(
        await repos.routeVersions.append(spaceId, {
          routeId: input.routeId,
          version,
          snapshot,
          contentHash: hash,
          publishedByUserId: ctx.actor.userId,
        }),
      );
      unwrap(await repos.routeDrafts.markPublished(spaceId, input.routeId, version));
      // The revision frozen, so the action log ties this version to the edits before it.
      return {
        spaceId,
        routeId: input.routeId,
        version,
        contentHash: hash,
        revision: draft.revision,
        // Copied to the published place after the commit, so students can run them.
        creations: creationsIn(snapshot.blocks),
      };
    });
  },
});

function upcastSnapshotAccepts(snapshot: unknown): boolean {
  try {
    upcastSnapshot(SNAPSHOT_FORMAT, snapshot);
    return true;
  } catch {
    return false;
  }
}
