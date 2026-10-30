import pg from "pg";
import { describe, expect, it } from "vitest";
import { eraseUser } from "../../scripts/erase-user";
import { attempt, backendPid, blockedOrDone, newUser, query, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// user.erase (Platform STEP 2 §2.16), run inside a transaction each test rolls back.

const APPEND_ONLY = /append-only/;
const PERMISSION_DENIED = /permission denied/;
const NO_OWNER_LEFT = /last owner|no owner left/;

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

/** A pending magic link for the user's address, stored as Better Auth stores it. */
async function pendingLink(db: pg.Client, userId: string, shout = false) {
  const { rows } = await db.query(`select email from "user" where id = $1`, [userId]);
  const email: string = rows[0]?.email;
  const identifier = crypto.randomUUID();
  await db.query(
    "insert into verification (identifier, value, expires_at) values ($1, $2, now() + interval '5 minutes')",
    [
      identifier,
      JSON.stringify({ email: shout ? email.toUpperCase() : email, name: "", attempt: 0 }),
    ],
  );
  return identifier;
}

async function linksLeft(db: pg.Client, identifiers: string[]) {
  const { rows } = await db.query(
    "select count(*)::int as n from verification where identifier = any ($1)",
    [identifiers],
  );
  return rows[0]?.n;
}

describe("user.erase (Platform STEP 2 §2.16)", () => {
  it("removes every per-user row of one user, and nothing of anyone else's", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const erased = await learner(db, space, route);
      const kept = await learner(db, space, route);

      const erasedLinks = [await pendingLink(db, erased), await pendingLink(db, erased, true)];
      const keptLinks = [await pendingLink(db, kept)];
      // A row of another kind whose value is not JSON stays, and breaks nothing.
      await db.query(
        "insert into verification (identifier, value, expires_at) values ($1, 'not json', now())",
        [crypto.randomUUID()],
      );

      await eraseUser(db, erased);

      expect(await linksLeft(db, erasedLinks)).toBe(0);
      expect(await linksLeft(db, keptLinks)).toBe(1);
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
      const space = await newSpace(setup, "erase-race");
      const route = await newRoute(setup, space);
      await newVersion(setup, space, route, 1);
      userId = await newUser(setup);
      const enrollment = await newEnrollment(setup, space, route, userId);

      await writer.query("begin");
      await writer.query(
        "insert into progress (enrollment_id, lesson_id, space_id, user_id, status) values ($1, uuidv7(), $2, $3, 'in_progress')",
        [enrollment, space, userId],
      );
      const eraser = new pg.Client({ connectionString: URLS.migrator });
      await eraser.connect();
      try {
        const eraserPid = await backendPid(eraser);
        await eraser.query("begin");
        const erasing = eraseUser(eraser, userId).then(() => rowsOf(eraser, userId));
        await blockedOrDone(eraserPid, erasing);
        await writer.query("commit");
        expect(Object.values(await erasing).every((n) => n === 0)).toBe(true);
      } finally {
        await eraser.query("rollback");
        await eraser.end();
      }
    } finally {
      if (userId) {
        await setup.query("begin");
        await eraseUser(setup, userId);
        await setup.query("commit");
      }
      await Promise.all([setup.end(), writer.end()]);
    }
  });

  it("erases one of two co-owners erased at once, and the space keeps the other", async () => {
    // Committed rows on three connections: the space and the surviving owner stay.
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const first = new pg.Client({ connectionString: URLS.migrator });
    const second = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), first.connect(), second.connect()]);
    try {
      const space = await newSpace(setup, "co-owners");
      const owners = [await newUser(setup), await newUser(setup)];
      for (const owner of owners) {
        await setup.query(
          "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')",
          [space, owner],
        );
      }
      const commitOrRollback = async (db: pg.Client, work: Promise<unknown>) => {
        try {
          await work;
          await db.query("commit");
          return "erased";
        } catch (error) {
          await db.query("rollback");
          return (error as Error).message;
        }
      };
      // The first erase runs and holds its transaction open while the second starts.
      const secondPid = await backendPid(second);
      await first.query("begin");
      await eraseUser(first, owners[0] as string);
      await second.query("begin");
      const secondDone = commitOrRollback(second, eraseUser(second, owners[1] as string));
      await blockedOrDone(secondPid, secondDone);
      const firstDone = commitOrRollback(first, Promise.resolve());
      const outcomes = await Promise.all([firstDone, secondDone]);

      expect(outcomes.filter((outcome) => outcome === "erased")).toHaveLength(1);
      expect(outcomes.find((outcome) => outcome !== "erased")).toMatch(NO_OWNER_LEFT);
      const { rows } = await setup.query(
        "select count(*)::int as n from memberships where space_id = $1 and role = 'owner'",
        [space],
      );
      expect(rows[0]?.n).toBe(1);
    } finally {
      await Promise.all([setup.end(), first.end(), second.end()]);
    }
  });

  it("is refused by the database when a space would be left without an owner", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "erase");
      const owner = await newUser(db);
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        owner,
      ]);
      await db.query("update memberships set role = 'coeditor' where user_id = $1", [owner]);
      expect(await attempt(db, "set constraints all immediate")).toMatch(NO_OWNER_LEFT);
      // A space deleted with its memberships (only the migrator can) needs no owner.
      await db.query("delete from memberships where space_id = $1", [space]);
      await db.query("delete from spaces where id = $1", [space]);
      expect(await attempt(db, "set constraints all immediate")).toBeNull();
    });
  });

  it("answers not found for a user that does not exist", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await expect(eraseUser(db, "0190f3a0-0000-7000-8000-0000000000ff")).rejects.toThrow(
        "no such user",
      );
    });
  });
});
