import { repositoryContract } from "@learning-routes/core/testing/repos/contract";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgRepos } from "../../src/db/repos/index";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newSpace } from "./fixtures";

// The repository contract against Postgres (Platform STEP 2 §4.4): as lr_app with
// app.user_id set, in a transaction each test rolls back.
repositoryContract("Postgres", (test) =>
  rolledBack(URLS.migrator, async (db) => {
    const ownerId = await newUser(db);
    const learnerId = await newUser(db);
    const spaceId = await newSpace(db, "contract");
    await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
      spaceId,
      ownerId,
    ]);
    await test({
      spaceId,
      ownerId,
      learnerId,
      actAs: async (userId) => {
        await db.query("reset role");
        await actAs(db, userId);
        return pgRepos(drizzle(db, { casing: "snake_case" }));
      },
    });
  }),
);
