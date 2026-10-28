import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { routes } from "./content";

// Published versions (Platform STEP 2 §2.10): each publish appends one frozen
// snapshot of the draft. Append-only, enforced by triggers as well as grants:
// students are pinned to a version, so a version never changes.

export const routeVersions = pgTable(
  "route_versions",
  {
    id: id(),
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    version: integer().notNull(),
    // Read through core's upcastSnapshot(snapshot_format, snapshot).
    snapshot: jsonb().notNull(),
    snapshotFormat: smallint().notNull(),
    contentHash: text().notNull(),
    // Who published; no foreign key, so erasing that user leaves the version whole.
    publishedByUserId: uuid().notNull(),
    publishedAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "route_versions_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    unique("route_versions_route_id_version_key").on(t.routeId, t.version),
    check("route_versions_version", sql`${t.version} > 0`),
    check("route_versions_snapshot_format", sql`${t.snapshotFormat} > 0`),
    check("route_versions_content_hash", sql`${t.contentHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
