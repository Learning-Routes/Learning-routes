import {
  NOTIFICATION_KINDS,
  POST_KINDS,
  REPORT_REASONS,
} from "@learning-routes/core/repos/community-ports";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, time } from "./columns";
import { routes } from "./content";
import { spaces } from "./tenancy";

// A route's community (Platform STEP 17). Every row names its space, and children reach their
// parent through (id, space_id), so nothing points across spaces. Who reads and writes each row
// is row-level security's (drizzle/0040_community_rules.sql); what a row may say is here.

const ITEM_KINDS = [...POST_KINDS, "milestone"] as const;

/** A post or a reply. A reply has a parent and no kind; a milestone has no text. */
export const communityPosts = pgTable(
  "community_posts",
  {
    id: id(),
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    parentId: uuid(),
    // Set null when the author is erased: the post stays, under "[eliminado]".
    authorId: uuid().references(() => user.id, { onDelete: "set null" }),
    // The name the author showed when writing; never an address.
    authorName: text().notNull().default(""),
    kind: text().$type<(typeof ITEM_KINDS)[number]>(),
    // A lesson of the route's published version. No foreign key: a draft's lessons change.
    lessonId: uuid(),
    moduleNumber: smallint(),
    body: text(),
    isByCreator: boolean().notNull().default(false),
    isPinned: boolean().notNull().default(false),
    isAnswer: boolean().notNull().default(false),
    hiddenAt: time(),
    // No foreign key: erasing whoever hid it leaves the record whole. Null when reports hid it.
    hiddenBy: uuid(),
    deletedAt: time(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("community_posts_id_space_id_key").on(t.id, t.spaceId),
    foreignKey({
      name: "community_posts_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "community_posts_parent_id_fkey",
      columns: [t.parentId, t.spaceId],
      foreignColumns: [t.id, t.spaceId],
    }).onDelete("restrict"),
    index("community_posts_route_id_created_at_idx")
      .on(t.routeId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.parentId} is null`),
    index("community_posts_parent_id_idx").on(t.parentId),
    index("community_posts_author_id_created_at_idx").on(t.authorId, t.createdAt),
    index("community_posts_space_id_created_at_idx")
      .on(t.spaceId, t.createdAt.desc())
      .where(sql`${t.parentId} is null and ${t.isByCreator}`),
    check("community_posts_kind", sql`${t.kind} is null or ${t.kind} in (${oneOf(ITEM_KINDS)})`),
    // A reply has a parent and no kind; a post has a kind and no parent.
    check("community_posts_reply", sql`(${t.parentId} is null) = (${t.kind} is not null)`),
    check(
      "community_posts_milestone",
      // coalesce: a reply's kind is null, and a check that reads null passes.
      sql`(coalesce(${t.kind}, '') = 'milestone') = (${t.moduleNumber} is not null) and (coalesce(${t.kind}, '') <> 'milestone' or ${t.body} is null)`,
    ),
    check(
      "community_posts_body",
      sql`coalesce(${t.kind}, '') = 'milestone' or ${t.deletedAt} is not null or coalesce(char_length(${t.body}), 0) between 1 and 2000`,
    ),
    check("community_posts_deleted", sql`${t.deletedAt} is null or ${t.body} is null`),
    check("community_posts_answer", sql`not ${t.isAnswer} or ${t.parentId} is not null`),
    check("community_posts_pinned", sql`not ${t.isPinned} or ${t.parentId} is null`),
  ],
);

/** The one "useful" mark, per person per post. */
export const communityReactions = pgTable(
  "community_reactions",
  {
    postId: uuid().notNull(),
    spaceId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    foreignKey({
      name: "community_reactions_post_id_fkey",
      columns: [t.postId, t.spaceId],
      foreignColumns: [communityPosts.id, communityPosts.spaceId],
    }).onDelete("cascade"),
  ],
);

/** A report, one per person per item. Three open ones hide the item. */
export const communityReports = pgTable(
  "community_reports",
  {
    id: id(),
    postId: uuid().notNull(),
    spaceId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text().$type<(typeof REPORT_REASONS)[number]>().notNull(),
    resolvedAt: time(),
    resolvedBy: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("community_reports_post_id_user_id_key").on(t.postId, t.userId),
    foreignKey({
      name: "community_reports_post_id_fkey",
      columns: [t.postId, t.spaceId],
      foreignColumns: [communityPosts.id, communityPosts.spaceId],
    }).onDelete("cascade"),
    index("community_reports_open_idx").on(t.createdAt).where(sql`${t.resolvedAt} is null`),
    index("community_reports_user_id_created_at_idx").on(t.userId, t.createdAt),
    check("community_reports_reason", sql`${t.reason} in (${oneOf(REPORT_REASONS)})`),
  ],
);

/** Who follows a creator's space. Only its count is public. */
export const communityFollows = pgTable(
  "community_follows",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.spaceId] }),
    index("community_follows_space_id_idx").on(t.spaceId),
  ],
);

/** Whom a person blocked: they stop seeing them, and cannot be replied to by them. */
export const communityBlocks = pgTable(
  "community_blocks",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.blockedUserId] }),
    check("community_blocks_not_self", sql`${t.userId} <> ${t.blockedUserId}`),
  ],
);

/** Banned from writing in any community, by the operator. */
export const communityBans = pgTable("community_bans", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bannedBy: uuid(),
  createdAt: createdAt(),
});

/** In-app only: a reply to your post, your reply as the answer, your post pinned. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid().notNull(),
    postId: uuid().notNull(),
    kind: text().$type<(typeof NOTIFICATION_KINDS)[number]>().notNull(),
    readAt: time(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "notifications_post_id_fkey",
      columns: [t.postId, t.spaceId],
      foreignColumns: [communityPosts.id, communityPosts.spaceId],
    }).onDelete("cascade"),
    index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt.desc()),
    check("notifications_kind", sql`${t.kind} in (${oneOf(NOTIFICATION_KINDS)})`),
  ],
);
