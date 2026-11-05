import { placeInRoute } from "../../src/content/lesson-view";
import type { SpaceRole } from "../../src/domain";
import { newBlockId } from "../../src/ids";
import { NEW_CARD } from "../../src/learning/replay";
import type { Member } from "../../src/memberships";
import type {
  ActionLogEntry,
  ApplicationRecord,
  CatalogListing,
  ConnectionRecord,
  DraftBlock,
  DraftLesson,
  DraftModule,
  EnrollmentRecord,
  ProgressRecord,
  RepoError,
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
// keeps it only if the work finishes; a throw discards it, and so does a commit
// over another transaction's that landed after this one began.

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
    connections: new Map<string, ConnectionRecord & { userId: string }>(),
    spaces: new Map<string, SpaceRecord>(),
    members: new Map<string, { spaceId: string } & Member>(),
    drafts: new Map<string, DraftRow>(),
    versions: new Map<string, { spaceId: string } & RouteVersion>(),
    enrollments: new Map<string, EnrollmentRecord>(),
    progress: new Map<string, { spaceId: string; userId: string } & ProgressRecord>(),
    cards: new Map<string, { spaceId: string; userId: string; itemId: string } & StoredCard>(),
    reviews: new Map<string, { spaceId: string; userId: string } & ReviewRecord>(),
    log: [] as ({ spaceId: string | null } & ActionLogEntry)[],
    listings: new Map<string, CatalogListing>(),
    applications: new Map<string, Omit<ApplicationRecord, "status"> & { status: string }>(),
    operators: new Set<string>(),
    /** Addresses that have signed in, and whose they are. */
    accounts: new Map<string, string>(),
    /** Bumped by every commit, so an overlapping one is caught instead of losing writes. */
    commits: 0,
  };
}
type State = ReturnType<typeof memoryState>;

const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
const fail = (error: RepoError) => ({ ok: false, error }) as const;
const newId = () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** A draft as the port returns it: a copy of the live content, each list in position order. */
function readDraft(row: DraftRow): RouteDraft {
  return structuredClone(liveDraft(row));
}

function liveDraft(row: DraftRow): RouteDraft {
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
  // An existing enrollment answers first, and makes no membership.
  const existing = [...state.enrollments.values()].find(
    (entry) => entry.userId === userId && entry.routeId === routeId,
  );
  if (existing !== undefined) {
    return existing.status === "active"
      ? ok({ enrollmentId: existing.id, spaceId: row.spaceId })
      : fail("invalid");
  }
  const member = state.members.has(`${row.spaceId}:${userId}`);
  if (row.route.access !== "open") {
    return fail(member ? "invalid" : "not_found");
  }
  if (!member) {
    state.members.set(`${row.spaceId}:${userId}`, {
      spaceId: row.spaceId,
      userId,
      role: "student",
    });
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
    change: (row: DraftRow) => RepoError | null,
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
    // Only the database can hold these: test/db and test/invitations.test.ts cover them.
    invitations: {
      invite: async () => ({ ok: false, error: "not_found" }),
      preview: async () => ({ state: "unknown", email: null, name: null, locale: null }),
      accept: async () => ({ ok: false, error: "not_found" }),
    },
    connections: {
      canConnect: async (userId) =>
        [...state.members.values()].some(
          (member) => member.userId === userId && member.role !== "student",
        ),
      list: async (userId) =>
        [...state.connections.values()].filter((row) => row.userId === userId),
      revoke: async (userId, clientId) => {
        const key = `${userId}:${clientId}`;
        return state.connections.delete(key);
      },
    },
    spaces: {
      listOwn: async (userId) =>
        [...state.members.values()].flatMap((member) => {
          const space = state.spaces.get(member.spaceId);
          return member.userId === userId && member.role !== "student" && space
            ? [{ id: space.id, slug: space.slug, name: space.name, role: member.role }]
            : [];
        }),
      get: async (spaceId) => {
        const space = state.spaces.get(spaceId);
        return space ? ok(space) : fail("not_found");
      },
      create: async ({ slug, name, locale, ownerEmail }) => {
        const ownerId = state.accounts.get(ownerEmail.toLowerCase());
        if (ownerId === undefined) {
          return fail("invalid");
        }
        if ([...state.spaces.values()].some((space) => space.slug === slug)) {
          return fail("conflict");
        }
        const spaceId = newId();
        state.spaces.set(spaceId, {
          id: spaceId,
          slug,
          name: { [locale]: name },
          defaultLocale: locale,
          locales: [locale],
          tagline: null,
          bio: null,
          brandColor: null,
        });
        state.members.set(`${spaceId}:${ownerId}`, { spaceId, userId: ownerId, role: "owner" });
        return ok({ spaceId });
      },
      update: async (spaceId, page) => {
        const space = state.spaces.get(spaceId);
        if (!space) {
          return fail("not_found");
        }
        const given = Object.entries(page).filter(([, value]) => value !== undefined);
        state.spaces.set(spaceId, { ...space, ...Object.fromEntries(given) });
        return ok(undefined);
      },
    },
    applications: {
      list: async () =>
        [...state.applications.values()].filter(
          (row) => row.status !== "declined",
        ) as ApplicationRecord[],
      decide: async (id, status) => {
        const row = state.applications.get(id);
        if (!row) {
          return fail("not_found");
        }
        row.status = status;
        return ok(undefined);
      },
    },
    catalog: {
      request: async (spaceId, routeId) => {
        const taken = [...state.listings.values()].some(
          (row) => row.routeId === routeId && ["requested", "approved"].includes(row.status),
        );
        if (taken) {
          return fail("conflict");
        }
        const listingId = newId();
        state.listings.set(listingId, {
          id: listingId,
          spaceId,
          routeId,
          status: "requested",
          note: null,
          decidedBy: null,
          decidedVersion: null,
          featuredPosition: null,
        });
        return ok({ listingId });
      },
      withdraw: async (spaceId, routeId) => {
        const active = [...state.listings.values()].find(
          (row) =>
            row.spaceId === spaceId &&
            row.routeId === routeId &&
            ["requested", "approved"].includes(row.status),
        );
        if (!active) {
          return fail("not_found");
        }
        active.status = "withdrawn";
        active.featuredPosition = null;
        return ok(undefined);
      },
      get: async (listingId) => {
        const row = state.listings.get(listingId);
        return row ? ok(structuredClone(row)) : fail("not_found");
      },
      queue: async () =>
        [...state.listings.values()]
          .filter((row) => ["requested", "approved"].includes(row.status))
          .map((row) => ({
            ...row,
            title: { en: "Route" },
            sourceLocale: "en",
            creator: { en: "Space" },
            latestVersion: 1,
          })),
      feature: async (listingId, position) => {
        const row = state.listings.get(listingId);
        if (!row) {
          return fail("not_found");
        }
        row.featuredPosition = position;
        return ok(undefined);
      },
      decide: async (listingId, decision) => {
        const row = state.listings.get(listingId);
        if (!row) {
          return fail("not_found");
        }
        state.listings.set(listingId, { ...row, ...decision });
        return ok(undefined);
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
          route: structuredClone(route),
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
      replaceContent: (spaceId, routeId, expected, content) =>
        edit(spaceId, routeId, expected, (row) => {
          const known = Object.fromEntries(
            Object.entries(content.details).filter(([, value]) => value !== undefined),
          );
          row.route = { ...row.route, ...known } as typeof row.route;
          row.modules = content.modules;
          row.lessons = content.lessons.map((lesson) => ({ ...lesson, archived: false }));
          row.blocks = content.blocks;
          row.prerequisites = [];
          return null;
        }),
      updateDetails: (spaceId, routeId, expected, details) =>
        edit(spaceId, routeId, expected, (row) => {
          const known = Object.fromEntries(
            Object.entries(details).filter(([, value]) => value !== undefined),
          );
          row.route = { ...row.route, ...known } as typeof row.route;
          return null;
        }),
      addModule: (spaceId, routeId, expected, module) =>
        edit(spaceId, routeId, expected, (row) => {
          if (row.modules.some((entry) => entry.position === module.position)) {
            return "position_taken";
          }
          row.modules.push(module);
          return null;
        }),
      addLesson: (spaceId, routeId, expected, lesson) =>
        edit(spaceId, routeId, expected, (row) => {
          if (!row.modules.some((entry) => entry.id === lesson.moduleId)) {
            return "not_found";
          }
          const siblings = row.lessons.filter(
            (entry) => entry.moduleId === lesson.moduleId && !entry.archived,
          );
          if (siblings.some((entry) => entry.position === lesson.position)) {
            return "position_taken";
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
            return "position_taken";
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
      lockDraft: async (spaceId, routeId, expected) => {
        const row = draftIn(spaceId, routeId);
        if (row === undefined) {
          return fail("not_found");
        }
        return row.revision === expected ? ok(undefined) : fail("conflict");
      },
      markPublished: async (spaceId, routeId, version) => {
        const row = draftIn(spaceId, routeId);
        if (
          row === undefined ||
          !state.versions.has(`${routeId}:${version}`) ||
          version <= (row.latestPublishedVersion ?? 0)
        ) {
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
      listOwn: async (userId) => ({
        teaches: [...state.members.values()].some(
          (member) => member.userId === userId && member.role !== "student",
        ),
        enrollments: [...state.enrollments.values()]
          .filter((row) => row.userId === userId && row.status === "active")
          .map((row) => {
            const { snapshot } = state.versions.get(`${row.routeId}:${row.pinnedVersion}`) ?? {};
            return {
              enrollmentId: row.id,
              routeId: row.routeId,
              title: snapshot?.route.title ?? { en: "" },
              sourceLocale: snapshot?.route.sourceLocale ?? "en",
              creator: state.spaces.get(row.spaceId)?.name ?? { en: "" },
              lessonsPerModule: (snapshot?.modules ?? []).map(
                (module) =>
                  (snapshot?.lessons ?? []).filter((lesson) => lesson.moduleId === module.id)
                    .length,
              ),
              completedLessons: (snapshot?.lessons ?? []).filter(
                (lesson) => state.progress.get(`${row.id}:${lesson.id}`)?.status === "completed",
              ).length,
              place: placeInRoute(
                { modules: snapshot?.modules ?? [], lessons: snapshot?.lessons ?? [] },
                (snapshot?.lessons ?? [])
                  .map((lesson) => lesson.id)
                  .filter((id) => state.progress.get(`${row.id}:${id}`)?.status === "completed"),
              ),
            };
          }),
      }),
      get: async (spaceId, enrollmentId) => {
        const enrollment = state.enrollments.get(enrollmentId);
        return enrollment?.spaceId === spaceId ? ok(enrollment) : fail("not_found");
      },
      enroll: async (routeId) => enroll(state, actorId, routeId),
      upgrade: async (spaceId, enrollmentId) => {
        const enrollment = state.enrollments.get(enrollmentId);
        if (
          enrollment?.spaceId !== spaceId ||
          enrollment.userId !== actorId ||
          enrollment.status !== "active"
        ) {
          return fail("not_found");
        }
        const latest = state.drafts.get(enrollment.routeId)?.latestPublishedVersion ?? null;
        if (latest !== null && latest > enrollment.pinnedVersion) {
          enrollment.pinnedVersion = latest;
        }
        return ok({ pinnedVersion: enrollment.pinnedVersion });
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
        const ownCard = [...state.cards.values()].some(
          (card) => card.id === entry.cardId && card.userId === userId && card.spaceId === spaceId,
        );
        if (stored === undefined && !ownCard) {
          return fail("not_found");
        }
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
        const ownConnection = spaceId === null && entry.action.startsWith("connection.");
        const allowed =
          ownConnection ||
          state.operators.has(actorId) ||
          (spaceId !== null && roleOf(spaceId, actorId) !== null);
        if (entry.actorUserId !== actorId || !allowed) {
          return fail("not_found");
        }
        state.log.push({ spaceId, ...entry });
        return ok(undefined);
      },
    },
    transaction: async (fn) => {
      const began = state.commits;
      const copy = structuredClone(state);
      const result = await fn(memoryRepos(copy, actorId));
      if (state.commits !== began) {
        throw new Error("overlapping transactions: another one committed after this began");
      }
      Object.assign(state, copy, { commits: began + 1 });
      return result;
    },
  };
}
