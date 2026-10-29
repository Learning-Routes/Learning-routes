import { describe, expect, it } from "vitest";
import { attempt, newUser, rolledBack, URLS } from "./connect";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHECK = /violates check constraint/;
const UNIQUE = /duplicate key value violates unique constraint/;
const DUPLICATE = /duplicate key/;
const NOT_JSON_OR_CHECK = /invalid input syntax for type json|check constraint/i;

const SPACE = `insert into spaces (slug, name, default_locale, locales) values ($1, $2, $3, $4) returning id`;
const space = (slug: string) => [slug, { en: "English Unlimited" }, "en", ["en", "es"]];

describe("the tenancy tables (Platform STEP 2 §2.2–§2.5)", () => {
  it("user_profiles: one per user, the learner's day in UTC unless set, erased with the user", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const userId = await newUser(db);
      const { rows } = await db.query(
        "insert into user_profiles (user_id, display_name, ui_locale) values ($1, 'Ana', 'es') returning time_zone",
        [userId],
      );
      expect(rows).toEqual([{ time_zone: "UTC" }]);
      expect(
        await attempt(db, "insert into user_profiles (user_id) values ($1)", [userId]),
      ).toMatch(DUPLICATE);
      await db.query(`delete from "user" where id = $1`, [userId]);
      const left = await db.query("select 1 from user_profiles where user_id = $1", [userId]);
      expect(left.rowCount).toBe(0);
    });
  });

  it("user_profiles: a time zone Postgres knows, or the insert is refused", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const add = "insert into user_profiles (user_id, time_zone) values ($1, $2)";
      expect(await attempt(db, add, [await newUser(db), "America/Mexico_City"])).toBeNull();
      expect(await attempt(db, add, [await newUser(db), "Mars/Olympus"])).toMatch(CHECK);
    });
  });

  it("spaces: a uuidv7 id, a unique slug, a localized name, and a default among its locales", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { rows } = await db.query(SPACE, space("english-unlimited"));
      expect(rows[0]?.id).toMatch(UUID_V7);
      expect(await attempt(db, SPACE, space("english-unlimited"))).toMatch(UNIQUE);
      expect(await attempt(db, SPACE, ["a", "English", "en", ["en"]])).toMatch(NOT_JSON_OR_CHECK);
      expect(await attempt(db, SPACE, ["b", { de: "Englisch" }, "en", ["en"]])).toMatch(CHECK);
      expect(await attempt(db, SPACE, ["c", { en: "English" }, "de", ["en", "de"]])).toMatch(CHECK);
      expect(await attempt(db, SPACE, ["d", { en: "English" }, "es", ["en"]])).toMatch(CHECK);
    });
  });

  it("memberships: one role per user and space, from four", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const userId = await newUser(db);
      const { rows } = await db.query(SPACE, space("memberships-test"));
      const spaceId = rows[0]?.id;
      const add = "insert into memberships (space_id, user_id, role) values ($1, $2, $3)";
      expect(await attempt(db, add, [spaceId, userId, "owner"])).toBeNull();
      expect(await attempt(db, add, [spaceId, userId, "student"])).toMatch(UNIQUE);
      expect(await attempt(db, add, [spaceId, await newUser(db), "admin"])).toMatch(CHECK);
      const index = await db.query(
        "select indexdef from pg_indexes where tablename = 'memberships' and indexdef like '%(user_id, space_id)%'",
      );
      expect(index.rowCount).toBe(1);
    });
  });

  it("platform_roles: a user's operator flag, false unless set", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const userId = await newUser(db);
      const { rows } = await db.query(
        "insert into platform_roles (user_id) values ($1) returning is_operator",
        [userId],
      );
      expect(rows).toEqual([{ is_operator: false }]);
    });
  });
});
