import type { CommunityItem, Cursor } from "@learning-routes/core/repos/community-ports";
import { type SQL, sql } from "drizzle-orm";
import { type Db, date } from "./shared";

// What every read of the community shares (Platform STEP 17): an item as its reader may see it,
// newest-first pages, and nobody the reader blocked.

export const ITEM = sql` post.id, post.space_id, post.route_id, post.parent_id, post.kind, post.lesson_id, post.module_number, post.body, post.author_id, case when post.deleted_at is null then post.author_name else '' end as author_name, post.is_by_creator, post.is_pinned, post.is_answer, post.hidden_at is not null as is_hidden, post.deleted_at is not null as is_deleted, (select count(*)::integer from community_reactions as mark where mark.post_id = post.id) as useful_count, exists (select 1 from community_reactions as mark where mark.post_id = post.id and mark.user_id = app.user_id()) as marked_useful, post.created_at`;

/** Nobody the reader blocked. */
export const NOT_BLOCKED = sql`not exists ( select 1 from community_blocks as block where block.user_id = app.user_id() and block.blocked_user_id = post.author_id)`;

export interface ItemRow {
  id: string;
  space_id: string;
  route_id: string;
  parent_id: string | null;
  kind: CommunityItem["kind"];
  lesson_id: string | null;
  module_number: number | null;
  body: string | null;
  author_id: string | null;
  author_name: string;
  is_by_creator: boolean;
  is_pinned: boolean;
  is_answer: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  useful_count: number;
  marked_useful: boolean;
  created_at: Date | string;
}

export const at = (time: Date | string) => new Date(time).getTime();

export function itemOf(row: ItemRow): CommunityItem {
  return {
    id: row.id,
    spaceId: row.space_id,
    routeId: row.route_id,
    parentId: row.parent_id,
    kind: row.kind,
    lessonId: row.lesson_id,
    moduleNumber: row.module_number,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    byCreator: row.is_by_creator,
    isPinned: row.is_pinned,
    isAnswer: row.is_answer,
    isHidden: row.is_hidden,
    isDeleted: row.is_deleted,
    usefulCount: row.useful_count,
    markedUseful: row.marked_useful,
    createdAt: at(row.created_at),
  };
}

/** Newest first, after the cursor. Times are compared to the millisecond the cursor carries. */
export const after = (cursor: Cursor | null): SQL =>
  cursor === null
    ? sql`true`
    : sql`(date_trunc('milliseconds', post.created_at), post.id) < (${date(cursor.at)}::timestamptz, ${cursor.id}::uuid)`;

export function page<T extends { createdAt: number; id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, next: rows.length > limit && last ? { at: last.createdAt, id: last.id } : null };
}

/** The item's open reports, reviewed by whoever acted. */
export async function resolveReports(db: Db, postId: string, time: number) {
  await db.execute(
    sql`update community_reports set resolved_at = ${date(time)}, resolved_by = app.user_id() where post_id = ${postId} and resolved_at is null`,
  );
}

/** Reads items as the acting user sees them. */
export const readItems = (db: Db) => async (query: SQL) =>
  ((await db.execute(query)).rows as unknown as ItemRow[]).map(itemOf);

/** A uuid[] parameter: drizzle spreads a JS array into a list, which ::uuid[] cannot read. */
export const uuids = (ids: readonly string[]): SQL =>
  sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
