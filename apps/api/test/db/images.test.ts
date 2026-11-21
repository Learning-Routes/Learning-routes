import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { imagesRepo } from "../../src/db/repos/images";
import { actAs, backendPid, blockedOrDone, newUser, URLS } from "./connect";
import { newSpace } from "./fixtures";

// A creator's month of images on Postgres (Platform STEP 20 §B): two at the same instant cannot both
// take the last one, and nobody takes one in a space they do not build in.

describe("two images by one creator at the same instant", () => {
  it("cannot both take the last of the month: the second waits, then gets none", async () => {
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const one = new pg.Client({ connectionString: URLS.migrator });
    const two = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), one.connect(), two.connect()]);
    try {
      const space = await newSpace(setup, "imagenes");
      const [ana, beto] = [await newUser(setup), await newUser(setup)];
      await setup.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'student')",
        [space, ana, beto],
      );
      for (let n = 0; n < 19; n += 1) {
        await setup.query(
          "insert into image_generations (space_id, user_id, asked_at) values ($1, $2, now())",
          [space, ana],
        );
      }
      const now = Date.now();
      const twoPid = await backendPid(two);
      const take = async (db: pg.Client) => {
        await db.query("begin");
        await actAs(db, ana);
        return imagesRepo(drizzle(db, { casing: "snake_case" })).take(
          space,
          ana,
          now - 86_400_000,
          20,
          now,
        );
      };
      expect(await take(one)).not.toBeNull();
      const second = take(two);
      await blockedOrDone(twoPid, second);
      await one.query("commit");
      expect(await second).toBeNull();
      await two.query("rollback");
      // A learner of the space builds nothing in it: row-level security lets them take no image.
      await two.query("begin");
      await actAs(two, beto);
      const asBeto = imagesRepo(drizzle(two, { casing: "snake_case" }));
      await expect(asBeto.take(space, beto, 0, 20, now)).rejects.toThrow();
      await two.query("rollback");
    } finally {
      await Promise.all([setup.end(), one.end(), two.end()]);
    }
  });
});
