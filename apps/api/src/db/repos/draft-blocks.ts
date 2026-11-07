import type { DraftBlock, RepoResult } from "@learning-routes/core/repos/ports";
import { and, eq, isNull } from "drizzle-orm";
import { blocks, lessons } from "../schema/content";
import { type Db, fail, ok } from "./shared";

// A draft's blocks, one at a time (Platform STEP 9 §4): each change runs inside the draft's edit,
// which locks it and moves its revision. A block is never deleted: archived, it leaves the draft and
// stays in every version that has it.

type Where = { spaceId: string; routeId: string };

export const isLiveLesson = async (db: Db, where: Where, lessonId: string) =>
  (
    await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.routeId, where.routeId),
          eq(lessons.spaceId, where.spaceId),
          isNull(lessons.archivedAt),
        ),
      )
  ).length === 1;

/** A live block of a live lesson of this route. */
const isLiveBlock = async (db: Db, where: Where, blockId: string) =>
  (
    await db
      .select({ id: blocks.id })
      .from(blocks)
      .innerJoin(lessons, eq(lessons.id, blocks.lessonId))
      .where(
        and(
          eq(blocks.id, blockId),
          eq(blocks.spaceId, where.spaceId),
          isNull(blocks.archivedAt),
          eq(lessons.routeId, where.routeId),
          isNull(lessons.archivedAt),
        ),
      )
  ).length === 1;

export async function addBlock(db: Db, where: Where, block: DraftBlock): Promise<RepoResult<void>> {
  if (!(await isLiveLesson(db, where, block.lessonId))) {
    return fail("not_found");
  }
  await db.insert(blocks).values({ ...block, spaceId: where.spaceId });
  return ok(undefined);
}

/** The block's row changed, once it is known to be live in the route. */
export async function changeBlock(
  db: Db,
  where: Where,
  blockId: string,
  change: Partial<Pick<typeof blocks.$inferInsert, "data" | "archivedAt">>,
): Promise<RepoResult<void>> {
  if (!(await isLiveBlock(db, where, blockId))) {
    return fail("not_found");
  }
  await db
    .update(blocks)
    .set({ ...change, updatedAt: new Date() })
    .where(and(eq(blocks.id, blockId), eq(blocks.spaceId, where.spaceId)));
  return ok(undefined);
}
