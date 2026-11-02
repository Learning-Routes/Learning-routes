import { describe, expect, it } from "vitest";
import { attempt, rolledBack, URLS } from "./connect";

// TRUNCATE takes every table it cascades to in ACCESS EXCLUSIVE, which deadlocks with
// any insert running beside it. *.exclusive.test.ts files run alone, after the rest.

describe("append-only tables refuse TRUNCATE, even to the migrator", () => {
  it.each(["route_versions cascade", "reviews", "action_log"])("truncate %s", async (target) => {
    await rolledBack(URLS.migrator, async (db) => {
      expect(await attempt(db, `truncate ${target}`)).toMatch("append-only");
    });
  });
});
