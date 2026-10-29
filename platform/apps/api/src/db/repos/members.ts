import type { Memberships, Spaces } from "@learning-routes/core/repos/ports";
import { and, asc, eq } from "drizzle-orm";
import { memberships, spaces } from "../schema/tenancy";
import { attempt, type Db, fail, ok } from "./shared";

// Spaces and who belongs to them, on Postgres (Platform STEP 2 §4).

export const spacesRepo = (db: Db): Spaces => ({
  async get(spaceId) {
    const [row] = await db
      .select({
        id: spaces.id,
        slug: spaces.slug,
        name: spaces.name,
        defaultLocale: spaces.defaultLocale,
        locales: spaces.locales,
      })
      .from(spaces)
      .where(eq(spaces.id, spaceId));
    return row === undefined ? fail("not_found") : ok(row);
  },
});

export const membershipsRepo = (db: Db): Memberships => ({
  list: (spaceId) =>
    db
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.spaceId, spaceId))
      .orderBy(asc(memberships.userId)),
  add: (spaceId, member) =>
    attempt(db, async () => {
      await db.insert(memberships).values({ spaceId, ...member });
      return ok(undefined);
    }),
  async roleOf(spaceId, userId) {
    const [row] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)));
    return row?.role ?? null;
  },
});
