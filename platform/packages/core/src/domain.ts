import { z } from "zod";
import { Block, BlockId } from "./blocks/schema";
import { Id, Locale, LocalizedText, Timestamp } from "./localized-text";

// Money is always integer minor units with its currency (cents for EUR).
export const Money = z.strictObject({
  amountMinor: z.int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, "an ISO 4217 code, upper case"),
});

export const Space = z.strictObject({
  id: Id,
  slug: z.string().min(1),
  name: LocalizedText,
  defaultLocale: Locale,
  locales: z.array(Locale).min(1),
  createdAt: Timestamp,
});

export const SpaceRole = z.enum(["owner", "coeditor", "assistant", "student"]);

// A role inside one space, or the platform operator, who belongs to no space.
export const Membership = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("space"), spaceId: Id, userId: Id, role: SpaceRole }),
  z.strictObject({ scope: z.literal("platform"), userId: Id, role: z.literal("operator") }),
]);

// The route's text must exist in its source locale; translations are optional.
export const Route = z
  .strictObject({
    id: Id,
    spaceId: Id,
    slug: z.string().min(1),
    title: LocalizedText,
    description: LocalizedText.nullish(),
    sourceLocale: Locale,
    access: z.enum(["open", "closed"]),
    pricing: z.enum(["free", "paid"]),
    version: z.int().positive(),
    forkedFrom: z.strictObject({ routeId: Id, version: z.int().positive() }).nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .superRefine((route, ctx) => {
    for (const field of ["title", "description"] as const) {
      const text = route[field];
      if (text && text[route.sourceLocale] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field, route.sourceLocale],
          message: `${field} has no text in the source locale`,
        });
      }
    }
  });

export const Module = z.strictObject({
  id: Id,
  routeId: Id,
  position: z.int().nonnegative(),
  title: LocalizedText,
});

// Prerequisites are lesson ids, so a route is a graph, not a list.
export const Lesson = z.strictObject({
  id: Id,
  routeId: Id,
  moduleId: Id,
  position: z.int().nonnegative(),
  title: LocalizedText,
  prerequisites: z.array(Id),
  blocks: z.array(Block),
});

export const Resource = z.strictObject({
  id: Id,
  spaceId: Id,
  kind: z.enum(["image", "audio", "video", "document", "link"]),
  title: LocalizedText,
  uri: z.string().min(1),
  mediaType: z.string().nullish(),
  bytes: z.int().nonnegative().nullish(),
});

const offerBase = { id: Id, spaceId: Id, routeId: Id, active: z.boolean(), createdAt: Timestamp };

export const Offer = z.discriminatedUnion("kind", [
  z.strictObject({ ...offerBase, kind: z.literal("one_time"), price: Money }),
  z.strictObject({
    ...offerBase,
    kind: z.literal("subscription"),
    price: Money,
    interval: z.enum(["month", "year"]),
  }),
  z.strictObject({
    ...offerBase,
    kind: z.literal("lesson_package"),
    price: Money,
    lessonIds: z.array(Id).min(1),
  }),
  z.strictObject({
    ...offerBase,
    kind: z.literal("promo_code"),
    code: z.string().min(1),
    percentOff: z.int().min(1).max(100).nullish(),
    amountOff: Money.nullish(),
    expiresAt: Timestamp.nullish(),
    maxRedemptions: z.int().positive().nullish(),
  }),
  z.strictObject({
    ...offerBase,
    kind: z.literal("group_price"),
    price: Money,
    seats: z.int().min(2),
  }),
]);

export const Enrollment = z.strictObject({
  id: Id,
  routeId: Id,
  routeVersion: z.int().positive(),
  studentId: Id,
  offerId: Id.nullable(),
  source: z.enum(["free", "purchase", "grant"]),
  status: z.enum(["active", "revoked", "expired"]),
  createdAt: Timestamp,
  revokedAt: Timestamp.nullish(),
});

export const ReviewCard = z.strictObject({
  state: z.enum(["new", "learning", "review", "relearning"]),
  reps: z.int().nonnegative(),
  lapses: z.int().nonnegative(),
  stability: z.number().nonnegative(),
  difficulty: z.number().min(1).max(10),
  lastReviewAt: Timestamp.nullable(),
  nextReviewAt: Timestamp.nullable(),
});

// One student's progress through one lesson. It never lives on the content.
export const Progress = z.strictObject({
  studentId: Id,
  routeId: Id,
  lessonId: Id,
  status: z.enum(["not_started", "in_progress", "completed"]),
  completedAt: Timestamp.nullable(),
  blocks: z.array(
    z.strictObject({
      // A block id, never a position: positions move when a lesson is edited.
      blockId: BlockId,
      attempts: z.int().nonnegative(),
      correct: z.boolean().nullable(),
      score: z.number().min(0).max(100).nullable(),
      // Released after repeated failures: satisfies progression, is not a pass.
      releasedAt: Timestamp.nullable(),
      completedAt: Timestamp.nullable(),
    }),
  ),
  review: ReviewCard.nullable(),
});

// Every agent or creator action, so it can be shown, approved and undone.
export const Change = z.strictObject({
  id: Id,
  spaceId: Id,
  actor: z.strictObject({ kind: z.enum(["creator", "agent", "operator"]), id: Id }),
  action: z.string().min(1),
  target: z.strictObject({
    kind: z.enum(["space", "route", "module", "lesson", "block", "resource", "offer"]),
    id: Id,
  }),
  before: z.unknown(),
  after: z.unknown(),
  status: z.enum(["proposed", "applied", "rejected", "undone"]),
  createdAt: Timestamp,
  appliedAt: Timestamp.nullish(),
  undoneAt: Timestamp.nullish(),
});

// Credits in integer units; spending is negative.
export const CreditLedgerEntry = z.strictObject({
  id: Id,
  spaceId: Id,
  amount: z.int(),
  reason: z.enum(["purchase", "grant", "usage", "refund", "adjustment"]),
  changeId: Id.nullish(),
  createdAt: Timestamp,
});

export type Money = z.infer<typeof Money>;
export type Space = z.infer<typeof Space>;
export type SpaceRole = z.infer<typeof SpaceRole>;
export type Membership = z.infer<typeof Membership>;
export type Route = z.infer<typeof Route>;
export type Module = z.infer<typeof Module>;
export type Lesson = z.infer<typeof Lesson>;
export type Resource = z.infer<typeof Resource>;
export type Offer = z.infer<typeof Offer>;
export type Enrollment = z.infer<typeof Enrollment>;
export type ReviewCard = z.infer<typeof ReviewCard>;
export type Progress = z.infer<typeof Progress>;
export type Change = z.infer<typeof Change>;
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntry>;
