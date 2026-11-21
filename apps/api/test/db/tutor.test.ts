import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { tutorRepo } from "../../src/db/repos/tutor";
import { actAs, backendPid, blockedOrDone, newUser, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

// The tutor's day of questions on Postgres (Platform STEP 20 §A): two at the same instant cannot
// both take the last one, and a person never sees or takes another's.

describe("two tutor questions by one person at the same instant", () => {
  it("cannot both take the last of the day: the second waits, then gets none", async () => {
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const one = new pg.Client({ connectionString: URLS.migrator });
    const two = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), one.connect(), two.connect()]);
    try {
      const space = await newSpace(setup, "tutor");
      const route = await newRoute(setup, space, "ruta");
      await newVersion(setup, space, route);
      const [ana, beto] = [await newUser(setup), await newUser(setup)];
      const enrollment = await newEnrollment(setup, space, route, ana);
      await newEnrollment(setup, space, route, beto);
      const now = Date.now();
      for (let n = 0; n < 9; n += 1) {
        await setup.query(
          "insert into tutor_questions (space_id, user_id, enrollment_id, asked_at) values ($1, $2, $3, now())",
          [space, ana, enrollment],
        );
      }
      const twoPid = await backendPid(two);
      const take = async (db: pg.Client) => {
        await db.query("begin");
        await actAs(db, ana);
        return tutorRepo(drizzle(db, { casing: "snake_case" })).take(
          space,
          ana,
          enrollment,
          now - 3_600_000,
          10,
          now,
        );
      };
      expect(await take(one)).not.toBeNull();
      const second = take(two);
      await blockedOrDone(twoPid, second);
      await one.query("commit");
      expect(await second).toBeNull();
      await two.query("rollback");
      // Beto's row-level security shows him none of Ana's, and lets him take none on her enrollment.
      await two.query("begin");
      await actAs(two, beto);
      const asBeto = tutorRepo(drizzle(two, { casing: "snake_case" }));
      expect(await asBeto.spentSince(ana, 0)).toBe(0);
      await expect(asBeto.take(space, ana, enrollment, 0, 10, now)).rejects.toThrow();
      await two.query("rollback");
    } finally {
      await Promise.all([setup.end(), one.end(), two.end()]);
    }
  });
});
