import type pg from "pg";
import { describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import { rolledBack, URLS } from "./connect";

// pnpm db:seed --owner <email> (Platform STEP 2 §6): English Unlimited, its
// locales and one sample route, for an owner who has signed in once.

async function signedUpUser(db: pg.Client, verified = true) {
  const email = `owner-${crypto.randomUUID()}@example.com`;
  const { rows } = await db.query(
    `insert into "user" (name, email, email_verified) values ('Owner', $1, $2) returning id`,
    [email, verified],
  );
  return { email, id: rows[0]?.id as string };
}

const counts = async (db: pg.Client) =>
  (
    await db.query(
      `select (select count(*) from spaces where slug = 'english-unlimited')::int as spaces,
              (select count(*) from memberships m join spaces s on s.id = m.space_id where s.slug = 'english-unlimited')::int as members,
              (select count(*) from routes r join spaces s on s.id = r.space_id where s.slug = 'english-unlimited')::int as routes,
              (select count(*) from route_versions v join spaces s on s.id = v.space_id where s.slug = 'english-unlimited')::int as versions`,
    )
  ).rows[0];

describe("the seed", () => {
  it("refuses an address with no user, or one not yet verified: the owner signs in first", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await db.query(
        "delete from memberships where space_id in (select id from spaces where slug = 'english-unlimited')",
      );
      await expect(seed(db, { ownerEmail: "nobody@example.com" })).rejects.toThrow(
        "no verified user",
      );
      const unverified = await signedUpUser(db, false);
      await expect(seed(db, { ownerEmail: unverified.email })).rejects.toThrow("no verified user");
    });
  });

  it("creates the space, its owner and a published sample route, and a second run changes nothing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await clear(db);
      const owner = await signedUpUser(db);
      await seed(db, { ownerEmail: owner.email.toUpperCase() });
      const first = await counts(db);
      expect(first).toEqual({ spaces: 1, members: 1, routes: 1, versions: 1 });
      const { rows } = await db.query(
        `select s.default_locale, s.locales, m.role from spaces s join memberships m on m.space_id = s.id
          where s.slug = 'english-unlimited'`,
      );
      expect(rows).toEqual([{ default_locale: "es", locales: ["es", "en"], role: "owner" }]);
      await seed(db, { ownerEmail: owner.email });
      expect(await counts(db)).toEqual(first);
    });
  });

  it("refuses a second owner unless --add-owner is given", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await clear(db);
      const first = await signedUpUser(db);
      const second = await signedUpUser(db);
      await seed(db, { ownerEmail: first.email });
      await expect(seed(db, { ownerEmail: second.email })).rejects.toThrow("--add-owner");
      await seed(db, { ownerEmail: second.email, addOwner: true });
      expect((await counts(db))?.members).toBe(2);
    });
  });
});

/** The seed's space may exist from an earlier run; each test starts without it. */
async function clear(db: pg.Client) {
  await db.query("alter table route_versions disable trigger route_versions_append_only");
  await db.query("alter table action_log disable trigger action_log_append_only");
  for (const table of [
    "action_log",
    "blocks",
    "lessons",
    "modules",
    "route_versions",
    "routes",
    "memberships",
  ]) {
    await db.query(
      `delete from ${table} where space_id in (select id from spaces where slug = 'english-unlimited')`,
    );
  }
  await db.query("delete from spaces where slug = 'english-unlimited'");
  await db.query("alter table route_versions enable trigger route_versions_append_only");
  await db.query("alter table action_log enable trigger action_log_append_only");
}
