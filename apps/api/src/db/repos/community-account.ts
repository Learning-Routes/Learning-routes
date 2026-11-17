import type {
  Community,
  CommunityNotification,
  Cursor,
  ModerationDecision,
  OpenReport,
  ReportReason,
} from "@learning-routes/core/repos/community-ports";
import { sql } from "drizzle-orm";
import { at, ITEM, type ItemRow, itemOf, page, resolveReports, uuids } from "./community-rows";
import { attempt, type Db, date, fail, ok } from "./shared";

// One's own side of the community on Postgres (Platform STEP 17): notifications and how one
// appears, and the operator's review of what people reported. Row-level security shows each
// person only their own notifications and profile, and the reports only to the operator.

type Account = Pick<
  Community,
  "notifications" | "markRead" | "profile" | "setProfile" | "openReports" | "moderate"
>;

interface NotificationRow {
  id: string;
  kind: CommunityNotification["kind"];
  space_id: string;
  route_id: string;
  post_id: string;
  created_at: string;
  read_at: string | null;
}

async function notifications(db: Db, userId: string, before: Cursor | null, limit: number) {
  const cursor =
    before === null
      ? sql`true`
      : sql`(date_trunc('milliseconds', note.created_at), note.id) < (${date(before.at)}::timestamptz, ${before.id}::uuid)`;
  const found = (
    await db.execute(
      sql`select note.id, note.kind, note.space_id, post.route_id, note.post_id, note.created_at, note.read_at from notifications as note join community_posts as post on post.id = note.post_id where note.user_id = ${userId} and ${cursor} order by note.created_at desc, note.id desc limit ${limit + 1}`,
    )
  ).rows as unknown as NotificationRow[];
  const shown = page(
    found.map((row) => ({
      id: row.id,
      kind: row.kind,
      spaceId: row.space_id,
      routeId: row.route_id,
      postId: row.post_id,
      createdAt: at(row.created_at),
      readAt: row.read_at === null ? null : at(row.read_at),
    })),
    limit,
  );
  const [unread] = (
    await db.execute(
      sql`select count(*)::integer as n from notifications where user_id = ${userId} and read_at is null`,
    )
  ).rows as { n: number }[];
  return { ...shown, unread: unread?.n ?? 0 };
}

async function profile(db: Db, userId: string) {
  const [row] = (
    await db.execute(
      sql`select display_name, is_sharing_milestones from user_profiles where user_id = ${userId}`,
    )
  ).rows as { display_name: string | null; is_sharing_milestones: boolean }[];
  return {
    displayName: row?.display_name ?? null,
    sharesMilestones: row?.is_sharing_milestones ?? false,
  };
}

async function setProfile(
  db: Db,
  userId: string,
  change: { displayName?: string | null; sharesMilestones?: boolean },
) {
  const name = change.displayName !== undefined;
  const sharing = change.sharesMilestones !== undefined;
  await db.execute(
    sql`insert into user_profiles (user_id, display_name, is_sharing_milestones) values (${userId}, ${change.displayName ?? null}, ${change.sharesMilestones ?? false}) on conflict (user_id) do update set display_name = case when ${name} then excluded.display_name else user_profiles.display_name end, is_sharing_milestones = case when ${sharing} then excluded.is_sharing_milestones else user_profiles.is_sharing_milestones end, updated_at = now()`,
  );
}

async function openReports(db: Db): Promise<OpenReport[]> {
  const found = (
    await db.execute(
      sql`select ${ITEM}, array_agg(distinct report.reason) as reasons, count(*)::integer as reports, min(report.created_at) as first_at from community_reports as report join community_posts as post on post.id = report.post_id where report.resolved_at is null group by post.id order by min(report.created_at)`,
    )
  ).rows as unknown as (ItemRow & { reasons: ReportReason[]; reports: number; first_at: string })[];
  return found.map((row) => ({
    postId: row.id,
    spaceId: row.space_id,
    routeId: row.route_id,
    item: itemOf(row),
    reasons: row.reasons,
    reports: row.reports,
    firstAt: at(row.first_at),
  }));
}

const moderate = (
  db: Db,
  postId: string,
  decision: ModerationDecision,
  operatorId: string,
  time: number,
) =>
  attempt(db, async () => {
    const updated = await db.execute(
      decision === "restore"
        ? sql`update community_posts set hidden_at = null, hidden_by = null where id = ${postId} returning author_id`
        : sql`update community_posts set hidden_at = coalesce(hidden_at, ${date(time)}), hidden_by = ${operatorId} where id = ${postId} returning author_id`,
    );
    const [post] = updated.rows as { author_id: string | null }[];
    if (!post) {
      return fail("not_found");
    }
    if (decision === "ban" && post.author_id !== null) {
      await db.execute(
        sql`insert into community_bans (user_id, banned_by) values (${post.author_id}, ${operatorId}) on conflict do nothing`,
      );
    }
    await resolveReports(db, postId, time);
    return ok(undefined);
  });

export const accountRepo = (db: Db): Account => ({
  notifications: (userId, { before, limit }) => notifications(db, userId, before, limit),
  markRead: async (userId, ids, time) => {
    await db.execute(
      sql`update notifications set read_at = ${date(time)} where user_id = ${userId} and read_at is null and (${ids === null} or id = any (${uuids(ids ?? [])}))`,
    );
  },
  profile: (userId) => profile(db, userId),
  setProfile: (userId, change) => setProfile(db, userId, change),
  openReports: () => openReports(db),
  moderate: (postId, decision, operatorId, time) =>
    moderate(db, postId, decision, operatorId, time),
});
