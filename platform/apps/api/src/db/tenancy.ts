import type { Tenancy } from "@learning-routes/core/actions/define";
import { SpaceRole } from "@learning-routes/core/domain";
import { and, eq } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { routes } from "./schema/content";
import { enrollments } from "./schema/learning";
import { memberships, spaces } from "./schema/tenancy";
import { routeVersions } from "./schema/versions";

// Where a row lives and who may act there (Platform STEP 2 §3.2), read under the
// acting user's row-level security: a row they cannot see has no space, so
// runAction answers not_found, the same as for a row that does not exist.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A database or a transaction: withDb's transaction in the Worker. */
type Reader = PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>;

export function pgTenancy(db: Reader): Tenancy {
  return {
    async spaceOf({ kind, id }) {
      if (!UUID.test(id)) {
        return null;
      }
      const rows =
        kind === "space"
          ? await db.select({ spaceId: spaces.id }).from(spaces).where(eq(spaces.id, id))
          : kind === "enrollment"
            ? await db
                .select({ spaceId: enrollments.spaceId })
                .from(enrollments)
                .where(eq(enrollments.id, id))
            : // A route is visible through its draft (staff) or a published version (members).
              await db
                .select({ spaceId: routes.spaceId })
                .from(routes)
                .where(eq(routes.id, id))
                .union(
                  db
                    .select({ spaceId: routeVersions.spaceId })
                    .from(routeVersions)
                    .where(eq(routeVersions.routeId, id)),
                );
      return rows[0]?.spaceId ?? null;
    },
    async roleOf(spaceId, userId) {
      const rows = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)));
      const role = SpaceRole.safeParse(rows[0]?.role);
      return role.success ? role.data : null;
    },
  };
}
