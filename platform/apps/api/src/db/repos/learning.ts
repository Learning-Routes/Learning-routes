import type { Card } from "@learning-routes/core/learning/fsrs";
import type {
  Learning,
  ProgressRecord,
  RepoResult,
  ReviewRecord,
  Reviews,
} from "@learning-routes/core/repos/ports";
import { and, asc, eq } from "drizzle-orm";
import { cards, progress, reviews } from "../schema/learning";
import { attempt, type Db, date, fail, ms, ok } from "./shared";

// A learner's progress, cards and review log on Postgres (Platform STEP 2 §4).

function cardOf(row: typeof cards.$inferSelect): Card {
  const { state, reps, lapses, stability, difficulty } = row;
  return { state, reps, lapses, stability, difficulty, lastReviewAt: ms(row.lastReviewAt) };
}

function reviewOf(row: typeof reviews.$inferSelect): ReviewRecord {
  const { reviewId, cardId, rating, elapsedMs, stateBefore } = row;
  return { reviewId, cardId, rating, reviewedAt: row.reviewedAt.getTime(), elapsedMs, stateBefore };
}

const saveProgress = (db: Db, spaceId: string, userId: string, record: ProgressRecord) =>
  attempt(db, async () => {
    const values = {
      status: record.status,
      completedAt: date(record.completedAt),
      blocks: record.blocks,
    };
    await db
      .insert(progress)
      .values({
        ...values,
        enrollmentId: record.enrollmentId,
        lessonId: record.lessonId,
        spaceId,
        userId,
      })
      .onConflictDoUpdate({
        target: [progress.enrollmentId, progress.lessonId],
        set: { ...values, updatedAt: new Date() },
      });
    return ok(undefined);
  });

const saveCard = (
  db: Db,
  where: { spaceId: string; userId: string; itemId: string },
  card: Card,
  dueAt: number,
) =>
  attempt(db, async (): Promise<RepoResult<{ cardId: string }>> => {
    const { lastReviewAt, ...counts } = card;
    const values = { ...counts, lastReviewAt: date(lastReviewAt), dueAt: new Date(dueAt) };
    const [saved] = await db
      .insert(cards)
      .values({ ...values, ...where })
      .onConflictDoUpdate({
        target: [cards.userId, cards.itemId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning({ cardId: cards.id });
    return saved === undefined ? fail("not_found") : ok(saved);
  });

export const learningRepo = (db: Db): Learning => ({
  async progress(spaceId, enrollmentId) {
    const rows = await db
      .select()
      .from(progress)
      .where(and(eq(progress.enrollmentId, enrollmentId), eq(progress.spaceId, spaceId)))
      .orderBy(asc(progress.lessonId));
    return rows.map(({ enrollmentId: id, lessonId, status, completedAt, blocks }) => ({
      enrollmentId: id,
      lessonId,
      status,
      completedAt: ms(completedAt),
      blocks,
    }));
  },
  saveProgress: (spaceId, userId, record) => saveProgress(db, spaceId, userId, record),
  async card(spaceId, userId, itemId) {
    const [row] = await db
      .select()
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.itemId, itemId), eq(cards.spaceId, spaceId)));
    return row === undefined ? null : { id: row.id, card: cardOf(row), dueAt: ms(row.dueAt) };
  },
  saveCard: (spaceId, userId, itemId, card, dueAt) =>
    saveCard(db, { spaceId, userId, itemId }, card, dueAt),
});

export const reviewsRepo = (db: Db): Reviews => ({
  // insert ... on conflict do nothing returning: a retry gets the stored review.
  async append(spaceId, userId, entry) {
    const [inserted] = await db
      .insert(reviews)
      .values({ ...entry, userId, spaceId, reviewedAt: new Date(entry.reviewedAt) })
      .onConflictDoNothing({ target: [reviews.userId, reviews.reviewId] })
      .returning();
    if (inserted !== undefined) {
      return { review: reviewOf(inserted), duplicate: false };
    }
    const [stored] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.reviewId, entry.reviewId)));
    if (stored === undefined) {
      throw new Error("a review conflicted but cannot be read back");
    }
    return { review: reviewOf(stored), duplicate: true };
  },
});
