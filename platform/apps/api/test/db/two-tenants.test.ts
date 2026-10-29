import pg from "pg";
import { describe, expect, it } from "vitest";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// The two-tenant test (Platform STEP 2 §3.9), as raw SQL under lr_app's row-level
// security, with core's checks out of the way. Users A and B each own a space;
// A's space has two students and a coeditor. Every table holds rows of both.

const RLS = /row-level security/;

async function world(db: pg.Client) {
  const a = await newUser(db);
  const b = await newUser(db);
  const coeditor = await newUser(db);
  const student = await newUser(db);
  const otherStudent = await newUser(db);
  const spaceA = await newSpace(db, "space-a");
  const spaceB = await newSpace(db, "space-b");
  const member = "insert into memberships (space_id, user_id, role) values ($1, $2, $3)";
  await db.query(member, [spaceA, a, "owner"]);
  await db.query(member, [spaceB, b, "owner"]);
  await db.query(member, [spaceA, coeditor, "coeditor"]);
  await db.query(member, [spaceA, student, "student"]);
  await db.query(member, [spaceA, otherStudent, "student"]);
  const routes: Record<string, string> = {};
  for (const [space, key] of [
    [spaceA, "a"],
    [spaceB, "b"],
  ] as const) {
    const route = await newRoute(db, space);
    routes[key] = route;
    const { rows: modules } = await db.query(
      `insert into modules (space_id, route_id, position, title) values ($1, $2, 'V', '{"en": "M"}') returning id`,
      [space, route],
    );
    const { rows: lessons } = await db.query(
      `insert into lessons (space_id, route_id, module_id, position, title) values ($1, $2, $3, 'V', '{"en": "L"}') returning id`,
      [space, route, modules[0]?.id],
    );
    await db.query(
      `insert into blocks (space_id, lesson_id, position, kind, data) values ($1, $2, 'V', 'concept', '{}')`,
      [space, lessons[0]?.id],
    );
    await newVersion(db, space, route, 1);
    await db.query("update routes set latest_published_version = 1 where id = $1", [route]);
    await db.query(
      "insert into action_log (space_id, actor_user_id, actor_via, action, input, outcome) values ($1, uuidv7(), 'ui', 'route.create', '{}', 'ok')",
      [space],
    );
  }
  const learner = async (userId: string, space: string, route: string) => {
    const enrollment = await newEnrollment(db, space, route, userId);
    await db.query(
      "insert into progress (enrollment_id, lesson_id, space_id, user_id, status) values ($1, uuidv7(), $2, $3, 'in_progress')",
      [enrollment, space, userId],
    );
    const { rows } = await db.query(
      "insert into cards (user_id, space_id, item_id) values ($1, $2, uuidv7()) returning id",
      [userId, space],
    );
    await db.query(
      `insert into reviews (user_id, space_id, card_id, review_id, rating, reviewed_at, elapsed_ms, state_before)
       values ($1, $2, $3, uuidv7(), 3, now(), 500, '{}')`,
      [userId, space, rows[0]?.id],
    );
    await db.query("insert into user_profiles (user_id) values ($1)", [userId]);
    return enrollment;
  };
  await learner(student, spaceA, routes.a as string);
  await learner(otherStudent, spaceA, routes.a as string);
  // B studies in their own space too.
  await learner(b, spaceB, routes.b as string);
  return { a, b, coeditor, student, otherStudent, spaceA, spaceB, routes };
}

const SPACE_TABLES = [
  "spaces",
  "memberships",
  "routes",
  "modules",
  "lessons",
  "blocks",
  "route_versions",
  "enrollments",
  "progress",
  "cards",
  "reviews",
  "action_log",
];

async function visibleSpaces(db: pg.Client, table: string): Promise<string[]> {
  const column = table === "spaces" ? "id" : "space_id";
  const { rows } = await db.query(`select distinct ${column} as space from ${table}`);
  return rows.map((row) => row.space);
}

describe("two tenants, raw SQL under row-level security", () => {
  it("A sees none of B's rows, in any table", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await actAs(db, w.a);
      for (const table of SPACE_TABLES) {
        const others = (await visibleSpaces(db, table)).filter((space) => space !== w.spaceA);
        expect([table, others]).toEqual([table, []]);
      }
      expect(await visibleSpaces(db, "spaces")).toEqual([w.spaceA]);
      const profiles = await db.query("select user_id from user_profiles");
      expect(profiles.rows).toEqual([]);
    });
  });

  it("A cannot write into B's space: inserts are refused, updates touch nothing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await actAs(db, w.a);
      await db.query("savepoint s");
      await expect(
        db.query(
          `insert into routes (space_id, slug, title, source_locale, access, pricing) values ($1, 'stolen', '{"en": "x"}', 'en', 'open', 'free')`,
          [w.spaceB],
        ),
      ).rejects.toThrow(RLS);
      await db.query("rollback to savepoint s");
      await expect(
        db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
          w.spaceB,
          w.a,
        ]),
      ).rejects.toThrow(RLS);
      await db.query("rollback to savepoint s");
      const updated = await db.query(`update routes set title = '{"en": "mine"}' where id = $1`, [
        w.routes.b,
      ]);
      expect(updated.rowCount).toBe(0);
    });
  });

  it("with no user set, nothing is visible", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await world(db);
      await actAs(db, null);
      for (const table of [...SPACE_TABLES, "user_profiles", "platform_roles"]) {
        const { rows } = await db.query(`select count(*)::int as n from ${table}`);
        expect([table, rows[0]?.n]).toEqual([table, 0]);
      }
    });
  });

  it("a student reads no draft and no other student's progress", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await actAs(db, w.student);
      for (const table of ["routes", "modules", "lessons", "blocks", "lesson_prerequisites"]) {
        const { rows } = await db.query(`select count(*)::int as n from ${table}`);
        expect([table, rows[0]?.n]).toEqual([table, 0]);
      }
      const versions = await db.query("select count(*)::int as n from route_versions");
      expect(versions.rows[0]?.n).toBe(1);
      for (const table of ["enrollments", "progress", "cards", "reviews"]) {
        const { rows } = await db.query(`select distinct user_id from ${table}`);
        expect([table, rows.map((row) => row.user_id)]).toEqual([table, [w.student]]);
      }
    });
  });

  it("nobody makes themselves owner, by any path", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      for (const who of [w.coeditor, w.student]) {
        await db.query("reset role");
        await actAs(db, who);
        const promoted = await db.query(
          "update memberships set role = 'owner' where user_id = $1",
          [who],
        );
        expect(promoted.rowCount).toBe(0);
        await db.query("savepoint s");
        await expect(
          db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
            w.spaceA,
            who,
          ]),
        ).rejects.toThrow(RLS);
        await db.query("rollback to savepoint s");
        // Joining through enrollment gives the student role, and nothing more.
        const { rows } = await db.query("select * from app.enroll($1)", [w.routes.b]);
        expect(rows[0]?.outcome).toBe("ok");
        const joined = await db.query(
          "select role from memberships where space_id = $1 and user_id = $2",
          [w.spaceB, who],
        );
        expect(joined.rows).toEqual([{ role: "student" }]);
      }
      await db.query("reset role");
      const owners = await db.query(
        "select user_id from memberships where role = 'owner' order by user_id",
      );
      expect(owners.rows.map((row) => row.user_id).sort()).toEqual([w.a, w.b].sort());
    });
  });
});

describe("a pooled connection", () => {
  it("forgets the user at the end of each transaction: the next one, with no set_config, sees nothing", async () => {
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const pooled = new pg.Client({ connectionString: URLS.app });
    await Promise.all([setup.connect(), pooled.connect()]);
    const userId = await newUser(setup);
    const spaceId = await newSpace(setup, "pooled");
    await setup.query(
      "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')",
      [spaceId, userId],
    );
    try {
      await pooled.query("begin");
      await pooled.query("select set_config('app.user_id', $1, true)", [userId]);
      const first = await pooled.query("select id from spaces where id = $1", [spaceId]);
      await pooled.query("commit");
      await pooled.query("begin");
      const second = await pooled.query("select id from spaces where id = $1", [spaceId]);
      await pooled.query("commit");
      expect([first.rowCount, second.rowCount]).toEqual([1, 0]);
    } finally {
      await setup.query("delete from memberships where space_id = $1", [spaceId]);
      await setup.query("delete from spaces where id = $1", [spaceId]);
      await setup.query(`delete from "user" where id = $1`, [userId]);
      await Promise.all([setup.end(), pooled.end()]);
    }
  });
});
