import type { Tenancy } from "@learning-routes/core/actions/define";
import { SpaceRole } from "@learning-routes/core/domain";
import { and, eq } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { z } from "zod";
import { routes } from "./schema/content";
import { enrollments } from "./schema/learning";
import { memberships, spaces } from "./schema/tenancy";
import { routeVersions } from "./schema/versions";

// Where a row lives and who may act there (Platform STEP 2 §3.2), read in one
// query under the acting user's row-level security: a row they cannot see has no
// space, so runAction answers not_found, the same as for a row that does not exist.

const Uuid = z.uuid();

/** A database or a transaction: withDb's transaction in the Worker. */
type Reader = PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>;

export function pgTenancy(db: Reader): Tenancy {
  return {
    async scopeOf({ kind, id }, userId) {
      // An id that is not a uuid names no row, and must not reach a uuid column.
      if (!Uuid.safeParse(id).success) {
        return null;
      }
      const owner =
        kind === "space"
          ? db.select({ spaceId: spaces.id }).from(spaces).where(eq(spaces.id, id))
          : kind === "enrollment"
            ? db
                .select({ spaceId: enrollments.spaceId })
                .from(enrollments)
                .where(eq(enrollments.id, id))
            : // A route is visible through its draft (staff) or a published version (members).
              db
                .select({ spaceId: routes.spaceId })
                .from(routes)
                .where(eq(routes.id, id))
                .union(
                  db
                    .select({ spaceId: routeVersions.spaceId })
                    .from(routeVersions)
                    .where(eq(routeVersions.routeId, id)),
                );
      const row = owner.as("row");
      const [found] = await db
        .select({ spaceId: row.spaceId, role: memberships.role })
        .from(row)
        .leftJoin(
          memberships,
          and(eq(memberships.spaceId, row.spaceId), eq(memberships.userId, userId)),
        )
        .limit(1);
      if (found === undefined) {
        return null;
      }
      const role = SpaceRole.safeParse(found.role);
      return { spaceId: found.spaceId, role: role.success ? role.data : null };
    },
  };
}
