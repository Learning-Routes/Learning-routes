import { defineAction, runAction } from "@learning-routes/core/actions/define";
import { ACTION_NAMES } from "@learning-routes/core/actions/names";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// The two-tenant test through the actions (Platform STEP 2 §3.9): A calls every
// registered action with B's resource ids, and gets not_found, under lr_app's
// row-level security, with core's checks in place. §6 adds each new action here.

const REVIEW_ID = "0192d3a0-0000-7000-8000-0000000000c1";

/**
 * The rows of the given spaces and users in every table that has them, read as the
 * migrator. Only theirs: other test files commit rows while this one runs.
 */
async function everyTable(db: pg.Client, spaces: string[], users: string[]) {
  const { rows } = await db.query(
    `select table_name, bool_or(column_name = 'space_id') as by_space
       from information_schema.columns
      where table_schema = 'public' and column_name in ('space_id', 'user_id')
      group by table_name order by 1`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name: table, by_space: bySpace } of rows) {
    const [column, ids] = bySpace ? ["space_id", spaces] : ["user_id", users];
    counts[table] = (
      await db.query(`select count(*)::int as n from "${table}" where ${column} = any($1)`, [ids])
    ).rows[0]?.n;
  }
  counts.spaces = (
    await db.query("select count(*)::int as n from spaces where id = any($1)", [spaces])
  ).rows[0]?.n;
  return counts;
}

describe("two tenants, through every action", () => {
  it("answers not_found to A for every registered action with B's ids, and changes nothing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const spaceA = await newSpace(db, "space-a");
      const spaceB = await newSpace(db, "space-b");
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner')",
        [spaceA, a, spaceB, b],
      );
      const routeB = await newRoute(db, spaceB, "b-route");
      const paidB = await newRoute(db, spaceB, "b-paid");
      await db.query("update routes set pricing = 'paid' where id = $1", [paidB]);
      for (const route of [routeB, paidB]) {
        await newVersion(db, spaceB, route, 1);
        await db.query("update routes set latest_published_version = 1 where id = $1", [route]);
      }
      const { rows: modules } = await db.query(
        `insert into modules (space_id, route_id, position, title) values ($1, $2, 'V', '{"en": "M"}') returning id`,
        [spaceB, routeB],
      );
      const { rows: lessons } = await db.query(
        `insert into lessons (space_id, route_id, module_id, position, title) values ($1, $2, $3, 'V', '{"en": "L"}') returning id`,
        [spaceB, routeB, modules[0]?.id],
      );
      const enrollmentB = await newEnrollment(db, spaceB, routeB, b);
      const inputs: Record<string, unknown> = {
        "space.get": { spaceId: spaceB },
        "membership.add": { spaceId: spaceB, userId: a, role: "owner" },
        "route.create": {
          spaceId: spaceB,
          slug: "stolen",
          title: { en: "S" },
          sourceLocale: "en",
          access: "open",
          pricing: "free",
        },
        "route.get": { routeId: routeB },
        "route.list": { spaceId: spaceB },
        "module.add": { routeId: routeB, expectedRevision: 0, title: { en: "M" } },
        "lesson.add": {
          routeId: routeB,
          moduleId: modules[0]?.id,
          expectedRevision: 0,
          title: { en: "L" },
        },
        "block.add": {
          routeId: routeB,
          lessonId: lessons[0]?.id,
          expectedRevision: 0,
          block: { type: "concept", title: { en: "T" }, body: { en: "B" } },
        },
        "route.publish": { routeId: routeB, expectedRevision: 0 },
        // A paid route in a space A cannot see.
        "enrollment.create": { routeId: paidB },
        "enrollment.upgrade": { enrollmentId: enrollmentB },
        "review.submit": {
          enrollmentId: enrollmentB,
          reviewId: REVIEW_ID,
          itemId: crypto.randomUUID(),
          rating: 3,
          at: 0,
          elapsedMs: 900,
        },
      };
      expect(Object.keys(inputs).sort()).toEqual([...ACTION_NAMES].sort());

      const before = await everyTable(db, [spaceA, spaceB], [a, b]);
      await actAs(db, a);
      const orm = drizzle(db, { casing: "snake_case" });
      const ctx = {
        actor: { via: "ui" as const, userId: a },
        repos: pgRepos(orm),
        tenancy: pgTenancy(orm),
        clock: { now: () => Date.now() },
        ids: { newId: () => crypto.randomUUID() },
      };
      for (const name of ACTION_NAMES) {
        const result = await runAction(ACTIONS, name, inputs[name], ctx);
        expect([name, result]).toEqual([
          name,
          { ok: false, code: "not_found", message: expect.any(String) },
        ]);
      }
      await db.query("reset role");
      expect(await everyTable(db, [spaceA, spaceB], [a, b])).toEqual(before);
    });
  });

  it("review.submit: A naming B's enrollment gets not_found, and nothing is written", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const spaceA = await newSpace(db, "space-a");
      const spaceB = await newSpace(db, "space-b");
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner')",
        [spaceA, a, spaceB, b],
      );
      const routeB = await newRoute(db, spaceB);
      await newVersion(db, spaceB, routeB, 1);
      const enrollmentB = await newEnrollment(db, spaceB, routeB, b);

      await actAs(db, a);
      const writes: string[] = [];
      const repos = pgRepos(drizzle(db, { casing: "snake_case" }));
      const ctx = {
        actor: { via: "ui" as const, userId: a },
        repos,
        tenancy: pgTenancy(drizzle(db, { casing: "snake_case" })),
        clock: { now: () => Date.now() },
        ids: { newId: () => crypto.randomUUID() },
      };
      const input = {
        enrollmentId: enrollmentB,
        reviewId: REVIEW_ID,
        itemId: crypto.randomUUID(),
        rating: 3,
        at: 0,
        elapsedMs: 900,
      };
      expect(await runAction(ACTIONS, "review.submit", input, ctx)).toEqual({
        ok: false,
        code: "not_found",
        message: "not found",
      });
      await db.query("reset role");
      const written = await db.query(
        "select count(*)::int as n from reviews where review_id = $1",
        [REVIEW_ID],
      );
      expect(written.rows[0]?.n).toBe(0);
      await actAs(db, a);

      // Naming their own space with B's row: an action that takes a spaceId, so the
      // input passes and runAction's space check is what refuses it.
      const touch = defineAction({
        name: "test.touch",
        kind: "mutation",
        description: "Names a space and an enrollment.",
        input: z.object({ spaceId: z.uuid(), enrollmentId: z.uuid() }),
        target: (given) => ({ kind: "enrollment", id: given.enrollmentId }),
        run: async () => {
          writes.push("touched");
        },
      });
      const allowAll = () => true;
      const registry = { "test.touch": touch };
      expect(
        await runAction(
          registry,
          "test.touch",
          { spaceId: spaceA, enrollmentId: enrollmentB },
          ctx,
          allowAll,
        ),
      ).toEqual({ ok: false, code: "not_found", message: "not found" });
      expect(
        await runAction(
          registry,
          "test.touch",
          { spaceId: spaceB, enrollmentId: enrollmentB },
          ctx,
          allowAll,
        ),
      ).toEqual({ ok: false, code: "not_found", message: "not found" });
      expect(writes).toEqual([]);
    });
  });

  it("finds the space and role for a row the actor may see", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const owner = await newUser(db);
      const space = await newSpace(db, "space-a");
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        owner,
      ]);
      const route = await newRoute(db, space);
      await actAs(db, owner);
      const tenancy = pgTenancy(drizzle(db, { casing: "snake_case" }));
      expect(await tenancy.scopeOf({ kind: "route", id: route }, owner)).toEqual({
        spaceId: space,
        role: "owner",
      });
      expect(await tenancy.scopeOf({ kind: "space", id: space }, owner)).toEqual({
        spaceId: space,
        role: "owner",
      });
      expect(await tenancy.scopeOf({ kind: "route", id: crypto.randomUUID() }, owner)).toBeNull();
      expect(await tenancy.scopeOf({ kind: "route", id: "not-a-uuid" }, owner)).toBeNull();
    });
  });

  it("finds a published route's space for its students, who cannot see the draft", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const student = await newUser(db);
      const space = await newSpace(db, "space-a");
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
        [space, student],
      );
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      await actAs(db, student);
      const tenancy = pgTenancy(drizzle(db, { casing: "snake_case" }));
      expect(await tenancy.scopeOf({ kind: "route", id: route }, student)).toEqual({
        spaceId: space,
        role: "student",
      });
    });
  });
});
