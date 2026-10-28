import { Enrollment, Progress, ReviewCard } from "@learning-routes/core/domain";
import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { routes } from "./content";
import { spaces } from "./tenancy";
import { routeVersions } from "./versions";

// Learning (Platform STEP 2 §2.11–§2.14): a student's enrollments, progress, cards
// and review log. Every row belongs to one user and goes with them (user.erase).

const at = () => timestamp({ withTimezone: true });

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Changes only through enrollment.upgrade.
    pinnedVersion: integer().notNull(),
    status: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "enrollments_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_pinned_version_fkey",
      columns: [t.routeId, t.spaceId, t.pinnedVersion],
      foreignColumns: [routeVersions.routeId, routeVersions.spaceId, routeVersions.version],
    }).onDelete("restrict"),
    unique("enrollments_user_id_route_id_key").on(t.userId, t.routeId),
    unique("enrollments_id_space_id_user_id_key").on(t.id, t.spaceId, t.userId),
    check("enrollments_status", sql`${t.status} in (${oneOf(Enrollment.shape.status.options)})`),
  ],
);

// Progress on a lesson missing from a newer version is kept, but not counted.
export const progress = pgTable(
  "progress",
  {
    enrollmentId: uuid().notNull(),
    // A snapshot's stable lesson id: no foreign key into any table.
    lessonId: uuid().notNull(),
    spaceId: uuid().notNull(),
    userId: uuid().notNull(),
    status: text().notNull(),
    completedAt: at(),
    blocks: jsonb().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.enrollmentId, t.lessonId] }),
    // Names the enrollment with its space and student, so all three always agree.
    foreignKey({
      name: "progress_enrollment_id_fkey",
      columns: [t.enrollmentId, t.spaceId, t.userId],
      foreignColumns: [enrollments.id, enrollments.spaceId, enrollments.userId],
    }).onDelete("restrict"),
    check("progress_status", sql`${t.status} in (${oneOf(Progress.shape.status.options)})`),
    check("progress_blocks_array", sql`jsonb_typeof(${t.blocks}) = 'array'`),
  ],
);

// A cache of the review log, per user and content item, kept across enrollments.
export const cards = pgTable(
  "cards",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id),
    itemId: uuid().notNull(),
    state: text(),
    reps: integer().notNull().default(0),
    lapses: integer().notNull().default(0),
    stability: doublePrecision().notNull().default(0),
    difficulty: doublePrecision().notNull().default(0),
    lastReviewAt: at(),
    dueAt: at(),
    fsrsParamsVersion: smallint().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("cards_user_id_item_id_key").on(t.userId, t.itemId),
    unique("cards_id_user_id_space_id_key").on(t.id, t.userId, t.spaceId),
    check("cards_state", sql`${t.state} in (${oneOf(ReviewCard.shape.state.options)})`),
  ],
);

// The append-only FSRS log. review_id is the client's key, so a retry is applied once.
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id),
    cardId: uuid().notNull(),
    reviewId: uuid().notNull(),
    rating: smallint().notNull(),
    reviewedAt: at().notNull(),
    elapsedMs: integer().notNull(),
    stateBefore: jsonb().notNull(),
  },
  (t) => [
    // No action, not restrict: erasing a user removes the card and its reviews together.
    foreignKey({
      name: "reviews_card_id_fkey",
      columns: [t.cardId, t.userId, t.spaceId],
      foreignColumns: [cards.id, cards.userId, cards.spaceId],
    }),
    unique("reviews_user_id_review_id_key").on(t.userId, t.reviewId),
    index("reviews_user_id_card_id_reviewed_at_idx").on(t.userId, t.cardId, t.reviewedAt),
    check("reviews_rating", sql`${t.rating} between 1 and 4`),
    check("reviews_elapsed_ms", sql`${t.elapsedMs} >= 0`),
  ],
);
