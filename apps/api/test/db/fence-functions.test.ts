import type pg from "pg";
import { describe, expect, it } from "vitest";
import { actAs, attempt, newUser, query, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// What lr_app may not do directly goes through security definer functions that
// check the acting user themselves (Platform STEP 2 review, items 1 to 3).

const OWNER_ONLY = /only an owner/;

/** A space with an owner, a coeditor, an assistant and a student, and one published route. */
async function world(db: pg.Client) {
  const space = await newSpace(db, "fence");
  const route = await newRoute(db, space);
  await newVersion(db, space, route, 1);
  await db.query("update routes set latest_published_version = 1 where id = $1", [route]);
  const people: Record<string, string> = {};
  for (const role of ["owner", "coeditor", "assistant", "student"]) {
    people[role] = await newUser(db);
    await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, $3)", [
      space,
      people[role],
      role,
    ]);
  }
  const enrollment = await newEnrollment(db, space, route, people.student as string);
  return {
    space,
    route,
    enrollment,
    ...(people as Record<"owner" | "coeditor" | "assistant" | "student", string>),
  };
}

/** Runs one call as the user, under lr_app, and returns the first column of its row. */
async function as(db: pg.Client, userId: string, sql: string, values: unknown[]) {
  await db.query("reset role");
  await actAs(db, userId);
  const { rows } = await db.query(sql, values);
  await db.query("reset role");
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

describe("the security definer functions", () => {
  it("are hardened like app.member_space_ids, and lr_app may call each", async () => {
    const rows = await query(
      URLS.migrator,
      `select p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
              has_function_privilege('lr_app', p.oid, 'execute') as app,
              has_function_privilege('public', p.oid, 'execute') as everyone
         from pg_proc p
        where p.pronamespace = 'app'::regnamespace and p.prosecdef
        order by p.proname`,
    );
    const callable = [
      "accept_invitation",
      "bump_draft",
      "create_space",
      "enroll",
      "invitation_state",
      "invite_applicant",
      "is_operator",
      "mark_published",
      "member_space_ids",
      "set_enrollment_status",
      "upgrade_enrollment",
    ];
    expect(rows.map((row: { proname: string }) => row.proname)).toEqual([
      ...callable.slice(0, 7),
      "keep_an_owner",
      ...callable.slice(7),
    ]);
    for (const row of rows) {
      expect(row).toEqual({
        proname: row.proname,
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, public"],
        owner: "lr_migrator",
        app: callable.includes(row.proname),
        everyone: false,
      });
    }
  });

  it("app.upgrade_enrollment moves only the caller's own active enrollment, forward", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await newVersion(db, w.space, w.route, 2);
      await db.query("update routes set latest_published_version = 2 where id = $1", [w.route]);
      const upgrade = "select app.upgrade_enrollment($1) as pinned";
      expect(await as(db, w.owner, upgrade, [w.enrollment])).toBeNull();
      expect(await as(db, w.student, upgrade, [w.enrollment])).toBe(2);
      expect(await as(db, w.student, upgrade, [w.enrollment])).toBe(2);
      await db.query("update enrollments set status = 'revoked' where id = $1", [w.enrollment]);
      expect(await as(db, w.student, upgrade, [w.enrollment])).toBeNull();
    });
  });

  it("app.set_enrollment_status is an owner's, in their own space", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const revoke = "select app.set_enrollment_status($1, 'revoked') as done";
      for (const who of [w.student, w.coeditor, w.assistant]) {
        expect(await as(db, who, revoke, [w.enrollment])).toBe(false);
      }
      expect(await as(db, w.owner, revoke, [w.enrollment])).toBe(true);
      const { rows } = await db.query("select status from enrollments where id = $1", [
        w.enrollment,
      ]);
      expect(rows).toEqual([{ status: "revoked" }]);
      const other = await world(db);
      expect(await as(db, w.owner, revoke, [other.enrollment])).toBe(false);
    });
  });

  it("app.bump_draft moves the revision an editor read, and nothing else", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const bump = "select app.bump_draft($1, $2, $3) as revision";
      expect(await as(db, w.coeditor, bump, [w.route, w.space, 0])).toBe("1");
      expect(await as(db, w.coeditor, bump, [w.route, w.space, 0])).toBeNull();
      expect(await as(db, w.assistant, bump, [w.route, w.space, 1])).toBeNull();
      expect(await as(db, w.owner, bump, [w.route, w.space, 1])).toBe("2");
      const other = await world(db);
      expect(await as(db, w.owner, bump, [other.route, other.space, 0])).toBeNull();
      expect(await as(db, w.owner, bump, [w.route, other.space, 2])).toBeNull();
    });
  });

  it("app.mark_published needs the version, moves forward, and skips an archived route", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const mark = "select app.mark_published($1, $2, $3) as done";
      expect(await as(db, w.coeditor, mark, [w.route, w.space, 2])).toBe(false);
      await newVersion(db, w.space, w.route, 2);
      expect(await as(db, w.student, mark, [w.route, w.space, 2])).toBe(false);
      expect(await as(db, w.coeditor, mark, [w.route, w.space, 2])).toBe(true);
      expect(await as(db, w.coeditor, mark, [w.route, w.space, 1])).toBe(false);
      await newVersion(db, w.space, w.route, 3);
      await db.query("update routes set archived_at = now() where id = $1", [w.route]);
      expect(await as(db, w.owner, mark, [w.route, w.space, 3])).toBe(false);
    });
  });
});

describe("pricing and access are an owner's", () => {
  it("refuses a coeditor who changes them, or creates a paid route", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await actAs(db, w.coeditor);
      for (const change of ["pricing = 'paid'", "access = 'closed'"]) {
        expect(await attempt(db, `update routes set ${change} where id = $1`, [w.route])).toMatch(
          OWNER_ONLY,
        );
      }
      expect(
        await attempt(db, `update routes set title = '{"en": "New"}' where id = $1`, [w.route]),
      ).toBeNull();
      const create = `insert into routes (space_id, slug, title, source_locale, access, pricing)
                      values ($1, $2, '{"en": "R"}', 'en', 'open', $3)`;
      expect(await attempt(db, create, [w.space, "paid-one", "paid"])).toMatch(OWNER_ONLY);
      expect(await attempt(db, create, [w.space, "free-one", "free"])).toBeNull();
      await db.query("reset role");
      await actAs(db, w.owner);
      expect(
        await attempt(db, "update routes set pricing = 'paid', access = 'closed' where id = $1", [
          w.route,
        ]),
      ).toBeNull();
      expect(await attempt(db, create, [w.space, "owners-paid", "paid"])).toBeNull();
    });
  });
});

describe("route_versions reads", () => {
  it("staff read every version in the space; a student only their active enrollments' routes", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const unenrolled = await newRoute(db, w.space, "not-enrolled");
      await newVersion(db, w.space, unenrolled, 1);
      const count = "select count(*)::int as n from route_versions where space_id = $1";
      for (const who of [w.owner, w.coeditor, w.assistant]) {
        expect(await as(db, who, count, [w.space])).toBe(2);
      }
      expect(await as(db, w.student, count, [w.space])).toBe(1);
      await db.query("update enrollments set status = 'revoked' where id = $1", [w.enrollment]);
      expect(await as(db, w.student, count, [w.space])).toBe(0);
    });
  });
});

describe("app.enroll", () => {
  it("leaves no membership behind when it refuses a removed, revoked student", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await db.query("update enrollments set status = 'revoked' where id = $1", [w.enrollment]);
      await db.query("delete from memberships where user_id = $1", [w.student]);
      const enroll = "select outcome from app.enroll($1)";
      expect(await as(db, w.student, enroll, [w.route])).toBe("invalid");
      const { rows } = await db.query("select role from memberships where user_id = $1", [
        w.student,
      ]);
      expect(rows).toEqual([]);
    });
  });

  it("answers not_found for a route in an archived space", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await db.query("update spaces set archived_at = now() where id = $1", [w.space]);
      expect(await as(db, await newUser(db), "select outcome from app.enroll($1)", [w.route])).toBe(
        "not_found",
      );
    });
  });
});
