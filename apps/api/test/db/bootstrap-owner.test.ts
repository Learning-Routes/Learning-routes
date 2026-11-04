import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapOwner } from "../../scripts/bootstrap-owner";
import { URLS } from "./connect";

// The production one-off (Platform STEP 7 §5), against the local database.

describe("bootstrapping the owner", () => {
  let db: pg.Client;
  const owner = () => {
    const tag = crypto.randomUUID().slice(0, 8);
    return {
      email: `Owner-${tag}@example.com`,
      name: "Mi espacio",
      slug: `espacio-${tag}`,
      locale: "es",
    };
  };
  beforeEach(async () => {
    db = new pg.Client({ connectionString: URLS.migrator });
    await db.connect();
  });
  afterEach(() => db.end());

  const state = async (email: string, slug: string) => {
    const { rows } = await db.query(
      `select u.email, u.email_verified, r.is_operator, m.role, s.name
         from "user" u
         join platform_roles r on r.user_id = u.id
         join memberships m on m.user_id = u.id
         join spaces s on s.id = m.space_id
        where u.email = lower($1) and s.slug = $2`,
      [email, slug],
    );
    return rows;
  };

  it("works for an account that doesn't exist yet", async () => {
    const who = owner();
    expect(await bootstrapOwner(db, who)).toEqual({ spaceCreated: true });
    expect(await state(who.email, who.slug)).toEqual([
      expect.objectContaining({
        email: who.email.toLowerCase(),
        email_verified: true,
        is_operator: true,
        role: "owner",
        name: { es: "Mi espacio" },
      }),
    ]);
  });

  it("changes nothing when it runs again", async () => {
    const who = owner();
    await bootstrapOwner(db, who);
    expect(await bootstrapOwner(db, who)).toEqual({ spaceCreated: false });
    expect(await state(who.email, who.slug)).toHaveLength(1);
  });

  it("leaves nothing behind when a slug is refused", async () => {
    const who = { ...owner(), slug: "app" };
    await expect(bootstrapOwner(db, who)).rejects.toThrow();
    const { rows } = await db.query(`select 1 from "user" where email = lower($1)`, [who.email]);
    expect(rows).toEqual([]);
  });
});
