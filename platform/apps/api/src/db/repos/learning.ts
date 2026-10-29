import type { Card } from "@learning-routes/core/learning/fsrs";
import type {
  Learning,
  ProgressRecord,
  RepoResult,
  ReviewRecord,
  Reviews,
  StoredCard,
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

/** Made new if missing, never reset: a racing first review waits on the lock instead. */
const lockCard = (db: Db, where: { spaceId: string; userId: string; itemId: string }) =>
  attempt(db, async (): Promise<RepoResult<StoredCard>> => {
    await db
      .insert(cards)
      .values(where)
      .onConflictDoNothing({ target: [cards.userId, cards.itemId] });
    const [row] = await db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.userId, where.userId),
          eq(cards.itemId, where.itemId),
          eq(cards.spaceId, where.spaceId),
        ),
      )
      .for("update");
    return row === undefined
      ? fail("not_found")
      : ok({ id: row.id, card: cardOf(row), dueAt: ms(row.dueAt) });
  });

const saveCard = (
  db: Db,
  where: { spaceId: string; userId: string; cardId: string },
  card: Card,
  dueAt: number,
) =>
  attempt(db, async (): Promise<RepoResult<void>> => {
    const { lastReviewAt, ...counts } = card;
    const saved = await db
      .update(cards)
      .set({
        ...counts,
        lastReviewAt: date(lastReviewAt),
        dueAt: new Date(dueAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cards.id, where.cardId),
          eq(cards.userId, where.userId),
          eq(cards.spaceId, where.spaceId),
        ),
      )
      .returning({ id: cards.id });
    return saved.length === 1 ? ok(undefined) : fail("not_found");
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
  lockCard: (spaceId, userId, itemId) => lockCard(db, { spaceId, userId, itemId }),
  saveCard: (spaceId, userId, cardId, card, dueAt) =>
    saveCard(db, { spaceId, userId, cardId }, card, dueAt),
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
      return ok({ review: reviewOf(inserted), duplicate: false });
    }
    // Read back in this space only: a reviewId used in another space is a conflict.
    const [stored] = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, userId),
          eq(reviews.reviewId, entry.reviewId),
          eq(reviews.spaceId, spaceId),
        ),
      );
    return stored === undefined
      ? fail("conflict")
      : ok({ review: reviewOf(stored), duplicate: true });
  },
});
