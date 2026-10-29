import { describe, expect, it } from "vitest";
import { snapshotOf } from "../../src/content/snapshot";
import { newBlockId } from "../../src/ids";
import { review } from "../../src/learning/fsrs";
import { progressSummary } from "../../src/learning/progress";
import { NEW_CARD } from "../../src/learning/replay";
import type { RepoResult, Repos, RouteVersion } from "../../src/repos/ports";

// One contract suite for every implementation of the repositories (Platform STEP 2
// §4.4): the in-memory twin in core's tests, and Postgres in the API's, which runs
// it as lr_app with app.user_id set. It covers behaviour; tenancy is the
// two-tenant test's (§3.9).

export interface ContractFixture {
  spaceId: string;
  ownerId: string;
  /** A user with no role in the space yet. */
  learnerId: string;
  /**
   * The repositories, acting as this user. The last call wins: Postgres acts for
   * one user per transaction, so a test calls actAs again whenever the actor changes.
   */
  actAs(userId: string): Promise<Repos>;
}

/** Runs one test with a fresh fixture, and cleans up after it. */
export type WithFixture = (test: (fixture: ContractFixture) => Promise<void>) => Promise<void>;

const random = () => crypto.getRandomValues(new Uint8Array(10));
export const newId = () => newBlockId(Date.now(), random());

function value<T>(result: RepoResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error}`);
  }
  return result.value;
}

const routeFields = (slug: string) => ({
  id: newId(),
  slug,
  title: { en: `Route ${slug}` },
  description: null,
  sourceLocale: "en" as const,
  access: "open" as const,
  pricing: "free" as const,
});

const module = (position: string) => ({
  id: newId(),
  position,
  title: { en: `Module ${position}` },
});
const lesson = (moduleId: string, position: string) => ({
  id: newId(),
  moduleId,
  position,
  title: { en: `Lesson ${position}` },
});

const HASH = "a".repeat(64);

async function publish(
  repos: Repos,
  spaceId: string,
  routeId: string,
  version: number,
  userId: string,
) {
  const draft = value(await repos.routeDrafts.get(spaceId, routeId));
  const entry: RouteVersion = {
    routeId,
    version,
    snapshot: snapshotOf(draft),
    contentHash: HASH,
    publishedByUserId: userId,
  };
  value(await repos.routeVersions.append(spaceId, entry));
  value(await repos.routeDrafts.markPublished(spaceId, routeId, version));
}

export function repositoryContract(name: string, withFixture: WithFixture) {
  describe(`the repository contract: ${name}`, () => {
    it("creates a route as an empty draft at revision 0, and refuses its slug twice", async () => {
      await withFixture(async ({ spaceId, ownerId, actAs }) => {
        const repos = await actAs(ownerId);
        const fields = routeFields("first");
        expect(await repos.routeDrafts.create(spaceId, fields)).toEqual({
          ok: true,
          value: { revision: 0 },
        });
        const draft = value(await repos.routeDrafts.get(spaceId, fields.id));
        expect(draft).toMatchObject({
          route: fields,
          modules: [],
          lessons: [],
          revision: 0,
          latestPublishedVersion: null,
        });
        expect(await repos.routeDrafts.create(spaceId, { ...routeFields("first") })).toEqual({
          ok: false,
          error: "conflict",
        });
      });
    });

    it("lists routes by slug, and orders content by position, byte by byte", async () => {
      await withFixture(async ({ spaceId, ownerId, actAs }) => {
        const repos = await actAs(ownerId);
        for (const slug of ["b-route", "a-route", "c-route"]) {
          value(await repos.routeDrafts.create(spaceId, routeFields(slug)));
        }
        expect((await repos.routeDrafts.list(spaceId)).map((route) => route.slug)).toEqual([
          "a-route",
          "b-route",
          "c-route",
        ]);
        const fields = routeFields("ordered");
        let revision = value(await repos.routeDrafts.create(spaceId, fields)).revision;
        // "Z" sorts before "a" byte by byte, as core's keys expect.
        for (const position of ["a", "Z", "V"]) {
          revision = value(
            await repos.routeDrafts.addModule(spaceId, fields.id, revision, module(position)),
          ).revision;
        }
        const draft = value(await repos.routeDrafts.get(spaceId, fields.id));
        expect(draft.modules.map((entry) => entry.position)).toEqual(["V", "Z", "a"]);
        expect(draft.revision).toBe(3);
      });
    });

    it("refuses a taken position, a missing parent, and a membership twice", async () => {
      await withFixture(async ({ spaceId, ownerId, learnerId, actAs }) => {
        const repos = await actAs(ownerId);
        const fields = routeFields("unique");
        value(await repos.routeDrafts.create(spaceId, fields));
        const first = module("V");
        const revision = value(
          await repos.routeDrafts.addModule(spaceId, fields.id, 0, first),
        ).revision;
        expect(
          await repos.routeDrafts.addModule(spaceId, fields.id, revision, module("V")),
        ).toEqual({
          ok: false,
          error: "conflict",
        });
        expect(
          await repos.routeDrafts.addLesson(spaceId, fields.id, revision, lesson(newId(), "V")),
        ).toEqual({
          ok: false,
          error: "not_found",
        });
        expect(await repos.routeDrafts.addModule(spaceId, newId(), 0, module("V"))).toEqual({
          ok: false,
          error: "not_found",
        });
        value(await repos.memberships.add(spaceId, { userId: learnerId, role: "assistant" }));
        expect(
          await repos.memberships.add(spaceId, { userId: learnerId, role: "student" }),
        ).toEqual({
          ok: false,
          error: "conflict",
        });
        expect(await repos.memberships.roleOf(spaceId, learnerId)).toBe("assistant");
      });
    });

    it("refuses an edit made on a stale revision: an agent and a person edit the same route", async () => {
      await withFixture(async ({ spaceId, ownerId, actAs }) => {
        const repos = await actAs(ownerId);
        const fields = routeFields("together");
        const read = value(await repos.routeDrafts.create(spaceId, fields)).revision;
        // Both read revision 0. The agent's edit lands first.
        const agentModule = module("G");
        value(await repos.routeDrafts.addModule(spaceId, fields.id, read, agentModule));
        const personModule = module("V");
        expect(await repos.routeDrafts.addModule(spaceId, fields.id, read, personModule)).toEqual({
          ok: false,
          error: "conflict",
        });
        // Nothing is lost: the agent's module stays, and the person retries on the new revision.
        const current = value(await repos.routeDrafts.get(spaceId, fields.id));
        expect(current.modules.map((entry) => entry.id)).toEqual([agentModule.id]);
        value(
          await repos.routeDrafts.addModule(spaceId, fields.id, current.revision, personModule),
        );
        const after = value(await repos.routeDrafts.get(spaceId, fields.id));
        expect(after.modules.map((entry) => entry.id)).toEqual([agentModule.id, personModule.id]);
      });
    });

    it("keeps versions immutable: a version is appended once, and reads back as written", async () => {
      await withFixture(async ({ spaceId, ownerId, actAs }) => {
        const repos = await actAs(ownerId);
        const fields = routeFields("versions");
        value(await repos.routeDrafts.create(spaceId, fields));
        await publish(repos, spaceId, fields.id, 1, ownerId);
        const first = value(await repos.routeVersions.get(spaceId, fields.id, 1));
        const changed = { ...first, contentHash: "b".repeat(64) };
        expect(await repos.routeVersions.append(spaceId, changed)).toEqual({
          ok: false,
          error: "conflict",
        });
        expect(value(await repos.routeVersions.get(spaceId, fields.id, 1))).toEqual(first);
        expect(await repos.routeVersions.get(spaceId, fields.id, 2)).toEqual({
          ok: false,
          error: "not_found",
        });
        expect(await repos.routeVersions.latest(spaceId, fields.id)).toBe(1);
        expect(await repos.routeVersions.latest(spaceId, newId())).toBeNull();
      });
    });

    it("leaves no version row when a publish throws halfway", async () => {
      await withFixture(async ({ spaceId, ownerId, actAs }) => {
        const repos = await actAs(ownerId);
        const fields = routeFields("halfway");
        value(await repos.routeDrafts.create(spaceId, fields));
        await expect(
          repos.transaction(async (unit) => {
            await publish(unit, spaceId, fields.id, 1, ownerId);
            throw new Error("the snapshot upload failed");
          }),
        ).rejects.toThrow("the snapshot upload failed");
        expect(await repos.routeVersions.get(spaceId, fields.id, 1)).toEqual({
          ok: false,
          error: "not_found",
        });
        expect(
          value(await repos.routeDrafts.get(spaceId, fields.id)).latestPublishedVersion,
        ).toBeNull();
      });
    });

    it("locks a card without ever resetting it, and gives a retried review its first result back", async () => {
      await withFixture(async ({ spaceId, ownerId, learnerId, actAs }) => {
        const owner = await actAs(ownerId);
        value(await owner.memberships.add(spaceId, { userId: learnerId, role: "student" }));
        const learner = await actAs(learnerId);
        const itemId = newId();
        const at = Date.UTC(2026, 9, 28);
        const fresh = value(await learner.learning.lockCard(spaceId, learnerId, itemId));
        expect(fresh).toMatchObject({ card: NEW_CARD, dueAt: null });
        const first = review(NEW_CARD, 3, at);
        value(
          await learner.learning.saveCard(
            spaceId,
            learnerId,
            fresh.id,
            first.card,
            first.nextReviewAt,
          ),
        );
        // Locking it again finds the saved card, never a new one.
        expect(value(await learner.learning.lockCard(spaceId, learnerId, itemId))).toEqual({
          id: fresh.id,
          card: first.card,
          dueAt: first.nextReviewAt,
        });
        const entry = {
          reviewId: newId(),
          cardId: fresh.id,
          rating: 3,
          reviewedAt: at,
          elapsedMs: 900,
          stateBefore: NEW_CARD,
        };
        expect(value(await learner.reviews.append(spaceId, learnerId, entry))).toEqual({
          review: entry,
          duplicate: false,
        });
        // The retry carries another rating; the stored review wins.
        expect(
          value(await learner.reviews.append(spaceId, learnerId, { ...entry, rating: 1 })),
        ).toEqual({
          review: entry,
          duplicate: true,
        });
        expect(await learner.learning.card(spaceId, learnerId, itemId)).toEqual({
          id: fresh.id,
          card: first.card,
          dueAt: first.nextReviewAt,
        });
      });
    });

    it("upgrades an enrollment: progress on a removed lesson is kept but not counted", async () => {
      await withFixture(async ({ spaceId, ownerId, learnerId, actAs }) => {
        const owner = await actAs(ownerId);
        const fields = routeFields("upgrade");
        let revision = value(await owner.routeDrafts.create(spaceId, fields)).revision;
        const m = module("V");
        revision = value(
          await owner.routeDrafts.addModule(spaceId, fields.id, revision, m),
        ).revision;
        const kept = lesson(m.id, "G");
        const removed = lesson(m.id, "V");
        revision = value(
          await owner.routeDrafts.addLesson(spaceId, fields.id, revision, kept),
        ).revision;
        revision = value(
          await owner.routeDrafts.addLesson(spaceId, fields.id, revision, removed),
        ).revision;
        await publish(owner, spaceId, fields.id, 1, ownerId);

        const learner = await actAs(learnerId);
        const { enrollmentId } = value(await learner.enrollments.enroll(fields.id));
        expect(value(await learner.enrollments.get(spaceId, enrollmentId))).toMatchObject({
          routeId: fields.id,
          userId: learnerId,
          pinnedVersion: 1,
          status: "active",
        });
        for (const lessonId of [kept.id, removed.id]) {
          value(
            await learner.learning.saveProgress(spaceId, learnerId, {
              enrollmentId,
              lessonId,
              status: "completed",
              completedAt: Date.UTC(2026, 9, 28),
              blocks: [],
            }),
          );
        }

        // Version 2 removes one lesson and adds another.
        const author = await actAs(ownerId);
        const draft = value(await author.routeDrafts.get(spaceId, fields.id));
        revision = value(
          await author.routeDrafts.archiveLesson(spaceId, fields.id, draft.revision, removed.id),
        ).revision;
        const added = lesson(m.id, "k");
        value(await author.routeDrafts.addLesson(spaceId, fields.id, revision, added));
        await publish(author, spaceId, fields.id, 2, ownerId);

        const student = await actAs(learnerId);
        value(await student.enrollments.setPinnedVersion(spaceId, enrollmentId, 2));
        const pinned = value(await student.enrollments.get(spaceId, enrollmentId));
        const version = value(
          await student.routeVersions.get(spaceId, fields.id, pinned.pinnedVersion),
        );
        const progress = await student.learning.progress(spaceId, enrollmentId);
        expect(progress.map((record) => record.lessonId).sort()).toEqual(
          [kept.id, removed.id].sort(),
        );
        expect(version.snapshot.lessons.map((entry) => entry.id)).toEqual([kept.id, added.id]);
        expect(progressSummary(version.snapshot, progress)).toEqual({
          completed: 1,
          total: 2,
          uncounted: 1,
        });
      });
    });
  });
}
