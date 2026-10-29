import type pg from "pg";
import { describe, expect, it } from "vitest";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newRoute, newSpace, newVersion } from "./fixtures";

// app.enroll, the only way to become a student (Platform STEP 2 §3.8).

async function published(
  db: pg.Client,
  spaceId: string,
  slug: string,
  pricing = "free",
  versions = 1,
) {
  const route = await newRoute(db, spaceId, slug);
  for (let version = 1; version <= versions; version++) {
    await newVersion(db, spaceId, route, version);
  }
  await db.query("update routes set pricing = $2, latest_published_version = $3 where id = $1", [
    route,
    pricing,
    versions,
  ]);
  return route;
}

const enroll = async (db: pg.Client, routeId: string) =>
  (await db.query("select outcome, enrollment_id from app.enroll($1)", [routeId])).rows[0];

describe("app.enroll", () => {
  it("makes the caller a student, pinned to the latest published version, once", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "enroll");
      const route = await published(db, space, "free", "free", 2);
      const learner = await newUser(db);
      await actAs(db, learner);
      const first = await enroll(db, route);
      const again = await enroll(db, route);
      expect(first.outcome).toBe("ok");
      expect(again).toEqual(first);
      const { rows } = await db.query(
        "select pinned_version, status from enrollments where id = $1",
        [first.enrollment_id],
      );
      expect(rows).toEqual([{ pinned_version: 2, status: "active" }]);
    });
  });

  it("answers invalid for a revoked enrollment, rather than handing it back as ok", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "enroll");
      const route = await published(db, space, "free");
      const learner = await newUser(db);
      await actAs(db, learner);
      const { enrollment_id } = await enroll(db, route);
      await db.query("reset role");
      await db.query("update enrollments set status = 'revoked' where id = $1", [enrollment_id]);
      await actAs(db, learner);
      expect(await enroll(db, route)).toEqual({ outcome: "invalid", enrollment_id: null });
    });
  });

  it("keeps a member's role: an owner who enrolls stays owner", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "enroll");
      const route = await published(db, space, "free");
      const owner = await newUser(db);
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        space,
        owner,
      ]);
      await actAs(db, owner);
      expect((await enroll(db, route)).outcome).toBe("ok");
      const { rows } = await db.query("select role from memberships where user_id = $1", [owner]);
      expect(rows).toEqual([{ role: "owner" }]);
    });
  });

  it("answers not_found for a paid route the caller cannot see, invalid for one they can", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "enroll");
      const paid = await published(db, space, "paid", "paid");
      const stranger = await newUser(db);
      const student = await newUser(db);
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
        [space, student],
      );
      await actAs(db, stranger);
      expect(await enroll(db, paid)).toEqual({ outcome: "not_found", enrollment_id: null });
      await db.query("reset role");
      await actAs(db, student);
      expect(await enroll(db, paid)).toEqual({ outcome: "invalid", enrollment_id: null });
    });
  });

  it("answers not_found for an unpublished route, and for nobody", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "enroll");
      const draft = await newRoute(db, space, "draft");
      const published1 = await published(db, space, "live");
      await actAs(db, await newUser(db));
      expect((await enroll(db, draft)).outcome).toBe("not_found");
      await db.query("reset role");
      await actAs(db, null);
      expect((await enroll(db, published1)).outcome).toBe("not_found");
    });
  });
});
