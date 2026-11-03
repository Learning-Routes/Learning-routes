import type { LocalizedText } from "@learning-routes/core/localized-text";
import type { Catalog, CatalogListing, CatalogQueueItem } from "@learning-routes/core/repos/ports";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { catalogListings } from "../schema/catalog";
import { routes } from "../schema/content";
import { spaces } from "../schema/tenancy";
import { routeVersions } from "../schema/versions";
import { attempt, type Db, fail, ok } from "./shared";

// The catalog's listings on Postgres (Platform STEP 4 §3). Row-level security holds who
// may do each: an owner asks and withdraws, and only an operator decides.

const ACTIVE = ["requested", "approved"] as const;

const LISTING = {
  id: catalogListings.id,
  spaceId: catalogListings.spaceId,
  routeId: catalogListings.routeId,
  status: catalogListings.status,
  note: catalogListings.note,
  decidedBy: catalogListings.decidedBy,
  decidedVersion: catalogListings.decidedVersion,
  featuredPosition: catalogListings.featuredPosition,
};

function readQueue(db: Db) {
  return (
    db
      .select({
        ...LISTING,
        // What is published, the same as a stranger reads: never the draft's edits.
        title: sql<LocalizedText>`${routeVersions.snapshot} #> '{route,title}'`,
        sourceLocale: sql<string>`${routeVersions.snapshot} #>> '{route,sourceLocale}'`,
        creator: spaces.name,
        latestVersion: routes.latestPublishedVersion,
      })
      .from(catalogListings)
      .innerJoin(routes, eq(routes.id, catalogListings.routeId))
      .innerJoin(spaces, eq(spaces.id, catalogListings.spaceId))
      .innerJoin(
        routeVersions,
        and(
          eq(routeVersions.routeId, routes.id),
          eq(routeVersions.version, routes.latestPublishedVersion),
        ),
      )
      .where(and(inArray(catalogListings.status, ACTIVE), isNull(routes.archivedAt)))
      // "requested" sorts after "approved", and comes first.
      .orderBy(desc(catalogListings.status), asc(catalogListings.requestedAt)) as Promise<
      CatalogQueueItem[]
    >
  );
}

export const catalogRepo = (db: Db): Catalog => ({
  queue: () => readQueue(db),
  feature: (listingId, position) =>
    attempt(db, async () => {
      const rows = await db
        .update(catalogListings)
        .set({ featuredPosition: position })
        .where(eq(catalogListings.id, listingId))
        .returning({ id: catalogListings.id });
      return rows.length === 1 ? ok(undefined) : fail("not_found");
    }),
  // attempt turns the partial unique index's refusal into conflict.
  request: (spaceId, routeId) =>
    attempt(db, async () => {
      const [row] = await db
        .insert(catalogListings)
        .values({ spaceId, routeId, status: "requested" })
        .returning({ listingId: catalogListings.id });
      return row ? ok(row) : fail("not_found");
    }),
  withdraw: (spaceId, routeId) =>
    attempt(db, async () => {
      const rows = await db
        .update(catalogListings)
        .set({ status: "withdrawn", featuredPosition: null })
        .where(
          and(
            eq(catalogListings.routeId, routeId),
            eq(catalogListings.spaceId, spaceId),
            inArray(catalogListings.status, ACTIVE),
          ),
        )
        .returning({ id: catalogListings.id });
      return rows.length === 1 ? ok(undefined) : fail("not_found");
    }),
  async get(listingId) {
    const [row] = await db
      .select(LISTING)
      .from(catalogListings)
      .where(eq(catalogListings.id, listingId));
    return row ? ok(row as CatalogListing) : fail("not_found");
  },
  decide: (listingId, decision) =>
    attempt(db, async () => {
      const rows = await db
        .update(catalogListings)
        .set({
          ...decision,
          decidedAt: new Date(),
          // A declined route leaves the landing with its listing.
          ...(decision.status === "declined" ? { featuredPosition: null } : {}),
        })
        .where(eq(catalogListings.id, listingId))
        .returning({ id: catalogListings.id });
      return rows.length === 1 ? ok(undefined) : fail("not_found");
    }),
});
