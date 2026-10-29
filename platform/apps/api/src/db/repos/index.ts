import type { Repos } from "@learning-routes/core/repos/ports";
import { actionLog } from "../schema/log";
import { routeDrafts } from "./drafts";
import { enrollmentsRepo } from "./enrollments";
import { learningRepo, reviewsRepo } from "./learning";
import { membershipsRepo, spacesRepo } from "./members";
import { type Db, underSavepoint } from "./shared";
import { routeVersionsRepo } from "./versions";

// The repositories on Postgres (Platform STEP 2 §4), as lr_app under the acting
// user's row-level security, inside withDb's transaction. repos.transaction is a
// savepoint: what its work wrote is kept together, or rolled back together.

export function pgRepos(db: Db): Repos {
  return {
    spaces: spacesRepo(db),
    memberships: membershipsRepo(db),
    routeDrafts: routeDrafts(db),
    routeVersions: routeVersionsRepo(db),
    enrollments: enrollmentsRepo(db),
    learning: learningRepo(db),
    reviews: reviewsRepo(db),
    actionLog: {
      async append(spaceId, entry) {
        await db.insert(actionLog).values({ ...entry, spaceId });
      },
    },
    transaction: (fn) => underSavepoint(db, () => fn(pgRepos(db))),
  };
}
