import type { StoredFiles } from "@learning-routes/core/repos/ports";
import { and, eq, sql } from "drizzle-orm";
import { storedFiles } from "../schema/content";
import { attempt, type Db, ok } from "./shared";

// What a space keeps on the content host, on Postgres (Platform STEP 9 §2). Row-level
// security shows a space's files to its staff, and takes new ones from its editors only.

export const storedFilesRepo = (db: Db): StoredFiles => ({
  async usage(spaceId) {
    // Uploads to one space take turns from here to the commit, so two cannot both fit the quota.
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`stored_files:${spaceId}`}))`);
    const [row] = await db
      .select({ bytes: sql<string>`coalesce(sum(${storedFiles.bytes}), 0)` })
      .from(storedFiles)
      .where(eq(storedFiles.spaceId, spaceId));
    return Number(row?.bytes ?? 0);
  },
  async has(spaceId, key) {
    const rows = await db
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(and(eq(storedFiles.spaceId, spaceId), eq(storedFiles.key, key)));
    return rows.length > 0;
  },
  record: (spaceId, file) =>
    attempt(db, async () => {
      await db
        .insert(storedFiles)
        .values({ spaceId, ...file })
        .onConflictDoNothing();
      return ok(undefined);
    }),
});
