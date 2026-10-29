import pg from "pg";
import { describe, expect, it } from "vitest";
import { eraseUser } from "../../scripts/erase-user";
import { attempt, newUser, query, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// user.erase (Platform STEP 2 §2.16), run inside a transaction each test rolls back.

const APPEND_ONLY = /append-only/;
const PERMISSION_DENIED = /permission denied/;

const PER_USER_TABLES = [
  ["user_profiles", "user_id"],
  ["memberships", "user_id"],
  ["platform_roles", "user_id"],
  ["enrollments", "user_id"],
  ["progress", "user_id"],
  ["cards", "user_id"],
  ["reviews", "user_id"],
  ["session", "user_id"],
  ["account", "user_id"],
  ["user", "id"],
] as const;

async function learner(db: pg.Client, spaceId: string, routeId: string) {
  const userId = await newUser(db);
  await db.query("insert into user_profiles (user_id) values ($1)", [userId]);
  await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'student')", [
    spaceId,
    userId,
  ]);
  await db.query("insert into platform_roles (user_id) values ($1)", [userId]);
  await db.query(
    "insert into session (user_id, token, expires_at, updated_at) values ($1, uuidv7()::text, now(), now())",
    [userId],
  );
  await db.query(
    "insert into account (user_id, account_id, provider_id, updated_at) values ($1, $2, 'magic-link', now())",
    [userId, userId],
  );
  const enrollment = await newEnrollment(db, spaceId, routeId, userId);
  await db.query(
    "insert into progress (enrollment_id, lesson_id, space_id, user_id, status) values ($1, uuidv7(), $2, $3, 'completed')",
    [enrollment, spaceId, userId],
  );
  const { rows } = await db.query(
    "insert into cards (user_id, space_id, item_id) values ($1, $2, uuidv7()) returning id",
    [userId, spaceId],
  );
  await db.query(
    `insert into reviews (user_id, space_id, card_id, review_id, rating, reviewed_at, elapsed_ms, state_before)
     values ($1, $2, $3, uuidv7(), 3, now(), 800, '{}')`,
    [userId, spaceId, rows[0]?.id],
  );
  await db.query(
    "insert into action_log (space_id, actor_user_id, actor_via, action, input, outcome) values ($1, $2, 'ui', 'review.submit', '{}', 'ok')",
    [spaceId, userId],
  );
  return userId;
}

async function rowsOf(db: pg.Client, userId: string) {
  const counts: Record<string, number> = {};
  for (const [table, column] of PER_USER_TABLES) {
    const { rows } = await db.query(
      `select count(*)::int as n from "${table}" where ${column} = $1`,
      [userId],
    );
    counts[table] = rows[0]?.n;
  }
  return counts;
}

describe("user.erase (Platform STEP 2 §2.16)", () => {
  it("removes every per-user row of one user, and nothing of anyone else's", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const erased = await learner(db, space, route);
      const kept = await learner(db, space, route);

      await eraseUser(db, erased);

      expect(Object.values(await rowsOf(db, erased)).every((n) => n === 0)).toBe(true);
      expect(Object.values(await rowsOf(db, kept)).every((n) => n === 1)).toBe(true);
      // The record of what they did stays, with no way back to who they were.
      const { rows } = await db.query(
        "select count(*)::int as n from action_log where actor_user_id = $1",
        [erased],
      );
      expect(rows[0]?.n).toBe(1);
    });
  });

  it("is the only way: deleting the user row directly is refused, by the reviews' rule", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const userId = await learner(db, space, route);
      await db.query("delete from progress where user_id = $1", [userId]);
      expect(await attempt(db, `delete from "user" where id = $1`, [userId])).toMatch(APPEND_ONLY);
    });
    await expect(query(URLS.app, `delete from "user" where false`)).rejects.toThrow(
      PERMISSION_DENIED,
    );
  });

  it("accepts the id in any case, as Postgres reads a uuid", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const userId = await learner(db, space, route);
      await eraseUser(db, userId.toUpperCase());
      expect(Object.values(await rowsOf(db, userId)).every((n) => n === 0)).toBe(true);
    });
  });

  it("refuses to erase the last owner of a space, who must hand it over first", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const owner = await newUser(db);
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        owner,
      ]);
      await expect(eraseUser(db, owner)).rejects.toThrow("last owner");
      const coOwner = await newUser(db);
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        coOwner,
      ]);
      await eraseUser(db, owner);
    });
  });

  it("waits for a progress write in flight on the user's enrollment, then erases it too", async () => {
    // Both connections must see the rows, so this test commits them and erases the
    // user at the end; the space and route stay, as content always does.
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const writer = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), writer.connect()]);
    let userId = "";
    try {
      const space = await newSpace(setup, `erase-race-${Date.now()}`);
      const route = await newRoute(setup, space);
      await newVersion(setup, space, route, 1);
      userId = await newUser(setup);
      const enrollment = await newEnrollment(setup, space, route, userId);

      await writer.query("begin");
      await writer.query(
        "insert into progress (enrollment_id, lesson_id, space_id, user_id, status) values ($1, uuidv7(), $2, $3, 'in_progress')",
        [enrollment, space, userId],
      );
      const erasing = rolledBack(URLS.migrator, async (db) => {
        await eraseUser(db, userId);
        return rowsOf(db, userId);
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await writer.query("commit");
      expect(Object.values(await erasing).every((n) => n === 0)).toBe(true);
    } finally {
      if (userId) {
        await setup.query("begin");
        await eraseUser(setup, userId);
        await setup.query("commit");
      }
      await Promise.all([setup.end(), writer.end()]);
    }
  });

  it("answers not found for a user that does not exist", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await expect(eraseUser(db, "0190f3a0-0000-7000-8000-0000000000ff")).rejects.toThrow(
        "no such user",
      );
    });
  });
});
