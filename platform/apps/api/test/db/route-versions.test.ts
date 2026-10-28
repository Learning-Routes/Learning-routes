import { describe, expect, it } from "vitest";
import { attempt, query, rolledBack, URLS } from "./connect";
import { newRoute, newSpace, newVersion } from "./fixtures";

const APPEND_ONLY = /route_versions is append-only/;
const PERMISSION_DENIED = /permission denied/;
const UNIQUE = /duplicate key value violates unique constraint/;
const CHECK = /violates check constraint/;

describe("route_versions (Platform STEP 2 §2.10)", () => {
  it("holds one row per route and version, with a sha-256 hash and a known format", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "versions");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const insert = `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
                      values ($1, $2, $3, '{}', $4, $5, uuidv7())`;
      const hash = "a".repeat(64);
      expect(await attempt(db, insert, [space, route, 1, 1, hash])).toMatch(UNIQUE);
      expect(await attempt(db, insert, [space, route, 0, 1, hash])).toMatch(CHECK);
      expect(await attempt(db, insert, [space, route, 2, 0, hash])).toMatch(CHECK);
      expect(await attempt(db, insert, [space, route, 2, 1, "not-a-hash"])).toMatch(CHECK);
    });
  });

  it("refuses update, delete and truncate, even to the migrator that owns it", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "versions");
      const versionId = await newVersion(db, space, await newRoute(db, space));
      expect(
        await attempt(db, "update route_versions set version = 2 where id = $1", [versionId]),
      ).toMatch(APPEND_ONLY);
      expect(await attempt(db, "delete from route_versions where id = $1", [versionId])).toMatch(
        APPEND_ONLY,
      );
      expect(await attempt(db, "truncate route_versions cascade")).toMatch(APPEND_ONLY);
    });
  });

  it("refuses them to lr_app, which may only read and append", async () => {
    for (const statement of [
      "update route_versions set version = version",
      "delete from route_versions",
      "truncate route_versions",
    ]) {
      await expect(query(URLS.app, statement)).rejects.toThrow(PERMISSION_DENIED);
    }
  });
});
