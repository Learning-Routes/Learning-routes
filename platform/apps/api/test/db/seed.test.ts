import type pg from "pg";
import { describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import { rolledBack, URLS } from "./connect";

// pnpm db:seed --owner <email> (Platform STEP 2 §6): English Unlimited, its
// locales and one sample route, for an owner who has signed in once. Each test
// seeds a space of its own slug, so tests never meet one another's rows.

async function signedUpUser(db: pg.Client, verified = true) {
  const email = `owner-${crypto.randomUUID()}@example.com`;
  const { rows } = await db.query(
    `insert into "user" (name, email, email_verified) values ('Owner', $1, $2) returning id`,
    [email, verified],
  );
  return { email, id: rows[0]?.id as string };
}

const freshSlug = () => `english-unlimited-${crypto.randomUUID()}`;

const counts = async (db: pg.Client, slug: string) =>
  (
    await db.query(
      `select (select count(*) from spaces where slug = $1)::int as spaces,
              (select count(*) from memberships m join spaces s on s.id = m.space_id where s.slug = $1)::int as members,
              (select count(*) from routes r join spaces s on s.id = r.space_id where s.slug = $1)::int as routes,
              (select count(*) from route_versions v join spaces s on s.id = v.space_id where s.slug = $1)::int as versions`,
      [slug],
    )
  ).rows[0];

describe("the seed", () => {
  it("refuses an address with no user, or one not yet verified: the owner signs in first", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceSlug = freshSlug();
      await expect(seed(db, { ownerEmail: "nobody@example.com", spaceSlug })).rejects.toThrow(
        "no verified user",
      );
      const unverified = await signedUpUser(db, false);
      await expect(seed(db, { ownerEmail: unverified.email, spaceSlug })).rejects.toThrow(
        "no verified user",
      );
    });
  });

  it("creates the space, its owner and a published sample route, and a second run changes nothing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceSlug = freshSlug();
      const owner = await signedUpUser(db);
      await seed(db, { ownerEmail: owner.email.toUpperCase(), spaceSlug });
      const first = await counts(db, spaceSlug);
      expect(first).toEqual({ spaces: 1, members: 1, routes: 1, versions: 1 });
      const { rows } = await db.query(
        `select s.default_locale, s.locales, m.role from spaces s join memberships m on m.space_id = s.id
          where s.slug = $1`,
        [spaceSlug],
      );
      expect(rows).toEqual([{ default_locale: "es", locales: ["es", "en"], role: "owner" }]);
      await seed(db, { ownerEmail: owner.email, spaceSlug });
      expect(await counts(db, spaceSlug)).toEqual(first);
    });
  });

  it("refuses a second owner unless --add-owner is given", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceSlug = freshSlug();
      const first = await signedUpUser(db);
      const second = await signedUpUser(db);
      await seed(db, { ownerEmail: first.email, spaceSlug });
      await expect(seed(db, { ownerEmail: second.email, spaceSlug })).rejects.toThrow(
        "--add-owner",
      );
      await seed(db, { ownerEmail: second.email, addOwner: true, spaceSlug });
      expect((await counts(db, spaceSlug))?.members).toBe(2);
    });
  });
});
