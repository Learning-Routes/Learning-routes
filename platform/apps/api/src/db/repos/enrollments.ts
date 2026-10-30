import type { Enrollments, RepoResult } from "@learning-routes/core/repos/ports";
import { and, eq, sql } from "drizzle-orm";
import { enrollments } from "../schema/learning";
import { attempt, type Db, fail, ok } from "./shared";

// Enrollments on Postgres (Platform STEP 2 §4). Joining is app.enroll's: it acts
// for the transaction's user, and only for them.

const enroll = (db: Db, routeId: string) =>
  attempt(db, async (): Promise<RepoResult<{ enrollmentId: string; spaceId: string }>> => {
    const result = await db.execute<{ outcome: string; enrollment_id: string | null }>(
      sql`select outcome, enrollment_id from app.enroll(${routeId})`,
    );
    const [row] = result.rows;
    if (row?.outcome !== "ok" || row.enrollment_id === null) {
      return fail(row?.outcome === "invalid" ? "invalid" : "not_found");
    }
    // A separate statement: the insert is not visible to the statement that made it.
    const [enrolled] = await db
      .select({ spaceId: enrollments.spaceId })
      .from(enrollments)
      .where(eq(enrollments.id, row.enrollment_id));
    return enrolled === undefined
      ? fail("not_found")
      : ok({ enrollmentId: row.enrollment_id, spaceId: enrolled.spaceId });
  });

export const enrollmentsRepo = (db: Db): Enrollments => ({
  async get(spaceId, enrollmentId) {
    const [row] = await db
      .select({
        id: enrollments.id,
        spaceId: enrollments.spaceId,
        routeId: enrollments.routeId,
        userId: enrollments.userId,
        pinnedVersion: enrollments.pinnedVersion,
        status: enrollments.status,
      })
      .from(enrollments)
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.spaceId, spaceId)));
    return row === undefined ? fail("not_found") : ok(row);
  },
  enroll: (routeId) => enroll(db, routeId),
  // app.upgrade_enrollment acts only on the transaction user's own active enrollment.
  upgrade: (spaceId, enrollmentId) =>
    attempt(db, async () => {
      const [enrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.spaceId, spaceId)));
      if (enrollment === undefined) {
        return fail("not_found");
      }
      const result = await db.execute<{ pinned: number | null }>(
        sql`select app.upgrade_enrollment(${enrollmentId}) as pinned`,
      );
      const pinned = result.rows[0]?.pinned ?? null;
      return pinned === null ? fail("not_found") : ok({ pinnedVersion: pinned });
    }),
});
