import type { LocalizedText } from "@learning-routes/core/localized-text";
import type {
  Community,
  CommunityItem,
  Cursor,
  FeedItem,
  NewCommunityItem,
} from "@learning-routes/core/repos/community-ports";
import { type SQL, sql } from "drizzle-orm";
import { accountRepo } from "./community-account";
import { after, ITEM, NOT_BLOCKED, page, readItems, resolveReports, uuids } from "./community-rows";
import { attempt, type Db, date, fail, ok } from "./shared";

// A route's community on Postgres (Platform STEP 17), as lr_app under the acting user's
// row-level security: what a person may not see is not in any answer here, and what they may not
// write is refused by the database (drizzle/0040_community_rules.sql). Blocks are a person's
// choice, not a fence, so they are filtered here, in each read.

type Paging = { before: Cursor | null; limit: number };

async function thread(db: Db, spaceId: string, routeId: string, { before, limit }: Paging) {
  const rows = readItems(db);
  const scope = sql`post.space_id = ${spaceId} and post.route_id = ${routeId} and post.parent_id is null and ${NOT_BLOCKED}`;
  const pinned =
    before === null
      ? await rows(
          sql`select ${ITEM} from community_posts as post where ${scope} and post.is_pinned order by post.created_at desc, post.id desc`,
        )
      : [];
  const posts = await rows(
    sql`select ${ITEM} from community_posts as post where ${scope} and not post.is_pinned and ${after(before)} order by post.created_at desc, post.id desc limit ${limit + 1}`,
  );
  const shown = page(posts, limit);
  const ids = [...pinned, ...shown.items].map((post) => post.id);
  const replies =
    ids.length === 0
      ? []
      : await rows(
          sql`select ${ITEM} from community_posts as post where post.space_id = ${spaceId} and post.parent_id = any (${uuids(ids)}) and ${NOT_BLOCKED} order by post.created_at, post.id`,
        );
  const withReplies = (post: CommunityItem) => ({
    ...post,
    replies: replies.filter((reply) => reply.parentId === post.id),
  });
  return { pinned: pinned.map(withReplies), items: shown.items.map(withReplies), next: shown.next };
}

async function item(db: Db, spaceId: string, routeId: string, id: string) {
  const [found] = await readItems(db)(
    sql`select ${ITEM} from community_posts as post where post.id = ${id} and post.space_id = ${spaceId} and post.route_id = ${routeId} and ${NOT_BLOCKED}`,
  );
  return found ?? null;
}

async function countSince(
  db: Db,
  userId: string,
  what: "post" | "reply" | "report",
  since: number,
) {
  const query =
    what === "report"
      ? sql`select count(*)::integer as n from community_reports where user_id = ${userId} and created_at >= ${date(since)}`
      : sql`select count(*)::integer as n from community_posts as post where post.author_id = ${userId} and post.created_at >= ${date(since)} and post.kind is distinct from 'milestone' and (post.parent_id is null) = ${what === "post"}`;
  const [row] = (await db.execute(query)).rows as { n: number }[];
  return row?.n ?? 0;
}

const add = (db: Db, spaceId: string, row: NewCommunityItem, time: number) =>
  attempt(db, async () => {
    const inserted = await db.execute(
      sql`insert into community_posts (space_id, route_id, parent_id, author_id, author_name, kind, lesson_id, module_number, body, is_by_creator, created_at) values (${spaceId}, ${row.routeId}, ${row.parentId}, ${row.authorId}, ${row.authorName}, ${row.kind}, ${row.lessonId}, ${row.moduleNumber}, ${row.body}, ${row.byCreator}, ${date(time)}) returning id`,
    );
    const { id } = inserted.rows[0] as { id: string };
    const [added] = await readItems(db)(
      sql`select ${ITEM} from community_posts as post where post.id = ${id}`,
    );
    return added ? ok(added) : fail("not_found");
  });

type Marks = { isPinned?: boolean; isAnswer?: boolean; isHidden?: boolean };

function changesOf(change: Marks, time: number): SQL[] {
  const changes: SQL[] = [];
  if (change.isPinned !== undefined) {
    changes.push(sql`is_pinned = ${change.isPinned}`);
  }
  if (change.isAnswer !== undefined) {
    changes.push(sql`is_answer = ${change.isAnswer}`);
  }
  if (change.isHidden !== undefined) {
    changes.push(
      change.isHidden
        ? sql`hidden_at = coalesce(hidden_at, ${date(time)}), hidden_by = app.user_id()`
        : sql`hidden_at = null, hidden_by = null`,
    );
  }
  return changes;
}

const mark = (db: Db, spaceId: string, id: string, change: Marks, time: number) =>
  attempt(db, async () => {
    const where = sql`id = ${id} and space_id = ${spaceId} and deleted_at is null`;
    if (change.isAnswer) {
      // One answer per post: the one marked before steps down.
      await db.execute(
        sql`update community_posts set is_answer = false where is_answer and id <> ${id} and parent_id = (select parent_id from community_posts where ${where})`,
      );
    }
    const updated = await db.execute(
      sql`update community_posts set ${sql.join(changesOf(change, time), sql`, `)} where ${where} returning id`,
    );
    if (updated.rows.length === 0) {
      return fail("not_found");
    }
    // Shown again by a creator: what was reported is reviewed.
    if (change.isHidden === false) {
      await resolveReports(db, id, time);
    }
    return ok(undefined);
  });

const remove = (db: Db, spaceId: string, id: string, authorId: string, time: number) =>
  attempt(db, async () => {
    const updated = await db.execute(
      sql`update community_posts set deleted_at = ${date(time)}, body = null, author_name = '' where id = ${id} and space_id = ${spaceId} and author_id = ${authorId} and deleted_at is null returning id`,
    );
    return updated.rows.length === 0 ? fail("not_found") : ok(undefined);
  });

/** An insert or a delete of one's own row, whatever the database refuses as a result. */
const toggle = (db: Db, on: boolean, insert: SQL, drop: SQL) =>
  attempt(db, async () => {
    await db.execute(on ? sql`${insert} on conflict do nothing` : drop);
    return ok(undefined);
  });

async function feed(db: Db, { before, limit }: Paging) {
  // Row-level security leaves the routes one is enrolled in, one's own spaces, and the creators'
  // posts in the spaces one follows. Nothing hidden or deleted is news.
  const posts = await readItems(db)(
    sql`select ${ITEM} from community_posts as post where post.parent_id is null and post.hidden_at is null and post.deleted_at is null and ${NOT_BLOCKED} and ${after(before)} order by post.created_at desc, post.id desc limit ${limit + 1}`,
  );
  const shown = page(posts, limit);
  const ids = [...new Set(shown.items.map((post) => post.routeId))];
  const titles =
    ids.length === 0
      ? []
      : ((
          await db.execute(
            sql`select route_id, title from app.published_route_titles(${uuids(ids)})`,
          )
        ).rows as { route_id: string; title: LocalizedText }[]);
  const titleOf = new Map(titles.map((row) => [row.route_id, row.title]));
  const items: FeedItem[] = shown.items.map((post) => ({
    ...post,
    routeTitle: titleOf.get(post.routeId) ?? null,
  }));
  return { items, next: shown.next };
}

export const communityRepo = (db: Db): Community => ({
  thread: (spaceId, routeId, _viewerId, paging) => thread(db, spaceId, routeId, paging),
  item: (spaceId, routeId, id, _viewerId) => item(db, spaceId, routeId, id),
  countSince: (userId, what, since) => countSince(db, userId, what, since),
  add: (spaceId, row, time) => add(db, spaceId, row, time),
  mark: (spaceId, id, change, time) => mark(db, spaceId, id, change, time),
  remove: (spaceId, id, authorId, time) => remove(db, spaceId, id, authorId, time),
  useful: (spaceId, postId, userId, on) =>
    toggle(
      db,
      on,
      sql`insert into community_reactions (post_id, space_id, user_id) values (${postId}, ${spaceId}, ${userId})`,
      sql`delete from community_reactions where post_id = ${postId} and user_id = ${userId}`,
    ),
  report: (spaceId, postId, userId, reason) =>
    attempt(db, async () => {
      await db.execute(
        sql`insert into community_reports (post_id, space_id, user_id, reason) values (${postId}, ${spaceId}, ${userId}, ${reason})`,
      );
      return ok(undefined);
    }),
  isBanned: async (userId) =>
    (await db.execute(sql`select 1 from community_bans where user_id = ${userId}`)).rows.length > 0,
  follow: (spaceId, userId, on) =>
    toggle(
      db,
      on,
      sql`insert into community_follows (user_id, space_id) values (${userId}, ${spaceId})`,
      sql`delete from community_follows where user_id = ${userId} and space_id = ${spaceId}`,
    ),
  block: (userId, blockedId, on) =>
    toggle(
      db,
      on,
      sql`insert into community_blocks (user_id, blocked_user_id) values (${userId}, ${blockedId})`,
      sql`delete from community_blocks where user_id = ${userId} and blocked_user_id = ${blockedId}`,
    ),
  feed: (_userId, paging) => feed(db, paging),
  ...accountRepo(db),
});
