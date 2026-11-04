import type { RepoResult, RouteDetails, RouteDrafts } from "@learning-routes/core/repos/ports";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { blocks, lessonPrerequisites, lessons, modules, routes } from "../schema/content";
import { type Db, ok } from "./shared";

// Changing a draft's details, or all of its content at once (Platform STEP 5 §3, §4).

type Where = { spaceId: string; routeId: string };

export const detailsOf = (details: RouteDetails) => ({
  ...details,
  topic: details.topic as typeof routes.$inferInsert.topic,
  level: details.level as typeof routes.$inferInsert.level,
});

/** Archives what the draft holds and inserts the new content, in one batch for each table. */
export async function replaceContent(
  db: Db,
  { spaceId, routeId }: Where,
  content: Parameters<RouteDrafts["replaceContent"]>[3],
): Promise<RepoResult<void>> {
  const now = new Date();
  const live = { archivedAt: now, updatedAt: now };
  await db
    .delete(lessonPrerequisites)
    .where(and(eq(lessonPrerequisites.routeId, routeId), eq(lessonPrerequisites.spaceId, spaceId)));
  const routeLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.routeId, routeId), eq(lessons.spaceId, spaceId)));
  await db
    .update(blocks)
    .set(live)
    .where(
      and(
        inArray(blocks.lessonId, routeLessons),
        eq(blocks.spaceId, spaceId),
        isNull(blocks.archivedAt),
      ),
    );
  await db
    .update(lessons)
    .set(live)
    .where(
      and(eq(lessons.routeId, routeId), eq(lessons.spaceId, spaceId), isNull(lessons.archivedAt)),
    );
  await db
    .update(modules)
    .set(live)
    .where(
      and(eq(modules.routeId, routeId), eq(modules.spaceId, spaceId), isNull(modules.archivedAt)),
    );
  await db
    .update(routes)
    .set({ ...detailsOf(content.details), updatedAt: now })
    .where(and(eq(routes.id, routeId), eq(routes.spaceId, spaceId)));
  if (content.modules.length > 0) {
    await db.insert(modules).values(content.modules.map((row) => ({ ...row, routeId, spaceId })));
  }
  if (content.lessons.length > 0) {
    await db.insert(lessons).values(content.lessons.map((row) => ({ ...row, routeId, spaceId })));
  }
  if (content.blocks.length > 0) {
    await db.insert(blocks).values(content.blocks.map((row) => ({ ...row, spaceId })));
  }
  return ok(undefined);
}
