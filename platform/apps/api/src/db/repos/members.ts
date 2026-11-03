import type { Memberships, Spaces } from "@learning-routes/core/repos/ports";
import { and, asc, eq, sql } from "drizzle-orm";
import { memberships, spaces } from "../schema/tenancy";
import { attempt, type Db, fail, ok } from "./shared";

// Spaces and who belongs to them, on Postgres (Platform STEP 2 §4).

export const spacesRepo = (db: Db): Spaces => ({
  // Through app.create_space, which checks who is asking: lr_app cannot insert a space.
  create: ({ name, slug, locale, ownerEmail }) =>
    attempt(db, async () => {
      const localized = JSON.stringify({ [locale]: name });
      const result = await db.execute<{ outcome: string; space_id: string | null }>(
        sql`select outcome, space_id from app.create_space(${slug}, ${localized}::jsonb, ${locale}, ${ownerEmail})`,
      );
      const [row] = result.rows;
      if (row?.outcome === "ok" && row.space_id !== null) {
        return ok({ spaceId: row.space_id });
      }
      return fail(
        row?.outcome === "no_account"
          ? "invalid"
          : row?.outcome === "slug_taken"
            ? "conflict"
            : "not_found",
      );
    }),
  async get(spaceId) {
    const [row] = await db
      .select({
        id: spaces.id,
        slug: spaces.slug,
        name: spaces.name,
        defaultLocale: spaces.defaultLocale,
        locales: spaces.locales,
        tagline: spaces.tagline,
        bio: spaces.bio,
        brandColor: spaces.brandColor,
      })
      .from(spaces)
      .where(eq(spaces.id, spaceId));
    return row === undefined ? fail("not_found") : ok(row);
  },
  update: (spaceId, page) =>
    attempt(db, async () => {
      const updated = await db
        .update(spaces)
        .set({ ...page, updatedAt: new Date() })
        .where(eq(spaces.id, spaceId))
        .returning({ id: spaces.id });
      return updated.length === 1 ? ok(undefined) : fail("not_found");
    }),
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
