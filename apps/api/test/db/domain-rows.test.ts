import type { Actor } from "@learning-routes/core/actions/actor";
import { Block } from "@learning-routes/core/blocks/schema";
import { SNAPSHOT_FORMAT, type Snapshot } from "@learning-routes/core/content/snapshot";
import {
  Enrollment,
  Lesson,
  Membership,
  Module,
  Progress,
  ReviewCard,
  Route,
  Space,
  UserProfile,
} from "@learning-routes/core/domain";
import { type LoggedReview, NEW_CARD } from "@learning-routes/core/learning/replay";
import type { InferInsertModel, Table } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { blocks, lessonPrerequisites, lessons, modules, routes } from "../../src/db/schema/content";
import { cards, enrollments, progress, reviews } from "../../src/db/schema/learning";
import { actionLog } from "../../src/db/schema/log";
import { memberships, platformRoles, spaces, userProfiles } from "../../src/db/schema/tenancy";
import { routeVersions } from "../../src/db/schema/versions";
import { newUser, rolledBack, URLS } from "./connect";

// The tables against core/domain.ts (Platform STEP 2 §2.18, review item 14): each of
// the 15 tables gets a typed mapper from core's value to its full row. A column
// the mapper does not fill fails the types (Row makes every column required); a
// domain key no column takes fails at run time (mapped() checks every key was
// read); a value the database refuses fails the insert. The catalog's tables have no
// domain schema: their rows are tested in catalog-fence.test.ts.

/** Every column of the table, none optional. */
type Row<T extends Table> = Required<InferInsertModel<T>>;
type SpaceMembership = Extract<Membership, { scope: "space" }>;
type PlatformRole = Extract<Membership, { scope: "platform" }>;

const NOW = "2026-10-28T12:00:00.000Z";
const at = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

/** Runs the mapper on a value that records which keys it reads; all must be. */
function mapped<T extends object, R>(value: T, mapper: (value: T) => R): R {
  const read = new Set<string | symbol>();
  const watched = new Proxy(value, {
    get(target, key, receiver) {
      read.add(key);
      return Reflect.get(target, key, receiver);
    },
  });
  const row = mapper(watched);
  expect(Object.keys(value).filter((key) => !read.has(key))).toEqual([]);
  return row;
}

const toRow = {
  userProfiles: (p: UserProfile): Row<typeof userProfiles> => ({
    userId: p.userId,
    displayName: p.displayName,
    timeZone: p.timeZone,
    uiLocale: p.uiLocale,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  }),
  spaces: (s: Space): Row<typeof spaces> => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    defaultLocale: s.defaultLocale,
    locales: s.locales,
    tagline: null,
    bio: null,
    brandColor: null,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.createdAt),
    archivedAt: null,
  }),
  memberships: (m: SpaceMembership): Row<typeof memberships> => ({
    spaceId: m.scope === "space" ? m.spaceId : "",
    userId: m.userId,
    role: m.role,
    createdAt: new Date(NOW),
  }),
  platformRoles: (m: PlatformRole): Row<typeof platformRoles> => ({
    userId: m.userId,
    isOperator: m.scope === "platform" && m.role === "operator",
  }),
  routes: (r: Route, spaceId: string): Row<typeof routes> => ({
    id: r.id,
    spaceId: r.spaceId === spaceId ? r.spaceId : "",
    slug: r.slug,
    title: r.title,
    description: r.description ?? null,
    sourceLocale: r.sourceLocale,
    access: r.access,
    pricing: r.pricing,
    topic: "otros",
    level: "inicial",
    priceMinor: null,
    currency: null,
    draftRevision: 0,
    latestPublishedVersion: r.version,
    forkedFromSpaceId: r.forkedFrom?.spaceId ?? null,
    forkedFromRouteId: r.forkedFrom?.routeId ?? null,
    forkedFromVersion: r.forkedFrom?.version ?? null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
    archivedAt: null,
  }),
  modules: (m: Module, spaceId: string): Row<typeof modules> => ({
    id: m.id,
    spaceId,
    routeId: m.routeId,
    position: m.position,
    title: m.title,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    archivedAt: null,
  }),
  /** The lesson's own row; its prerequisites and blocks have tables of their own. */
  lessons: (l: Lesson, spaceId: string) => ({
    lesson: {
      id: l.id,
      spaceId,
      routeId: l.routeId,
      moduleId: l.moduleId,
      position: l.position,
      title: l.title,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      archivedAt: null,
    } satisfies Row<typeof lessons>,
    prerequisites: l.prerequisites.map(
      (requiresLessonId): Row<typeof lessonPrerequisites> => ({
        spaceId,
        routeId: l.routeId,
        lessonId: l.id,
        requiresLessonId,
      }),
    ),
    blocks: l.blocks,
  }),
  blocks: (b: Block, where: { spaceId: string; lessonId: string; position: string }) => {
    const { id, type, ...data } = b;
    return {
      id,
      ...where,
      kind: type,
      data,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      archivedAt: null,
    } satisfies Row<typeof blocks>;
  },
  routeVersions: (
    s: Snapshot,
    where: { spaceId: string; version: number; publishedByUserId: string },
  ): Row<typeof routeVersions> => ({
    id: crypto.randomUUID(),
    spaceId: where.spaceId,
    routeId: s.route.id,
    version: where.version,
    // The whole snapshot is the column.
    snapshot: { ...s },
    snapshotFormat: SNAPSHOT_FORMAT,
    contentHash: "0".repeat(64),
    publishedByUserId: where.publishedByUserId,
    publishedAt: new Date(NOW),
  }),
  enrollments: (e: Enrollment, spaceId: string): Row<typeof enrollments> => ({
    id: e.id,
    spaceId,
    routeId: e.routeId,
    userId: e.studentId,
    pinnedVersion: e.routeVersion,
    status: e.status,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.createdAt),
  }),
  progress: (p: Progress, spaceId: string): Row<typeof progress> => ({
    enrollmentId: p.enrollmentId,
    lessonId: p.lessonId,
    spaceId,
    userId: p.studentId,
    status: p.status,
    completedAt: at(p.completedAt),
    blocks: p.blocks,
    updatedAt: new Date(NOW),
  }),
  cards: (c: ReviewCard, where: { id: string; userId: string; spaceId: string; itemId: string }) =>
    ({
      ...where,
      state: c.state,
      reps: c.reps,
      lapses: c.lapses,
      stability: c.stability,
      difficulty: c.difficulty,
      lastReviewAt: at(c.lastReviewAt),
      dueAt: at(c.nextReviewAt),
      fsrsParamsVersion: 1,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    }) satisfies Row<typeof cards>,
  reviews: (
    r: LoggedReview,
    where: { userId: string; spaceId: string; cardId: string },
  ): Row<typeof reviews> => ({
    id: crypto.randomUUID(),
    ...where,
    reviewId: crypto.randomUUID(),
    rating: r.rating,
    reviewedAt: new Date(r.reviewedAt),
    elapsedMs: 800,
    stateBefore: NEW_CARD,
  }),
  actionLog: (a: Actor, spaceId: string): Row<typeof actionLog> => ({
    id: crypto.randomUUID(),
    spaceId,
    actorUserId: a.userId,
    actorVia: a.via,
    agentRunId: null,
    oauthClientId: null,
    action: "review.submit",
    input: {},
    outcome: "ok",
    routeRevision: null,
    at: new Date(NOW),
  }),
};

const ids = {
  space: "0190f3a0-0000-7000-8000-000000000101",
  route: "0190f3a0-0000-7000-8000-000000000102",
  module: "0190f3a0-0000-7000-8000-000000000103",
  lesson: "0190f3a0-0000-7000-8000-000000000104",
  block: "0190f3a0-0000-7000-8000-000000000105",
  enrollment: "0190f3a0-0000-7000-8000-000000000106",
  firstLesson: "0190f3a0-0000-7000-8000-000000000107",
  card: "0190f3a0-0000-7000-8000-000000000108",
};

async function insertTenancy(client: pg.Client, userId: string) {
  const db = drizzle(client, { casing: "snake_case" });
  const profile = UserProfile.parse({
    userId,
    displayName: "Ana",
    timeZone: "America/Mexico_City",
    uiLocale: "es",
  });
  await db.insert(userProfiles).values(mapped(profile, toRow.userProfiles));
  const space = Space.parse({
    id: ids.space,
    slug: `domain-rows-${crypto.randomUUID()}`,
    name: { en: "English Unlimited", es: "Inglés Ilimitado" },
    defaultLocale: "en",
    locales: ["en", "es"],
    createdAt: NOW,
  });
  await db.insert(spaces).values(mapped(space, toRow.spaces));
  const owner = Membership.parse({ scope: "space", spaceId: ids.space, userId, role: "owner" });
  await db.insert(memberships).values(mapped(owner as SpaceMembership, toRow.memberships));
  const operator = Membership.parse({ scope: "platform", userId, role: "operator" });
  await db.insert(platformRoles).values(mapped(operator as PlatformRole, toRow.platformRoles));
}

async function insertContent(client: pg.Client) {
  const db = drizzle(client, { casing: "snake_case" });
  const route = Route.parse({
    id: ids.route,
    spaceId: ids.space,
    slug: "first-route",
    title: { en: "First route" },
    description: { en: "A route", es: "Una ruta" },
    sourceLocale: "en",
    access: "closed",
    pricing: "paid",
    version: 1,
    forkedFrom: { spaceId: ids.space, routeId: ids.route, version: 1 },
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(routes).values(mapped(route, (r) => toRow.routes(r, ids.space)));
  const module = Module.parse({
    id: ids.module,
    routeId: ids.route,
    position: "V",
    title: { en: "M" },
  });
  await db.insert(modules).values(mapped(module, (m) => toRow.modules(m, ids.space)));
  const block = Block.parse({
    id: ids.block,
    type: "concept",
    title: { en: "Idea" },
    body: { en: "Text" },
  });
  const lessonOf = (id: string, position: string, prerequisites: string[], body: Block[]) =>
    Lesson.parse({
      id,
      routeId: ids.route,
      moduleId: ids.module,
      position,
      title: { en: "L" },
      prerequisites,
      blocks: body,
    });
  for (const lesson of [
    lessonOf(ids.firstLesson, "F", [], []),
    lessonOf(ids.lesson, "V", [ids.firstLesson], [block]),
  ]) {
    const rows = mapped(lesson, (l) => toRow.lessons(l, ids.space));
    await db.insert(lessons).values(rows.lesson);
    for (const prerequisite of rows.prerequisites) {
      await db.insert(lessonPrerequisites).values(prerequisite);
    }
    for (const stored of rows.blocks) {
      const where = { spaceId: ids.space, lessonId: lesson.id, position: "V" };
      await db.insert(blocks).values(mapped(stored, (b) => toRow.blocks(b, where)));
    }
  }
}

async function insertVersion(client: pg.Client, userId: string) {
  const db = drizzle(client, { casing: "snake_case" });
  const snapshot: Snapshot = {
    route: {
      id: ids.route,
      slug: "first-route",
      title: { en: "First route" },
      description: null,
      sourceLocale: "en",
      access: "closed",
      pricing: "paid",
      topic: "otros" as const,
      level: "inicial" as const,
      priceMinor: null,
      currency: null,
    },
    modules: [{ id: ids.module, position: "V", title: { en: "M" } }],
    lessons: [{ id: ids.lesson, moduleId: ids.module, position: "V", title: { en: "L" } }],
    prerequisites: [],
    blocks: [
      {
        id: ids.block,
        lessonId: ids.lesson,
        position: "V",
        kind: "concept",
        data: { title: { en: "Idea" } },
      },
    ],
  };
  const where = { spaceId: ids.space, version: 1, publishedByUserId: userId };
  await db.insert(routeVersions).values(mapped(snapshot, (s) => toRow.routeVersions(s, where)));
}

async function insertLearning(client: pg.Client, userId: string) {
  const db = drizzle(client, { casing: "snake_case" });
  const enrollment = Enrollment.parse({
    id: ids.enrollment,
    routeId: ids.route,
    routeVersion: 1,
    studentId: userId,
    status: "active",
    createdAt: NOW,
  });
  await db.insert(enrollments).values(mapped(enrollment, (e) => toRow.enrollments(e, ids.space)));
  const lessonProgress = Progress.parse({
    enrollmentId: ids.enrollment,
    studentId: userId,
    lessonId: ids.lesson,
    status: "completed",
    completedAt: NOW,
    blocks: [
      {
        blockId: ids.block,
        attempts: 2,
        correct: true,
        score: 100,
        releasedAt: null,
        completedAt: NOW,
      },
    ],
  });
  await db.insert(progress).values(mapped(lessonProgress, (p) => toRow.progress(p, ids.space)));
  const card = ReviewCard.parse({
    state: "review",
    reps: 3,
    lapses: 1,
    stability: 4.5,
    difficulty: 6.2,
    lastReviewAt: NOW,
    nextReviewAt: "2026-11-02T12:00:00.000Z",
  });
  const cardWhere = { id: ids.card, userId, spaceId: ids.space, itemId: ids.block };
  await db.insert(cards).values(mapped(card, (c) => toRow.cards(c, cardWhere)));
  const logged: LoggedReview = { rating: 3, reviewedAt: Date.parse(NOW) };
  const reviewWhere = { userId, spaceId: ids.space, cardId: ids.card };
  await db.insert(reviews).values(mapped(logged, (r) => toRow.reviews(r, reviewWhere)));
  const actor: Actor = { via: "ui", userId };
  await db.insert(actionLog).values(mapped(actor, (a) => toRow.actionLog(a, ids.space)));
}

const TABLES = [
  "user_profiles",
  "spaces",
  "memberships",
  "platform_roles",
  "routes",
  "modules",
  "lessons",
  "blocks",
  "lesson_prerequisites",
  "route_versions",
  "enrollments",
  "progress",
  "cards",
  "reviews",
  "action_log",
];

describe("every table holds what core's domain schemas allow", () => {
  it("maps one domain value into each of the 15 tables", async () => {
    await rolledBack(URLS.migrator, async (client) => {
      const userId = await newUser(client);
      await insertTenancy(client, userId);
      await insertContent(client);
      await insertVersion(client, userId);
      await insertLearning(client, userId);

      const { rows } = await client.query(
        `select relname from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace
           and relname not in ('user', 'session', 'account', 'verification', 'rate_limit',
                               'catalog_listings', 'creator_applications', 'creator_invitations', 'jwks',
                               'oauth_client', 'oauth_resource', 'oauth_client_resource',
                               'oauth_refresh_token', 'oauth_access_token', 'oauth_consent',
                               'oauth_client_assertion', 'connection_uses')`,
      );
      expect(rows.map((row: { relname: string }) => row.relname).sort()).toEqual(
        [...TABLES].sort(),
      );
      for (const table of TABLES) {
        const column = { spaces: "id", user_profiles: "user_id", platform_roles: "user_id" }[table];
        const owner = column === undefined || column === "id" ? ids.space : userId;
        const counted = await client.query(
          `select count(*)::int as n from ${table} where ${column ?? "space_id"} = $1`,
          [owner],
        );
        expect(counted.rows[0]?.n, table).toBeGreaterThan(0);
      }
    });
  });
});
