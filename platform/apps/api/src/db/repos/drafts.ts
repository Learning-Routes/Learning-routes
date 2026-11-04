import type {
  DraftBlock,
  DraftLesson,
  DraftModule,
  RepoResult,
  RouteDraft,
  RouteDrafts,
  RouteSummary,
} from "@learning-routes/core/repos/ports";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { blocks, lessonPrerequisites, lessons, modules, routes } from "../schema/content";
import { detailsOf, replaceContent } from "./draft-content";
import { attempt, type Db, fail, ok } from "./shared";

// A route's draft on Postgres (Platform STEP 2 §4): read in position order, and
// changed only by edits that name the revision they read. An archived route is
// gone for all of it.

type Where = { spaceId: string; routeId: string };

const readModules = (db: Db, { spaceId, routeId }: Where) =>
  db
    .select({ id: modules.id, position: modules.position, title: modules.title })
    .from(modules)
    .where(
      and(eq(modules.routeId, routeId), eq(modules.spaceId, spaceId), isNull(modules.archivedAt)),
    )
    .orderBy(asc(modules.position));

const readLessons = (db: Db, { spaceId, routeId }: Where) =>
  db
    .select({
      id: lessons.id,
      moduleId: lessons.moduleId,
      position: lessons.position,
      title: lessons.title,
    })
    .from(lessons)
    .where(
      and(eq(lessons.routeId, routeId), eq(lessons.spaceId, spaceId), isNull(lessons.archivedAt)),
    )
    .orderBy(asc(lessons.position));

const readBlocks = (db: Db, { spaceId, routeId }: Where) =>
  db
    .select({
      id: blocks.id,
      lessonId: blocks.lessonId,
      position: blocks.position,
      kind: blocks.kind,
      data: blocks.data,
    })
    .from(blocks)
    .innerJoin(lessons, eq(lessons.id, blocks.lessonId))
    .where(
      and(eq(lessons.routeId, routeId), eq(blocks.spaceId, spaceId), isNull(blocks.archivedAt)),
    )
    .orderBy(asc(blocks.position));

const readPrerequisites = (db: Db, { spaceId, routeId }: Where) =>
  db
    .select({
      lessonId: lessonPrerequisites.lessonId,
      requiresLessonId: lessonPrerequisites.requiresLessonId,
    })
    .from(lessonPrerequisites)
    .where(and(eq(lessonPrerequisites.routeId, routeId), eq(lessonPrerequisites.spaceId, spaceId)))
    .orderBy(asc(lessonPrerequisites.lessonId), asc(lessonPrerequisites.requiresLessonId));

/** Sorts items by their parent's place, keeping each parent's items in position order. */
function byParent<T>(items: T[], parentOf: (item: T) => string, parents: { id: string }[]): T[] {
  const order = new Map(parents.map((parent, i) => [parent.id, i]));
  return items
    .filter((item) => order.has(parentOf(item)))
    .sort((a, b) => (order.get(parentOf(a)) ?? 0) - (order.get(parentOf(b)) ?? 0));
}

async function getDraft(db: Db, where: Where): Promise<RepoResult<RouteDraft>> {
  const [route] = await db
    .select()
    .from(routes)
    .where(
      and(
        eq(routes.id, where.routeId),
        eq(routes.spaceId, where.spaceId),
        isNull(routes.archivedAt),
      ),
    );
  if (route === undefined) {
    return fail("not_found");
  }
  const draftModules = await readModules(db, where);
  const draftLessons = byParent(
    await readLessons(db, where),
    (lesson) => lesson.moduleId,
    draftModules,
  );
  const live = new Set(draftLessons.map((lesson) => lesson.id));
  const { id, slug, title, description, sourceLocale, access, pricing } = route;
  const { topic, level, priceMinor, currency } = route;
  return ok({
    route: {
      id,
      slug,
      title,
      description,
      sourceLocale,
      access,
      pricing,
      topic,
      level,
      priceMinor,
      currency,
    },
    modules: draftModules,
    lessons: draftLessons,
    prerequisites: (await readPrerequisites(db, where)).filter(
      (entry) => live.has(entry.lessonId) && live.has(entry.requiresLessonId),
    ),
    blocks: byParent(await readBlocks(db, where), (block) => block.lessonId, draftLessons),
    spaceId: where.spaceId,
    revision: route.draftRevision,
    latestPublishedVersion: route.latestPublishedVersion,
  });
}

const listRoutes = (db: Db, spaceId: string): Promise<RouteSummary[]> =>
  db
    .select({
      id: routes.id,
      slug: routes.slug,
      title: routes.title,
      revision: routes.draftRevision,
      latestPublishedVersion: routes.latestPublishedVersion,
    })
    .from(routes)
    .where(and(eq(routes.spaceId, spaceId), isNull(routes.archivedAt)))
    .orderBy(asc(sql`${routes.slug} collate "C"`));

/**
 * Locks the live route's row at the revision the caller read: a concurrent edit
 * waits here, then sees the new revision and answers conflict.
 */
async function lockDraft(db: Db, where: Where, expected: number): Promise<RepoResult<void>> {
  const [route] = await db
    .select({ revision: routes.draftRevision })
    .from(routes)
    .where(
      and(
        eq(routes.id, where.routeId),
        eq(routes.spaceId, where.spaceId),
        isNull(routes.archivedAt),
      ),
    )
    .for("update");
  if (route === undefined) {
    return fail("not_found");
  }
  return route.revision === expected ? ok(undefined) : fail("conflict");
}

/**
 * One draft edit, under one savepoint: lock the draft at the revision the editor
 * read, make the change, then move the revision forward through app.bump_draft,
 * the only path that may.
 */
const edit = (db: Db, where: Where, expected: number, change: () => Promise<RepoResult<void>>) =>
  attempt(db, async () => {
    const locked = await lockDraft(db, where, expected);
    if (!locked.ok) {
      return locked;
    }
    const changed = await change();
    if (!changed.ok) {
      return changed;
    }
    const result = await db.execute<{ revision: string | null }>(
      sql`select app.bump_draft(${where.routeId}, ${where.spaceId}, ${expected}) as revision`,
    );
    const revision = result.rows[0]?.revision ?? null;
    return revision === null ? fail("conflict") : ok({ revision: Number(revision) });
  });

const isLiveLesson = async (db: Db, where: Where, lessonId: string) =>
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

async function addBlock(db: Db, where: Where, block: DraftBlock): Promise<RepoResult<void>> {
  if (!(await isLiveLesson(db, where, block.lessonId))) {
    return fail("not_found");
  }
  await db.insert(blocks).values({ ...block, spaceId: where.spaceId });
  return ok(undefined);
}

async function archiveLesson(db: Db, where: Where, lessonId: string): Promise<RepoResult<void>> {
  if (!(await isLiveLesson(db, where, lessonId))) {
    return fail("not_found");
  }
  await db
    .update(lessons)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(lessons.id, lessonId), eq(lessons.spaceId, where.spaceId)));
  return ok(undefined);
}

/** Through app.mark_published: an existing, newer version, on a live route. */
const markPublished = (db: Db, where: Where, version: number) =>
  attempt(db, async () => {
    const result = await db.execute<{ done: boolean }>(
      sql`select app.mark_published(${where.routeId}, ${where.spaceId}, ${version}) as done`,
    );
    return result.rows[0]?.done === true ? ok(undefined) : fail("not_found");
  });

const insertModule = async (db: Db, where: Where, module: DraftModule) => {
  await db.insert(modules).values({ ...module, ...where });
  return ok(undefined);
};

const insertLesson = async (db: Db, where: Where, lesson: DraftLesson) => {
  await db.insert(lessons).values({ ...lesson, ...where });
  return ok(undefined);
};

export const routeDrafts = (db: Db): RouteDrafts => ({
  create: (spaceId, route) =>
    attempt(db, async () => {
      await db.insert(routes).values({ ...route, spaceId });
      return ok({ revision: 0 });
    }),
  get: (spaceId, routeId) => getDraft(db, { spaceId, routeId }),
  list: (spaceId) => listRoutes(db, spaceId),
  lockDraft: (spaceId, routeId, expected) =>
    attempt(db, () => lockDraft(db, { spaceId, routeId }, expected)),
  replaceContent: (spaceId, routeId, expected, content) =>
    edit(db, { spaceId, routeId }, expected, () =>
      replaceContent(db, { spaceId, routeId }, content),
    ),
  updateDetails: (spaceId, routeId, expected, details) =>
    edit(db, { spaceId, routeId }, expected, async () => {
      await db
        .update(routes)
        .set({ ...detailsOf(details), updatedAt: new Date() })
        .where(and(eq(routes.id, routeId), eq(routes.spaceId, spaceId)));
      return ok(undefined);
    }),
  addModule: (spaceId, routeId, expected, module) =>
    edit(db, { spaceId, routeId }, expected, () => insertModule(db, { spaceId, routeId }, module)),
  addLesson: (spaceId, routeId, expected, lesson) =>
    edit(db, { spaceId, routeId }, expected, () => insertLesson(db, { spaceId, routeId }, lesson)),
  addBlock: (spaceId, routeId, expected, block) =>
    edit(db, { spaceId, routeId }, expected, () => addBlock(db, { spaceId, routeId }, block)),
  archiveLesson: (spaceId, routeId, expected, lessonId) =>
    edit(db, { spaceId, routeId }, expected, () =>
      archiveLesson(db, { spaceId, routeId }, lessonId),
    ),
  markPublished: (spaceId, routeId, version) => markPublished(db, { spaceId, routeId }, version),
});
