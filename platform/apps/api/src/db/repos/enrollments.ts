import { placeInRoute } from "@learning-routes/core/content/lesson-view";
import type { Snapshot } from "@learning-routes/core/content/snapshot";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import type { Enrollments, RepoResult } from "@learning-routes/core/repos/ports";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { enrollments, progress } from "../schema/learning";
import { memberships, spaces } from "../schema/tenancy";
import { routeVersions } from "../schema/versions";
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

/** A version's route and shape, never its blocks. */
async function listOwn(db: Db, userId: string) {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      routeId: enrollments.routeId,
      route: sql<{
        title: LocalizedText;
        sourceLocale: string;
      }>`${routeVersions.snapshot} -> 'route'`,
      modules: sql<Snapshot["modules"]>`${routeVersions.snapshot} -> 'modules'`,
      lessons: sql<Snapshot["lessons"]>`${routeVersions.snapshot} -> 'lessons'`,
      creator: spaces.name,
      completedIds: sql<string[]>`(
        select coalesce(array_agg(${progress.lessonId}), '{}') from ${progress}
        where ${progress.enrollmentId} = ${enrollments.id} and ${progress.status} = 'completed'
      )`,
    })
    .from(enrollments)
    .innerJoin(
      routeVersions,
      and(
        eq(routeVersions.routeId, enrollments.routeId),
        eq(routeVersions.version, enrollments.pinnedVersion),
      ),
    )
    .innerJoin(spaces, eq(spaces.id, enrollments.spaceId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")))
    .orderBy(desc(enrollments.id));
  const teaching = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), ne(memberships.role, "student")))
    .limit(1);
  return {
    teaches: teaching.length > 0,
    enrollments: rows.map(({ route, modules, lessons, completedIds, ...row }) => ({
      ...row,
      title: route.title,
      sourceLocale: route.sourceLocale,
      lessonsPerModule: modules.map(
        (module) => lessons.filter((lesson) => lesson.moduleId === module.id).length,
      ),
      // A lesson a newer version removed is kept in progress but no longer counts.
      completedLessons: lessons.filter((lesson) => completedIds.includes(lesson.id)).length,
      place: placeInRoute({ modules, lessons }, completedIds),
    })),
  };
}

export const enrollmentsRepo = (db: Db): Enrollments => ({
  listOwn: (userId) => listOwn(db, userId),
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
