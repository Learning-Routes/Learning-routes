import { describe, expect, it } from "vitest";
import { retire } from "../../scripts/retire";
import { newUser, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace } from "./fixtures";

// db:retire: a route or a space goes out of sight and comes back, and nothing is deleted.

const SNAPSHOT = (slug: string) =>
  JSON.stringify({
    route: { slug, title: { en: "A route" }, sourceLocale: "en", access: "open", pricing: "free" },
    modules: [],
    lessons: [],
  });

async function published(db: Parameters<typeof newSpace>[0], slug: string) {
  const spaceId = await newSpace(db, "retire");
  const routeId = await newRoute(db, spaceId, slug);
  await db.query(
    `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
     values ($1, $2, 1, $3, 1, $4, uuidv7())`,
    [spaceId, routeId, SNAPSHOT(slug), "0".repeat(64)],
  );
  await db.query("update routes set latest_published_version = 1 where id = $1", [routeId]);
  const { rows } = await db.query<{ slug: string }>("select slug from spaces where id = $1", [
    spaceId,
  ]);
  return { spaceId, routeId, spaceSlug: rows[0]?.slug ?? "" };
}

const listed = async (db: Parameters<typeof newSpace>[0], routeId: string) =>
  (await db.query("select 1 from public_routes where route_id = $1", [routeId])).rowCount;

describe("db:retire", () => {
  it("takes a route out of the public reads, keeps its rows, and brings it back", () =>
    rolledBack(URLS.migrator, async (db) => {
      const { routeId, spaceSlug } = await published(db, "out-of-sight");
      const name = `${spaceSlug}/out-of-sight`;
      expect(await listed(db, routeId)).toBe(1);

      expect(await retire(db, "route", [name])).toEqual([{ kind: "route", name, outcome: "done" }]);
      expect(await listed(db, routeId)).toBe(0);
      expect((await db.query("select 1 from routes where id = $1", [routeId])).rowCount).toBe(1);
      expect(
        (await db.query("select 1 from route_versions where route_id = $1", [routeId])).rowCount,
      ).toBe(1);

      expect((await retire(db, "route", [name]))[0]?.outcome).toBe("already");
      expect((await retire(db, "route", [name], { isRestore: true }))[0]?.outcome).toBe("done");
      expect(await listed(db, routeId)).toBe(1);
    }));

  it("retires a whole space, which then answers as gone, with its routes", () =>
    rolledBack(URLS.migrator, async (db) => {
      const { routeId, spaceSlug } = await published(db, "with-its-space");
      expect((await retire(db, "space", [spaceSlug]))[0]?.outcome).toBe("done");
      expect(await listed(db, routeId)).toBe(0);
      expect(
        (await db.query("select 1 from public_retired_spaces where slug = $1", [spaceSlug]))
          .rowCount,
      ).toBe(1);
      expect(
        (await db.query("select 1 from public_spaces where slug = $1", [spaceSlug])).rowCount,
      ).toBe(0);
    }));

  it("ends a test route's enrollments when asked, and keeps the rows", () =>
    rolledBack(URLS.migrator, async (db) => {
      const { spaceId, routeId, spaceSlug } = await published(db, "only-a-test");
      const userId = await newUser(db);
      await newEnrollment(db, spaceId, routeId, userId);
      const status = async () =>
        (await db.query("select status from enrollments where user_id = $1", [userId])).rows[0]
          ?.status;
      await retire(db, "route", [`${spaceSlug}/only-a-test`]);
      await retire(db, "route", [`${spaceSlug}/only-a-test`], { isRestore: true });
      expect(await status()).toBe("active");
      await retire(db, "route", [`${spaceSlug}/only-a-test`], { closes: true });
      expect(await status()).toBe("expired");
    }));

  it("says so when the name is nobody's, and changes nothing", () =>
    rolledBack(URLS.migrator, async (db) => {
      expect(await retire(db, "route", ["no-such-space/no-such-route"])).toEqual([
        { kind: "route", name: "no-such-space/no-such-route", outcome: "missing" },
      ]);
      expect((await retire(db, "space", ["no-such-space"]))[0]?.outcome).toBe("missing");
    }));
});
