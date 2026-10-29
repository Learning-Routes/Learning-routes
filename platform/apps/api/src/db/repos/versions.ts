import { SNAPSHOT_FORMAT, upcastSnapshot } from "@learning-routes/core/content/snapshot";
import type { RouteVersions } from "@learning-routes/core/repos/ports";
import { and, eq, max } from "drizzle-orm";
import { routeVersions } from "../schema/versions";
import { attempt, type Db, fail, ok } from "./shared";

// Published versions on Postgres (Platform STEP 2 §4): read and append only. A
// stored snapshot is read through core's upcastSnapshot, whatever its format.

export const routeVersionsRepo = (db: Db): RouteVersions => ({
  async latest(spaceId, routeId) {
    const [row] = await db
      .select({ version: max(routeVersions.version) })
      .from(routeVersions)
      .where(and(eq(routeVersions.routeId, routeId), eq(routeVersions.spaceId, spaceId)));
    return row?.version ?? null;
  },
  async get(spaceId, routeId, version) {
    const [row] = await db
      .select()
      .from(routeVersions)
      .where(
        and(
          eq(routeVersions.routeId, routeId),
          eq(routeVersions.version, version),
          eq(routeVersions.spaceId, spaceId),
        ),
      );
    if (row === undefined) {
      return fail("not_found");
    }
    return ok({
      routeId: row.routeId,
      version: row.version,
      snapshot: upcastSnapshot(row.snapshotFormat, row.snapshot),
      contentHash: row.contentHash,
      publishedByUserId: row.publishedByUserId,
    });
  },
  append: (spaceId, version) =>
    attempt(db, async () => {
      await db
        .insert(routeVersions)
        .values({ ...version, spaceId, snapshotFormat: SNAPSHOT_FORMAT });
      return ok(undefined);
    }),
});
