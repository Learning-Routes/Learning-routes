import type { SpaceRole } from "../../src/domain";
import { newBlockId } from "../../src/ids";
import { NEW_CARD } from "../../src/learning/replay";
import type { Member } from "../../src/memberships";
import type {
  ActionLogEntry,
  DraftBlock,
  DraftLesson,
  DraftModule,
  EnrollmentRecord,
  ProgressRecord,
  RepoResult,
  Repos,
  ReviewRecord,
  RouteDraft,
  RouteVersion,
  SpaceRecord,
  StoredCard,
} from "../../src/repos/ports";

// The repositories' in-memory twin (Platform STEP 2 §4): plain maps, with the same
// answers as Postgres for the contract suite. A transaction works on a copy and
// keeps it only if the work finishes; a throw discards it.

interface DraftRow {
  spaceId: string;
  route: RouteDraft["route"];
  revision: number;
  latestPublishedVersion: number | null;
  modules: DraftModule[];
  lessons: (DraftLesson & { archived: boolean })[];
  prerequisites: RouteDraft["prerequisites"];
  blocks: DraftBlock[];
}

export function memoryState() {
  return {
    spaces: new Map<string, SpaceRecord>(),
    members: new Map<string, { spaceId: string } & Member>(),
    drafts: new Map<string, DraftRow>(),
    versions: new Map<string, { spaceId: string } & RouteVersion>(),
    enrollments: new Map<string, EnrollmentRecord>(),
    progress: new Map<string, { spaceId: string; userId: string } & ProgressRecord>(),
    cards: new Map<string, { spaceId: string; userId: string; itemId: string } & StoredCard>(),
    reviews: new Map<string, { spaceId: string; userId: string } & ReviewRecord>(),
    log: [] as ({ spaceId: string } & ActionLogEntry)[],
  };
}
type State = ReturnType<typeof memoryState>;

const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
const fail = (error: "not_found" | "conflict" | "invalid") => ({ ok: false, error }) as const;
const newId = () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** A draft as the port returns it: live content only, each list in position order. */
function readDraft(row: DraftRow): RouteDraft {
  const modules = [...row.modules].sort(byPosition);
  const moduleOrder = new Map(modules.map((entry, i) => [entry.id, i]));
  const lessons = row.lessons
    .filter((entry) => !entry.archived)
    .sort(
      (a, b) =>
        (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || byPosition(a, b),
    )
    .map(({ archived: _, ...entry }) => entry);
  const lessonOrder = new Map(lessons.map((entry, i) => [entry.id, i]));
  const blocks = row.blocks
    .filter((entry) => lessonOrder.has(entry.lessonId))
    .sort(
      (a, b) =>
        (lessonOrder.get(a.lessonId) ?? 0) - (lessonOrder.get(b.lessonId) ?? 0) || byPosition(a, b),
    );
  return {
    route: row.route,
    modules,
    lessons,
    prerequisites: row.prerequisites.filter(
      (entry) => lessonOrder.has(entry.lessonId) && lessonOrder.has(entry.requiresLessonId),
    ),
    blocks,
    spaceId: row.spaceId,
    revision: row.revision,
    latestPublishedVersion: row.latestPublishedVersion,
  };
}

/** app.enroll's rules, in memory. */
function enroll(
  state: State,
  userId: string,
  routeId: string,
): RepoResult<{ enrollmentId: string; spaceId: string }> {
  const row = state.drafts.get(routeId);
  if (row === undefined || row.latestPublishedVersion === null) {
    return fail("not_found");
  }
  const member = state.members.has(`${row.spaceId}:${userId}`);
  if (row.route.access !== "open" || row.route.pricing !== "free") {
    return fail(member ? "invalid" : "not_found");
  }
  if (!member) {
    state.members.set(`${row.spaceId}:${userId}`, {
      spaceId: row.spaceId,
      userId,
      role: "student",
    });
  }
  const existing = [...state.enrollments.values()].find(
    (entry) => entry.userId === userId && entry.routeId === routeId,
  );
  if (existing !== undefined) {
    return existing.status === "active"
      ? ok({ enrollmentId: existing.id, spaceId: row.spaceId })
      : fail("invalid");
  }
  const id = newId();
  state.enrollments.set(id, {
    id,
    spaceId: row.spaceId,
    routeId,
    userId,
    pinnedVersion: row.latestPublishedVersion,
    status: "active",
  });
  return ok({ enrollmentId: id, spaceId: row.spaceId });
}

/** The twin, acting as one user: enroll acts for them, as Postgres does for app.user_id. */
export function memoryRepos(state: State, actorId = ""): Repos {
  const draftIn = (spaceId: string, routeId: string) => {
    const row = state.drafts.get(routeId);
    return row?.spaceId === spaceId ? row : undefined;
  };

  /** One draft edit: not_found without the route, conflict on a stale revision. */
  const edit = async (
    spaceId: string,
    routeId: string,
    expected: number,
    change: (row: DraftRow) => "not_found" | "conflict" | null,
  ) => {
    const row = draftIn(spaceId, routeId);
    if (row === undefined) {
      return fail("not_found");
    }
    if (row.revision !== expected) {
      return fail("conflict");
    }
    const refused = change(row);
    if (refused !== null) {
      return fail(refused);
    }
    row.revision += 1;
    return ok({ revision: row.revision });
  };

  const roleOf = (spaceId: string, userId: string): SpaceRole | null =>
    state.members.get(`${spaceId}:${userId}`)?.role ?? null;

  return {
    spaces: {
      get: async (spaceId) => {
        const space = state.spaces.get(spaceId);
        return space ? ok(space) : fail("not_found");
      },
    },
    memberships: {
      list: async (spaceId) =>
        [...state.members.values()]
          .filter((member) => member.spaceId === spaceId)
          .map(({ userId, role }) => ({ userId, role }))
          .sort((a, b) => (a.userId < b.userId ? -1 : 1)),
      add: async (spaceId, member) => {
        if (roleOf(spaceId, member.userId) !== null) {
          return fail("conflict");
        }
        state.members.set(`${spaceId}:${member.userId}`, { spaceId, ...member });
        return ok(undefined);
      },
      roleOf: async (spaceId, userId) => roleOf(spaceId, userId),
    },
    routeDrafts: {
      create: async (spaceId, route) => {
        const taken = [...state.drafts.values()].some(
          (row) =>
            row.route.id === route.id || (row.spaceId === spaceId && row.route.slug === route.slug),
        );
        if (taken) {
          return fail("conflict");
        }
        state.drafts.set(route.id, {
          spaceId,
          route,
          revision: 0,
          latestPublishedVersion: null,
          modules: [],
          lessons: [],
          prerequisites: [],
          blocks: [],
        });
        return ok({ revision: 0 });
      },
      get: async (spaceId, routeId) => {
        const row = draftIn(spaceId, routeId);
        return row === undefined ? fail("not_found") : ok(readDraft(row));
      },
      list: async (spaceId) =>
        [...state.drafts.values()]
          .filter((row) => row.spaceId === spaceId)
          .map((row) => ({
            id: row.route.id,
            slug: row.route.slug,
            title: row.route.title,
            revision: row.revision,
            latestPublishedVersion: row.latestPublishedVersion,
          }))
          .sort((a, b) => (a.slug < b.slug ? -1 : 1)),
      addModule: (spaceId, routeId, expected, module) =>
        edit(spaceId, routeId, expected, (row) => {
          if (row.modules.some((entry) => entry.position === module.position)) {
            return "conflict";
          }
          row.modules.push(module);
          return null;
        }),
      addLesson: (spaceId, routeId, expected, lesson) =>
        edit(spaceId, routeId, expected, (row) => {
          if (!row.modules.some((entry) => entry.id === lesson.moduleId)) {
            return "not_found";
          }
          const siblings = row.lessons.filter((entry) => entry.moduleId === lesson.moduleId);
          if (siblings.some((entry) => entry.position === lesson.position)) {
            return "conflict";
          }
          row.lessons.push({ ...lesson, archived: false });
          return null;
        }),
      addBlock: (spaceId, routeId, expected, block) =>
        edit(spaceId, routeId, expected, (row) => {
          if (!row.lessons.some((entry) => entry.id === block.lessonId && !entry.archived)) {
            return "not_found";
          }
          const siblings = row.blocks.filter((entry) => entry.lessonId === block.lessonId);
          if (siblings.some((entry) => entry.position === block.position)) {
            return "conflict";
          }
          row.blocks.push(block);
          return null;
        }),
      archiveLesson: (spaceId, routeId, expected, lessonId) =>
        edit(spaceId, routeId, expected, (row) => {
          const target = row.lessons.find((entry) => entry.id === lessonId && !entry.archived);
          if (target === undefined) {
            return "not_found";
          }
          target.archived = true;
          return null;
        }),
      markPublished: async (spaceId, routeId, version) => {
        const row = draftIn(spaceId, routeId);
        if (row === undefined || !state.versions.has(`${routeId}:${version}`)) {
          return fail("not_found");
        }
        row.latestPublishedVersion = version;
        return ok(undefined);
      },
    },
    routeVersions: {
      latest: async (spaceId, routeId) => {
        const versions = [...state.versions.values()]
          .filter((entry) => entry.spaceId === spaceId && entry.routeId === routeId)
          .map((entry) => entry.version);
        return versions.length === 0 ? null : Math.max(...versions);
      },
      get: async (spaceId, routeId, version) => {
        const stored = state.versions.get(`${routeId}:${version}`);
        if (stored?.spaceId !== spaceId) {
          return fail("not_found");
        }
        const { spaceId: _, ...entry } = stored;
        return ok(structuredClone(entry));
      },
      append: async (spaceId, version) => {
        const key = `${version.routeId}:${version.version}`;
        if (draftIn(spaceId, version.routeId) === undefined) {
          return fail("not_found");
        }
        if (state.versions.has(key)) {
          return fail("conflict");
        }
        state.versions.set(key, { spaceId, ...structuredClone(version) });
        return ok(undefined);
      },
    },
    enrollments: {
      get: async (spaceId, enrollmentId) => {
        const enrollment = state.enrollments.get(enrollmentId);
        return enrollment?.spaceId === spaceId ? ok(enrollment) : fail("not_found");
      },
      enroll: async (routeId) => enroll(state, actorId, routeId),
      setPinnedVersion: async (spaceId, enrollmentId, version) => {
        const enrollment = state.enrollments.get(enrollmentId);
        if (
          enrollment?.spaceId !== spaceId ||
          !state.versions.has(`${enrollment.routeId}:${version}`)
        ) {
          return fail("not_found");
        }
        enrollment.pinnedVersion = version;
        return ok(undefined);
      },
    },
    learning: {
      progress: async (spaceId, enrollmentId) =>
        [...state.progress.values()]
          .filter((entry) => entry.spaceId === spaceId && entry.enrollmentId === enrollmentId)
          .map(({ spaceId: _, userId: __, ...record }) => record)
          .sort((a, b) => (a.lessonId < b.lessonId ? -1 : 1)),
      saveProgress: async (spaceId, userId, record) => {
        const enrollment = state.enrollments.get(record.enrollmentId);
        if (enrollment?.spaceId !== spaceId || enrollment.userId !== userId) {
          return fail("not_found");
        }
        state.progress.set(`${record.enrollmentId}:${record.lessonId}`, {
          spaceId,
          userId,
          ...record,
        });
        return ok(undefined);
      },
      card: async (spaceId, userId, itemId) => {
        const stored = state.cards.get(`${userId}:${itemId}`);
        return stored?.spaceId === spaceId
          ? { id: stored.id, card: stored.card, dueAt: stored.dueAt }
          : null;
      },
      lockCard: async (spaceId, userId, itemId) => {
        const key = `${userId}:${itemId}`;
        if (!state.cards.has(key)) {
          state.cards.set(key, {
            spaceId,
            userId,
            itemId,
            id: newId(),
            card: NEW_CARD,
            dueAt: null,
          });
        }
        const stored = state.cards.get(key);
        return stored?.spaceId === spaceId
          ? ok({ id: stored.id, card: stored.card, dueAt: stored.dueAt })
          : fail("not_found");
      },
      saveCard: async (spaceId, userId, cardId, card, dueAt) => {
        const stored = [...state.cards.values()].find(
          (entry) => entry.id === cardId && entry.userId === userId && entry.spaceId === spaceId,
        );
        if (stored === undefined) {
          return fail("not_found");
        }
        Object.assign(stored, { card, dueAt });
        return ok(undefined);
      },
    },
    reviews: {
      append: async (spaceId, userId, entry) => {
        const stored = state.reviews.get(`${userId}:${entry.reviewId}`);
        if (stored === undefined) {
          state.reviews.set(`${userId}:${entry.reviewId}`, { spaceId, userId, ...entry });
          return ok({ review: entry, duplicate: false });
        }
        const { spaceId: storedSpace, userId: _, ...review } = stored;
        return storedSpace === spaceId ? ok({ review, duplicate: true }) : fail("conflict");
      },
    },
    actionLog: {
      append: async (spaceId, entry) => {
        state.log.push({ spaceId, ...entry });
      },
    },
    transaction: async (fn) => {
      const copy = structuredClone(state);
      const result = await fn(memoryRepos(copy, actorId));
      Object.assign(state, copy);
      return result;
    },
  };
}
