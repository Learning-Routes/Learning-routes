import type { ImageGenerations } from "@learning-routes/core/repos/image-ports";
import { sql } from "drizzle-orm";
import { type Db, date } from "./shared";

// Route images on Postgres (Platform STEP 20 §B), as lr_app under the creator's row-level security:
// a creator counts, takes and settles only their own, and takes one only where they build.

export const imagesRepo = (db: Db): ImageGenerations => ({
  async take(spaceId, userId, since, perMonth, at) {
    // Held until the transaction ends: one creator's requests queue here, so a count and the image
    // it allows cannot interleave with another of theirs.
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`images:${userId}`}))`);
    const [row] = (
      await db.execute(
        sql`insert into image_generations (space_id, user_id, asked_at) select ${spaceId}, ${userId}, ${date(at)} where (select count(*) from image_generations where user_id = ${userId} and asked_at >= ${date(since)}) < ${perMonth} returning id`,
      )
    ).rows as { id: string }[];
    return row?.id ?? null;
  },
  async settle(id, usage) {
    await db.execute(
      sql`update image_generations set model = ${usage.model}, prompt_tokens = ${usage.promptTokens}, completion_tokens = ${usage.completionTokens}, cost_microcents = ${usage.microcents}, asset_key = ${usage.assetKey}, made_at = now() where id = ${id}`,
    );
  },
  async release(id) {
    await db.execute(sql`delete from image_generations where id = ${id} and made_at is null`);
  },
});
