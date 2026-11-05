import type { Repos } from "@learning-routes/core/repos/ports";
import { actionLog } from "../schema/log";
import { applicationsRepo } from "./applications";
import { catalogRepo } from "./catalog";
import { connectionsRepo } from "./connections";
import { routeDrafts } from "./drafts";
import { enrollmentsRepo } from "./enrollments";
import { invitationsRepo } from "./invitations";
import { learningRepo, reviewsRepo } from "./learning";
import { membershipsRepo, spacesRepo } from "./members";
import { attempt, type Db, ok, underSavepoint } from "./shared";
import { routeVersionsRepo } from "./versions";

// The repositories on Postgres (Platform STEP 2 §4), as lr_app under the acting
// user's row-level security, inside withDb's transaction. repos.transaction is a
// savepoint: what its work wrote is kept together, or rolled back together.

export function pgRepos(db: Db): Repos {
  return {
    connections: connectionsRepo(db),
    spaces: spacesRepo(db),
    catalog: catalogRepo(db),
    applications: applicationsRepo(db),
    invitations: invitationsRepo(db),
    memberships: membershipsRepo(db),
    routeDrafts: routeDrafts(db),
    routeVersions: routeVersionsRepo(db),
    enrollments: enrollmentsRepo(db),
    learning: learningRepo(db),
    reviews: reviewsRepo(db),
    actionLog: {
      // Row-level security refuses an actor from outside the space: not_found.
      append: (spaceId, entry) =>
        attempt(db, async () => {
          await db.insert(actionLog).values({ ...entry, spaceId });
          return ok(undefined);
        }),
    },
    transaction: (fn) => underSavepoint(db, () => fn(pgRepos(db))),
  };
}
