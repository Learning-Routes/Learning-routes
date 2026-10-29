import * as z from "zod";
import { contentHash, SNAPSHOT_FORMAT, snapshotOf, upcastSnapshot } from "../content/snapshot";
import { Route } from "../domain";
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
  })
  .refine((route) => route.title[route.sourceLocale] !== undefined, {
    message: "the title needs the source locale",
    path: ["title"],
  });

export const routeCreate = defineAction({
  name: "route.create",
  kind: "mutation",
  description: "Create a route's draft in a space. A paid route is created only from the app.",
  input: RouteFields,
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const scope = inSpace(given);
    // Pricing is set in the app, never by an agent or over MCP.
    if (input.pricing !== "free" && ctx.actor.via !== "ui") {
      throw new ActionError("forbidden", "a price is set in the app");
    }
    const { spaceId: _, description, ...fields } = input;
    const routeId = ctx.ids.newId();
    const created = unwrap(
      await ctx.repos.routeDrafts.create(scope.spaceId, {
        ...fields,
        id: routeId,
        description: description ?? null,
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
      const draft = unwrap(await repos.routeDrafts.get(spaceId, input.routeId));
      if (draft.revision !== input.expectedRevision) {
        throw new ActionError("conflict", "the draft changed since it was read");
      }
      const snapshot = snapshotOf(draft);
      // A version is read back through upcastSnapshot; never store one it would refuse.
      if (!upcastSnapshotAccepts(snapshot)) {
        throw new ActionError("invalid", "the draft is not a valid version");
      }
      const version = (draft.latestPublishedVersion ?? 0) + 1;
      const hash = await contentHash(snapshot);
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
      return { version, contentHash: hash };
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
