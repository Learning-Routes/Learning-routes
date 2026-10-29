import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { replayReviews } from "@learning-routes/core/learning/replay";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { eraseUser } from "../../scripts/erase-user";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// review.submit under concurrency, on Postgres (Platform STEP 2 §4.5): the card is
// locked for the length of each review, so no review is lost or reset.

const ITEM = "0192d3a0-0000-7000-8000-0000000000c1";

function ctxFor(db: pg.Client, userId: string) {
  const orm = drizzle(db, { casing: "snake_case" });
  return {
    actor: { via: "ui" as const, userId },
    repos: pgRepos(orm),
    tenancy: pgTenancy(orm),
    clock: { now: () => Date.UTC(2026, 9, 28, 12) },
    ids: { newId: () => crypto.randomUUID() },
  };
}

const submit = (
  db: pg.Client,
  userId: string,
  enrollmentId: string,
  reviewId: string,
  rating: number,
  at: number,
) =>
  runAction(
    ACTIONS,
    "review.submit",
    { enrollmentId, reviewId, itemId: ITEM, rating, at, elapsedMs: 700 },
    ctxFor(db, userId),
  );

describe("review.submit, two at once on one card", () => {
  it("keeps both reviews, or the first one's result for a retry, and never resets the card", async () => {
    // Both connections must see the rows, so they are committed, and the student
    // is erased at the end; the space and route stay, as content does.
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const one = new pg.Client({ connectionString: URLS.migrator });
    const two = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), one.connect(), two.connect()]);
    const student = await newUser(setup);
    try {
      const space = await newSpace(setup, "race");
      const route = await newRoute(setup, space);
      await newVersion(setup, space, route, 1);
      await setup.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
        [space, student],
      );
      const enrollment = await newEnrollment(setup, space, route, student);
      const run = async (db: pg.Client, reviewId: string, rating: number, at: number) => {
        await db.query("begin");
        await actAs(db, student);
        const result = await submit(db, student, enrollment, reviewId, rating, at);
        await db.query("commit");
        return result;
      };
      const first = crypto.randomUUID();
      const day = 86_400_000;
      const base = Date.UTC(2026, 9, 1);
      // Two different reviews of a new card at once, then a retry of the first.
      const results = await Promise.all([
        run(one, first, 3, base),
        run(two, crypto.randomUUID(), 4, base + day),
      ]);
      const retry = await run(one, first, 1, base);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(retry).toMatchObject({ ok: true, output: { duplicate: true } });

      const { rows: log } = await setup.query(
        "select rating, (extract(epoch from reviewed_at) * 1000)::bigint as at from reviews where user_id = $1",
        [student],
      );
      const { rows: stored } = await setup.query(
        "select reps, state from cards where user_id = $1",
        [student],
      );
      const rebuilt = replayReviews(
        log.map((row) => ({ rating: row.rating, reviewedAt: Number(row.at) })),
      );
      expect(log).toHaveLength(2);
      expect(stored).toEqual([{ reps: rebuilt.card.reps, state: rebuilt.card.state }]);
      expect(rebuilt.card.reps).toBe(2);
    } finally {
      await setup.query("begin");
      await eraseUser(setup, student);
      await setup.query("commit");
      await Promise.all([setup.end(), one.end(), two.end()]);
    }
  });
});

describe("the repositories on Postgres alone", () => {
  it("answer not_found for a card the user keeps in another space", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const user = await newUser(db);
      const [a, b] = [await newSpace(db, "space-a"), await newSpace(db, "space-b")];
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student'), ($3, $2, 'student')",
        [a, user, b],
      );
      await actAs(db, user);
      const repos = pgRepos(drizzle(db, { casing: "snake_case" }));
      expect((await repos.learning.lockCard(a, user, ITEM)).ok).toBe(true);
      expect(await repos.learning.lockCard(b, user, ITEM)).toEqual({
        ok: false,
        error: "not_found",
      });
    });
  });

  it("treat an archived route as gone: not listed, not read, not edited", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const owner = await newUser(db);
      const space = await newSpace(db, "archived");
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        owner,
      ]);
      const route = await newRoute(db, space);
      await db.query("update routes set archived_at = now() where id = $1", [route]);
      await actAs(db, owner);
      const drafts = pgRepos(drizzle(db, { casing: "snake_case" })).routeDrafts;
      expect(await drafts.list(space)).toEqual([]);
      expect(await drafts.get(space, route)).toEqual({ ok: false, error: "not_found" });
      const module = { id: crypto.randomUUID(), position: "V", title: { en: "M" } };
      expect(await drafts.addModule(space, route, 0, module)).toEqual({
        ok: false,
        error: "not_found",
      });
    });
  });
});
