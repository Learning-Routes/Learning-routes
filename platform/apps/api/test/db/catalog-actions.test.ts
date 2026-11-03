import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { newBlockId } from "@learning-routes/core/ids";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newSpace } from "./fixtures";

// The catalog's actions on Postgres (Platform STEP 4 §3.1), each actor under their own
// row-level security.

function as(db: pg.Client, userId: string) {
  return async (name: string, input: unknown) => {
    await db.query("reset role");
    await actAs(db, userId);
    const orm = drizzle(db, { casing: "snake_case" });
    return runAction(ACTIONS, name, input, {
      actor: { via: "ui", userId },
      repos: pgRepos(orm),
      tenancy: pgTenancy(orm),
      clock: { now: () => Date.UTC(2026, 10, 2) },
      ids: { newId: () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10))) },
    });
  };
}

async function publishedRoute(owner: ReturnType<typeof as>, spaceId: string) {
  const created = await owner("route.create", {
    spaceId,
    slug: "listed",
    title: { en: "Listed" },
    sourceLocale: "en",
    access: "open",
    pricing: "free",
  });
  const { routeId, revision } = (created as { output: { routeId: string; revision: number } })
    .output;
  const added = await owner("module.add", {
    routeId,
    expectedRevision: revision,
    title: { en: "One" },
  });
  const after = (added as { output: { revision: number } }).output.revision;
  await owner("route.publish", { routeId, expectedRevision: after });
  return routeId;
}

describe("the catalog's actions, on Postgres", () => {
  it("an owner asks, an operator approves, and the log keeps both", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const ownerId = await newUser(db);
      const operatorId = await newUser(db);
      const spaceId = await newSpace(db, "catalog-actions");
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        spaceId,
        ownerId,
      ]);
      await db.query("insert into platform_roles (user_id, is_operator) values ($1, true)", [
        operatorId,
      ]);
      const owner = as(db, ownerId);
      const routeId = await publishedRoute(owner, spaceId);
      const asked = await owner("catalog.request", { routeId });
      expect(asked).toMatchObject({ ok: true, output: { status: "requested" } });
      const { listingId } = (asked as { output: { listingId: string } }).output;

      // Its owner cannot approve it: to them the action does not exist.
      expect(await owner("catalog.decide", { listingId, decision: "approve" })).toMatchObject({
        ok: false,
        code: "not_found",
      });

      const decided = await as(db, operatorId)("catalog.decide", {
        listingId,
        decision: "approve",
      });
      expect(decided).toMatchObject({ ok: true, output: { status: "approved", spaceId, routeId } });

      await db.query("reset role");
      const { rows } = await db.query(
        "select status, decided_by, decided_version from catalog_listings where id = $1",
        [listingId],
      );
      expect(rows[0]).toEqual({ status: "approved", decided_by: operatorId, decided_version: 1 });
      const log = await db.query(
        "select action, actor_user_id, outcome from action_log where space_id = $1 and action like 'catalog.%' order by at, action",
        [spaceId],
      );
      expect(log.rows).toEqual(
        expect.arrayContaining([
          { action: "catalog.request", actor_user_id: ownerId, outcome: "ok" },
          { action: "catalog.decide", actor_user_id: operatorId, outcome: "ok" },
        ]),
      );
    });
  });
});
