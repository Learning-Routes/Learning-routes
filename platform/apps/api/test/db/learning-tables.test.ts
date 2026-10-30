import { review } from "@learning-routes/core/learning/fsrs";
import { NEW_CARD, replayReviews } from "@learning-routes/core/learning/replay";
import { describe, expect, it } from "vitest";
import { attempt, newUser, query, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace, newVersion } from "./fixtures";

const CHECK = /violates check constraint/;
const UNIQUE = /duplicate key value violates unique constraint/;
const FOREIGN_KEY = /violates foreign key constraint/;
const APPEND_ONLY = /is append-only/;
const PERMISSION_DENIED = /permission denied/;

describe("the learning tables (Platform STEP 2 §2.11–§2.14)", () => {
  it("enrollments: one per student and route, pinned to a published version", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "learning");
      const route = await newRoute(db, space);
      const student = await newUser(db);
      const add = `insert into enrollments (space_id, route_id, user_id, pinned_version, status) values ($1, $2, $3, $4, $5)`;
      expect(await attempt(db, add, [space, route, student, 1, "active"])).toMatch(FOREIGN_KEY);
      await newVersion(db, space, route, 1);
      expect(await attempt(db, add, [space, route, student, 1, "active"])).toBeNull();
      expect(await attempt(db, add, [space, route, student, 1, "active"])).toMatch(UNIQUE);
      expect(await attempt(db, add, [space, route, await newUser(db), 1, "paused"])).toMatch(CHECK);
    });
  });

  it("progress: per enrollment and stable lesson id, always the enrollment's own student", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "learning");
      const route = await newRoute(db, space);
      await newVersion(db, space, route, 1);
      const student = await newUser(db);
      const enrollment = await newEnrollment(db, space, route, student);
      const add = `insert into progress (enrollment_id, lesson_id, space_id, user_id, status) values ($1, uuidv7(), $2, $3, $4)`;
      // The lesson id is a snapshot's stable id, with no foreign key into any table.
      expect(await attempt(db, add, [enrollment, space, student, "in_progress"])).toBeNull();
      expect(await attempt(db, add, [enrollment, space, await newUser(db), "in_progress"])).toMatch(
        FOREIGN_KEY,
      );
      expect(await attempt(db, add, [enrollment, space, student, "halfway"])).toMatch(CHECK);
    });
  });

  it("cards: one per user and item, rebuilt exactly by replaying its reviews", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "learning");
      const student = await newUser(db);
      // Review a card three times, keeping the log and the resulting cache row.
      let card = NEW_CARD;
      let due = 0;
      const log = [
        { rating: 3, reviewedAt: Date.UTC(2026, 9, 1) },
        { rating: 1, reviewedAt: Date.UTC(2026, 9, 5) },
        { rating: 4, reviewedAt: Date.UTC(2026, 9, 6) },
      ];
      for (const step of log) {
        const result = review(card, step.rating, step.reviewedAt);
        card = result.card;
        due = result.nextReviewAt;
      }
      const { rows } = await db.query(
        `insert into cards (user_id, space_id, item_id, state, reps, lapses, stability, difficulty, last_review_at, due_at)
         values ($1, $2, uuidv7(), $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0), to_timestamp($9 / 1000.0)) returning id`,
        [
          student,
          space,
          card.state,
          card.reps,
          card.lapses,
          card.stability,
          card.difficulty,
          card.lastReviewAt,
          due,
        ],
      );
      const cardId = rows[0]?.id;
      for (const step of log) {
        await db.query(
          `insert into reviews (user_id, space_id, card_id, review_id, rating, reviewed_at, elapsed_ms, state_before)
           values ($1, $2, $3, uuidv7(), $4, to_timestamp($5 / 1000.0), 1200, '{}')`,
          [student, space, cardId, step.rating, step.reviewedAt],
        );
      }

      const stored = await db.query(
        `select rating, (extract(epoch from reviewed_at) * 1000)::bigint as at from reviews where card_id = $1`,
        [cardId],
      );
      const rebuilt = replayReviews(
        stored.rows.map((row) => ({ rating: row.rating, reviewedAt: Number(row.at) })),
      );
      const cached = await db.query(
        `select state, reps, lapses, stability, difficulty,
                (extract(epoch from last_review_at) * 1000)::bigint as last, (extract(epoch from due_at) * 1000)::bigint as due
           from cards where id = $1`,
        [cardId],
      );
      const row = cached.rows[0];
      expect(rebuilt).toEqual({
        card: {
          state: row.state,
          reps: row.reps,
          lapses: row.lapses,
          stability: row.stability,
          difficulty: row.difficulty,
          lastReviewAt: Number(row.last),
        },
        nextReviewAt: Number(row.due),
      });
      expect(
        await attempt(
          db,
          "insert into cards (user_id, space_id, item_id) select user_id, space_id, item_id from cards where id = $1",
          [cardId],
        ),
      ).toMatch(UNIQUE);
    });
  });

  it("reviews: one per client review id, a rating from 1 to 4, append-only", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "learning");
      const student = await newUser(db);
      const { rows } = await db.query(
        "insert into cards (user_id, space_id, item_id) values ($1, $2, uuidv7()) returning id",
        [student, space],
      );
      const add = `insert into reviews (user_id, space_id, card_id, review_id, rating, reviewed_at, elapsed_ms, state_before)
                   values ($1, $2, $3, $4, $5, now(), 900, '{}')`;
      const reviewId = "0190f3a0-0000-7000-8000-00000000000a";
      expect(await attempt(db, add, [student, space, rows[0]?.id, reviewId, 3])).toBeNull();
      expect(await attempt(db, add, [student, space, rows[0]?.id, reviewId, 3])).toMatch(UNIQUE);
      expect(
        await attempt(db, add, [
          student,
          space,
          rows[0]?.id,
          "0190f3a0-0000-7000-8000-00000000000b",
          5,
        ]),
      ).toMatch(CHECK);
      expect(await attempt(db, "update reviews set rating = 1")).toMatch(APPEND_ONLY);
      expect(await attempt(db, "delete from reviews")).toMatch(APPEND_ONLY);
      expect(await attempt(db, "truncate reviews")).toMatch(APPEND_ONLY);
      const index = await db.query(
        "select 1 from pg_indexes where tablename = 'reviews' and indexdef like '%(user_id, card_id, reviewed_at)%'",
      );
      expect(index.rowCount).toBe(1);
    });
  });

  it("action_log: who did what, append-only, indexed by space and time", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "learning");
      const add = `insert into action_log (space_id, actor_user_id, actor_via, action, input, outcome)
                   values ($1, uuidv7(), $2, 'route.create', '{}', 'ok')`;
      expect(await attempt(db, add, [space, "ui"])).toBeNull();
      expect(await attempt(db, add, [space, "email"])).toMatch(CHECK);
      expect(await attempt(db, "update action_log set outcome = 'invalid'")).toMatch(APPEND_ONLY);
      expect(await attempt(db, "delete from action_log")).toMatch(APPEND_ONLY);
      expect(await attempt(db, "truncate action_log")).toMatch(APPEND_ONLY);
      const index = await db.query(
        "select 1 from pg_indexes where tablename = 'action_log' and indexdef like '%(space_id, at)%'",
      );
      expect(index.rowCount).toBe(1);
    });
  });

  it("lr_app may only read and append reviews and the action log", async () => {
    for (const table of ["reviews", "action_log"]) {
      for (const statement of [
        `update ${table} set id = id`,
        `delete from ${table}`,
        `truncate ${table}`,
      ]) {
        await expect(query(URLS.app, statement)).rejects.toThrow(PERMISSION_DENIED);
      }
    }
  });
});
