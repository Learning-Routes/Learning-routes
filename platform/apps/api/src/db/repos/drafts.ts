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
import { routeVersions } from "../schema/versions";
import { attempt, type Db, fail, ok } from "./shared";

// A route's draft on Postgres (Platform STEP 2 §4): read in position order, and
// changed only by edits that name the revision they read.

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
    .where(and(eq(routes.id, where.routeId), eq(routes.spaceId, where.spaceId)));
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
  return ok({
    route: { id, slug, title, description, sourceLocale, access, pricing },
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
    .where(eq(routes.spaceId, spaceId))
    .orderBy(asc(sql`${routes.slug} collate "C"`));

/**
 * One draft edit: bumps the revision only if it is still the one the editor read,
 * then makes the change, all under one savepoint.
 */
const edit = (db: Db, where: Where, expected: number, change: () => Promise<RepoResult<void>>) =>
  attempt(db, async () => {
    const [bumped] = await db
      .update(routes)
      .set({ draftRevision: sql`${routes.draftRevision} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(routes.id, where.routeId),
          eq(routes.spaceId, where.spaceId),
          eq(routes.draftRevision, expected),
        ),
      )
      .returning({ revision: routes.draftRevision });
    if (bumped === undefined) {
      const [exists] = await db
        .select({ id: routes.id })
        .from(routes)
        .where(and(eq(routes.id, where.routeId), eq(routes.spaceId, where.spaceId)));
      return fail(exists === undefined ? "not_found" : "conflict");
    }
    const changed = await change();
    return changed.ok ? ok({ revision: bumped.revision }) : changed;
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

const markPublished = (db: Db, where: Where, version: number) =>
  attempt(db, async () => {
    const published = sql`exists (select 1 from ${routeVersions}
      where ${routeVersions.routeId} = ${where.routeId} and ${routeVersions.version} = ${version})`;
    const updated = await db
      .update(routes)
      .set({ latestPublishedVersion: version, updatedAt: new Date() })
      .where(and(eq(routes.id, where.routeId), eq(routes.spaceId, where.spaceId), published))
      .returning({ id: routes.id });
    return updated.length === 1 ? ok(undefined) : fail("not_found");
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
