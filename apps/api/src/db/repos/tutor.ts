import type { TutorQuestions } from "@learning-routes/core/repos/tutor-ports";
import { sql } from "drizzle-orm";
import { type Db, date } from "./shared";

// The learner's tutor's questions on Postgres (Platform STEP 20 §A), as lr_app under the asker's
// row-level security: a person counts, takes and settles only their own.

export const tutorRepo = (db: Db): TutorQuestions => ({
  async take(spaceId, userId, enrollmentId, since, perDay, at) {
    // Held until the transaction ends: one person's questions queue here, so a count and the
    // question it allows cannot interleave with another of theirs.
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`tutor:${userId}`}))`);
    const [row] = (
      await db.execute(
        sql`insert into tutor_questions (space_id, user_id, enrollment_id, asked_at) select ${spaceId}, ${userId}, ${enrollmentId}, ${date(at)} where (select count(*) from tutor_questions where user_id = ${userId} and asked_at >= ${date(since)}) < ${perDay} returning id`,
      )
    ).rows as { id: string }[];
    return row?.id ?? null;
  },
  async settle(id, usage) {
    await db.execute(
      sql`update tutor_questions set model = ${usage.model}, prompt_tokens = ${usage.promptTokens}, completion_tokens = ${usage.completionTokens}, cost_microcents = ${usage.microcents}, answered_at = now() where id = ${id}`,
    );
  },
  async release(id) {
    await db.execute(sql`delete from tutor_questions where id = ${id} and answered_at is null`);
  },
  async spentSince(userId, since) {
    const [row] = (
      await db.execute(
        sql`select coalesce(sum(cost_microcents), 0)::bigint as spent from tutor_questions where user_id = ${userId} and asked_at >= ${date(since)}`,
      )
    ).rows as { spent: string | number }[];
    return Number(row?.spent ?? 0);
  },
});
