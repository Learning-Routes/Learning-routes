import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, newUser, rolledBack, URLS } from "./connect";

// space.create on Postgres (Platform STEP 5 §1): a security definer function does the
// insert, so lr_app gets no INSERT on spaces and no way to add a membership elsewhere.

const REFUSED = /permission denied/;

function as(db: pg.Client, userId: string) {
  return async (input: unknown) => {
    await db.query("reset role");
    await actAs(db, userId);
    const orm = drizzle(db, { casing: "snake_case" });
    return runAction(ACTIONS, "space.create", input, {
      actor: { via: "ui", userId },
      repos: pgRepos(orm),
      tenancy: pgTenancy(orm),
      clock: { now: () => Date.UTC(2026, 10, 3) },
      ids: { newId: () => crypto.randomUUID() },
    });
  };
}

async function people(db: pg.Client) {
  const operatorId = await newUser(db);
  await db.query("insert into platform_roles (user_id, is_operator) values ($1, true)", [
    operatorId,
  ]);
  const ownerId = await newUser(db);
  await db.query(`update "user" set email_verified = true where id = $1`, [ownerId]);
  const { rows } = await db.query<{ email: string }>(`select email from "user" where id = $1`, [
    ownerId,
  ]);
  return { operatorId, ownerId, ownerEmail: rows[0]?.email as string };
}

const slug = () => `prueba-${crypto.randomUUID()}`;

describe("space.create, on Postgres", () => {
  it("makes the space and its owner in one transaction, and logs it", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { operatorId, ownerId, ownerEmail } = await people(db);
      const wanted = slug();
      const made = await as(
        db,
        operatorId,
      )({
        name: "Ana Prueba",
        slug: wanted,
        ownerEmail: ownerEmail.toUpperCase(),
        locale: "es",
      });
      expect(made).toMatchObject({ ok: true, output: { slug: wanted } });
      await db.query("reset role");
      const { rows } = await db.query(
        `select s.name, s.default_locale, s.locales, m.user_id, m.role
           from spaces s join memberships m on m.space_id = s.id where s.slug = $1`,
        [wanted],
      );
      expect(rows).toEqual([
        {
          name: { es: "Ana Prueba" },
          default_locale: "es",
          locales: ["es"],
          user_id: ownerId,
          role: "owner",
        },
      ]);
      const log = await db.query(
        "select actor_user_id, outcome from action_log where action = 'space.create' and actor_user_id = $1",
        [operatorId],
      );
      expect(log.rows).toEqual([{ actor_user_id: operatorId, outcome: "ok" }]);
    });
  });

  it("refuses an account that has never signed in, and writes no space", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { operatorId } = await people(db);
      const notVerified = await newUser(db);
      const { rows } = await db.query<{ email: string }>(`select email from "user" where id = $1`, [
        notVerified,
      ]);
      const wanted = slug();
      for (const ownerEmail of [rows[0]?.email, "nadie-todavia@example.com"]) {
        expect(
          await as(db, operatorId)({ name: "N", slug: wanted, ownerEmail, locale: "es" }),
        ).toMatchObject({ ok: false, code: "invalid" });
      }
      await db.query("reset role");
      expect((await db.query("select 1 from spaces where slug = $1", [wanted])).rows).toEqual([]);
    });
  });

  it("refuses a slug that is taken", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { operatorId, ownerEmail } = await people(db);
      const wanted = slug();
      const input = { name: "N", slug: wanted, ownerEmail, locale: "es" };
      await as(db, operatorId)(input);
      expect(await as(db, operatorId)(input)).toMatchObject({ ok: false, code: "conflict" });
    });
  });

  it("the function refuses anyone but an operator, even called directly", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { ownerId, ownerEmail } = await people(db);
      await actAs(db, ownerId);
      const { rows } = await db.query(
        `select outcome, space_id from app.create_space($1, '{"es": "N"}', 'es', $2)`,
        [slug(), ownerEmail],
      );
      expect(rows).toEqual([{ outcome: "not_found", space_id: null }]);
    });
  });

  it("lr_app still cannot insert a space itself", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { operatorId } = await people(db);
      await actAs(db, operatorId);
      await expect(
        db.query(
          `insert into spaces (slug, name, default_locale, locales) values ($1, '{"es": "N"}', 'es', '{es}')`,
          [slug()],
        ),
      ).rejects.toThrow(REFUSED);
    });
  });
});
