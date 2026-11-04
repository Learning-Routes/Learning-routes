import type { LocaleCode } from "@learning-routes/core/locales";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, time } from "./columns";
import { routes } from "./content";

// The catalog and who may join (Platform STEP 4 §2.3, §2.4).

export const LISTING_STATUSES = ["requested", "approved", "declined", "withdrawn"] as const;
export const APPLICATION_STATUSES = ["new", "invited", "declined"] as const;

/** A route's request to be listed in the catalog, and the operator's answer. */
export const catalogListings = pgTable(
  "catalog_listings",
  {
    id: id(),
    routeId: uuid().notNull(),
    spaceId: uuid().notNull(),
    status: text().$type<(typeof LISTING_STATUSES)[number]>().notNull(),
    // To the creator. This STEP stores it; STEP 10 emails it.
    note: text(),
    requestedAt: createdAt(),
    decidedAt: time(),
    // No foreign key, so erasing the operator leaves the record whole.
    decidedBy: uuid(),
    // The version approved: a newer one stays listed, and the owner sees it changed.
    decidedVersion: integer(),
    // 1 to 3 on the landing's "Rutas para empezar", chosen by an operator.
    featuredPosition: smallint(),
  },
  (t) => [
    foreignKey({
      name: "catalog_listings_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    // One active row per route; a declined or withdrawn one stays as a record.
    uniqueIndex("catalog_listings_active_route_id_key")
      .on(t.routeId)
      .where(sql`${t.status} in ('requested', 'approved')`),
    index("catalog_listings_status_idx").on(t.status, t.requestedAt),
    uniqueIndex("catalog_listings_featured_position_key")
      .on(t.featuredPosition)
      .where(sql`${t.featuredPosition} is not null`),
    check("catalog_listings_status", sql`${t.status} in (${oneOf(LISTING_STATUSES)})`),
    check(
      "catalog_listings_featured_position",
      sql`${t.featuredPosition} is null or (${t.featuredPosition} between 1 and 3 and ${t.status} = 'approved')`,
    ),
  ],
);

/**
 * "Quiero enseñar": no account is needed to apply. It holds personal data, so lr_public
 * never reads it, only operators do, and user.erase deletes rows with the same address.
 */
export const creatorApplications = pgTable(
  "creator_applications",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    teaches: text().notNull(),
    link: text(),
    locale: text().$type<LocaleCode>().notNull(),
    status: text().$type<(typeof APPLICATION_STATUSES)[number]>().notNull().default("new"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    decidedAt: time(),
  },
  (t) => [
    index("creator_applications_status_idx").on(t.status, t.createdAt),
    index("creator_applications_lower_email_idx").on(sql`lower(${t.email})`),
    check("creator_applications_status", sql`${t.status} in (${oneOf(APPLICATION_STATUSES)})`),
    check("creator_applications_locale", sql`app.is_locale_list(array[${t.locale}])`),
  ],
);
