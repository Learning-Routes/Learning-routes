import type { Enrollments, RepoResult } from "@learning-routes/core/repos/ports";
import { and, eq, sql } from "drizzle-orm";
import { enrollments } from "../schema/learning";
import { attempt, type Db, fail, ok } from "./shared";

// Enrollments on Postgres (Platform STEP 2 §4). Joining is app.enroll's: it acts
// for the transaction's user, so the port's userId only names them.

async function enroll(
  db: Db,
  routeId: string,
): Promise<RepoResult<{ enrollmentId: string; spaceId: string }>> {
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
}

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
  enroll: (_userId, routeId) => enroll(db, routeId),
  setPinnedVersion: (spaceId, enrollmentId, version) =>
    attempt(db, async () => {
      const updated = await db
        .update(enrollments)
        .set({ pinnedVersion: version, updatedAt: new Date() })
        .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.spaceId, spaceId)))
        .returning({ id: enrollments.id });
      return updated.length === 1 ? ok(undefined) : fail("not_found");
    }),
});
