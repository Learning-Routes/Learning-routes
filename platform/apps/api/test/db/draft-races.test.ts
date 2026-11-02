import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { pgRepos } from "../../src/db/repos/index";
import { actAs, backendPid, blockedOrDone, newUser, rolledBack, URLS } from "./connect";
import { newRoute, newSpace, newVersion } from "./fixtures";

// Draft edits on two connections at once (Platform STEP 2 review, item 7): the
// second waits on the first's draft lock, then answers conflict, and the first
// edit is kept.

const module = (position: string) => ({
  id: crypto.randomUUID(),
  position,
  title: { en: `Module ${position}` },
});

describe("two draft edits at once", () => {
  it("lands the first, and answers conflict to the second once it commits", async () => {
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const one = new pg.Client({ connectionString: URLS.migrator });
    const two = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), one.connect(), two.connect()]);
    try {
      const ownerId = await newUser(setup);
      const spaceId = await newSpace(setup, "draft-race");
      await setup.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')",
        [spaceId, ownerId],
      );
      const routeId = await newRoute(setup, spaceId);
      const twoPid = await backendPid(two);
      for (const db of [one, two]) {
        await db.query("begin");
        await actAs(db, ownerId);
      }
      const first = pgRepos(drizzle(one, { casing: "snake_case" }));
      const second = pgRepos(drizzle(two, { casing: "snake_case" }));
      // Both read revision 0.
      expect(await first.routeDrafts.addModule(spaceId, routeId, 0, module("G"))).toEqual({
        ok: true,
        value: { revision: 1 },
      });
      const waiting = second.routeDrafts.addModule(spaceId, routeId, 0, module("V"));
      await blockedOrDone(twoPid, waiting);
      await one.query("commit");
      expect(await waiting).toEqual({ ok: false, error: "conflict" });
      await two.query("commit");
      const { rows } = await setup.query(
        "select position from modules where route_id = $1 order by position",
        [routeId],
      );
      expect(rows).toEqual([{ position: "G" }]);
    } finally {
      await Promise.all([setup.end(), one.end(), two.end()]);
    }
  });
});

describe("a stored version core cannot read", () => {
  it("answers invalid instead of throwing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const ownerId = await newUser(db);
      const spaceId = await newSpace(db, "bad-snapshot");
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        spaceId,
        ownerId,
      ]);
      const routeId = await newRoute(db, spaceId);
      await newVersion(db, spaceId, routeId, 1);
      await actAs(db, ownerId);
      const repos = pgRepos(drizzle(db, { casing: "snake_case" }));
      expect(await repos.routeVersions.get(spaceId, routeId, 1)).toEqual({
        ok: false,
        error: "invalid",
      });
      // The transaction is still usable.
      expect((await repos.routeDrafts.get(spaceId, routeId)).ok).toBe(true);
    });
  });
});
