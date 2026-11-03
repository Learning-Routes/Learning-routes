import type { CreatorApplication } from "@learning-routes/core/applications";
import type { Applications } from "@learning-routes/core/repos/ports";
import { asc, eq } from "drizzle-orm";
import { creatorApplications } from "../schema/catalog";
import { attempt, type Db, fail, ok } from "./shared";

// Applications to teach (Platform STEP 4 §2.4, §6). Row-level security lets anyone apply,
// and only an operator read or decide.

export function insertApplication(db: Db, application: CreatorApplication) {
  return db.insert(creatorApplications).values({ ...application, link: application.link ?? null });
}

export const applicationsRepo = (db: Db): Applications => ({
  // The oldest first: nobody waits at the bottom of the list.
  list: () =>
    db
      .select({
        id: creatorApplications.id,
        name: creatorApplications.name,
        email: creatorApplications.email,
        teaches: creatorApplications.teaches,
        link: creatorApplications.link,
        locale: creatorApplications.locale,
      })
      .from(creatorApplications)
      .where(eq(creatorApplications.status, "new"))
      .orderBy(asc(creatorApplications.createdAt)),
  decide: (id, status) =>
    attempt(db, async () => {
      const rows = await db
        .update(creatorApplications)
        .set({ status, decidedAt: new Date() })
        .where(eq(creatorApplications.id, id))
        .returning({ id: creatorApplications.id });
      return rows.length === 1 ? ok(undefined) : fail("not_found");
    }),
});
