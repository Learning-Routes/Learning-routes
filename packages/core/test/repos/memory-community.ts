import type {
  Community,
  CommunityItem,
  CommunityNotification,
  Cursor,
  ReportReason,
} from "../../src/repos/community-ports";
import type { RepoResult } from "../../src/repos/repo-result";

// The community's repository in memory (Platform STEP 17), for core's action tests. It keeps
// the rules row-level security and the triggers hold in Postgres where an action relies on them:
// hidden items only for their author and the route's creators, blocks, three reports hiding an
// item, notifications. test/db/community.test.ts holds the real ones.

type Row = Omit<CommunityItem, "usefulCount" | "markedUseful" | "isHidden" | "isDeleted"> & {
  hiddenAt: number | null;
  deletedAt: number | null;
};

export function communityState() {
  return {
    items: new Map<string, Row>(),
    useful: new Set<string>(),
    reports: new Map<
      string,
      { postId: string; userId: string; reason: ReportReason; open: boolean; at: number }
    >(),
    follows: new Set<string>(),
    blocks: new Set<string>(),
    bans: new Set<string>(),
    notifications: new Map<string, CommunityNotification & { userId: string }>(),
    profiles: new Map<string, { displayName: string | null; sharesMilestones: boolean }>(),
    /** Spaces anyone may follow. */
    liveSpaces: new Set<string>(),
    /** Who may read each route's community: enrolled people and its creators. */
    readers: new Map<string, Set<string>>(),
    creators: new Map<string, Set<string>>(),
    clock: 0,
  };
}
type State = ReturnType<typeof communityState>;

const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
const fail = (error: "not_found" | "conflict" | "invalid") => ({ ok: false, error }) as const;
const newer = (a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) =>
  b.createdAt - a.createdAt || (b.id < a.id ? -1 : 1);
const before = (cursor: Cursor | null) => (row: { createdAt: number; id: string }) =>
  cursor === null ||
  row.createdAt < cursor.at ||
  (row.createdAt === cursor.at && row.id < cursor.id);

export function memoryCommunity(state: State, newId: () => string): Community {
  const isCreator = (routeId: string, userId: string) =>
    state.creators.get(routeId)?.has(userId) ?? false;
  const reads = (routeId: string, userId: string) =>
    isCreator(routeId, userId) || (state.readers.get(routeId)?.has(userId) ?? false);
  const visible = (row: Row, viewer: string) =>
    reads(row.routeId, viewer) &&
    (row.hiddenAt === null || row.authorId === viewer || isCreator(row.routeId, viewer));
  const shown = (row: Row, viewer: string): CommunityItem => ({
    ...row,
    body: row.deletedAt === null ? row.body : null,
    authorName: row.deletedAt === null ? row.authorName : "",
    isHidden: row.hiddenAt !== null,
    isDeleted: row.deletedAt !== null,
    usefulCount: [...state.useful].filter((key) => key.startsWith(`${row.id}:`)).length,
    markedUseful: state.useful.has(`${row.id}:${viewer}`),
  });
  const notify = (userId: string | null, kind: CommunityNotification["kind"], row: Row) => {
    if (userId === null) {
      return;
    }
    const id = newId();
    state.notifications.set(id, {
      id,
      userId,
      kind,
      spaceId: row.spaceId,
      routeId: row.routeId,
      postId: row.parentId ?? row.id,
      createdAt: state.clock,
      readAt: null,
    });
  };
  const notifyMarks = (row: Row, change: { isPinned?: boolean; isAnswer?: boolean }) => {
    if (change.isPinned && !row.isPinned) {
      notify(row.authorId, "pinned", row);
    }
    if (change.isAnswer && !row.isAnswer) {
      notify(row.authorId, "answer", row);
    }
  };
  const closeReports = (postId: string) => {
    for (const report of state.reports.values()) {
      if (report.postId === postId) {
        report.open = false;
      }
    }
  };
  const blocked = (viewer: string) => (row: Row) =>
    row.authorId === null || !state.blocks.has(`${viewer}:${row.authorId}`);

  return {
    async thread(spaceId, routeId, viewer, page) {
      const rows = [...state.items.values()].filter(
        (r) =>
          r.spaceId === spaceId &&
          r.routeId === routeId &&
          visible(r, viewer) &&
          blocked(viewer)(r),
      );
      const withReplies = (post: Row) => ({
        ...shown(post, viewer),
        replies: rows
          .filter((r) => r.parentId === post.id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((r) => shown(r, viewer)),
      });
      const posts = rows.filter((r) => r.parentId === null).sort(newer);
      const rest = posts.filter((p) => !p.isPinned).filter(before(page.before));
      const items = rest.slice(0, page.limit).map(withReplies);
      const last = items.at(-1);
      return {
        pinned: page.before === null ? posts.filter((p) => p.isPinned).map(withReplies) : [],
        items,
        next: rest.length > page.limit && last ? { at: last.createdAt, id: last.id } : null,
      };
    },
    async item(spaceId, routeId, id, viewer) {
      const row = state.items.get(id);
      return row && row.spaceId === spaceId && row.routeId === routeId && visible(row, viewer)
        ? shown(row, viewer)
        : null;
    },
    async countSince(userId, what, since) {
      if (what === "report") {
        return [...state.reports.values()].filter((r) => r.userId === userId && r.at >= since)
          .length;
      }
      return [...state.items.values()].filter(
        (r) =>
          r.authorId === userId &&
          r.createdAt >= since &&
          r.kind !== "milestone" &&
          (what === "reply") === (r.parentId !== null),
      ).length;
    },
    async add(spaceId, item, at) {
      state.clock = at;
      const parent = item.parentId ? state.items.get(item.parentId) : undefined;
      if (item.parentId && (!parent || state.blocks.has(`${parent.authorId}:${item.authorId}`))) {
        return fail("not_found");
      }
      if (item.kind === "milestone" && !state.profiles.get(item.authorId)?.sharesMilestones) {
        return fail("not_found");
      }
      const row: Row = {
        ...item,
        id: newId(),
        spaceId,
        isPinned: false,
        isAnswer: false,
        createdAt: at,
        hiddenAt: null,
        deletedAt: null,
      };
      state.items.set(row.id, row);
      if (parent && parent.authorId !== item.authorId) {
        notify(parent.authorId, "reply", row);
      }
      return ok(shown(row, item.authorId));
    },
    async mark(spaceId, id, change, at) {
      state.clock = at;
      const row = state.items.get(id);
      if (!row || row.spaceId !== spaceId) {
        return fail("not_found");
      }
      notifyMarks(row, change);
      row.isPinned = change.isPinned ?? row.isPinned;
      row.isAnswer = change.isAnswer ?? row.isAnswer;
      if (change.isHidden !== undefined) {
        row.hiddenAt = change.isHidden ? at : null;
      }
      if (change.isHidden === false) {
        closeReports(id);
      }
      return ok(undefined);
    },
    async remove(spaceId, id, authorId, at) {
      const row = state.items.get(id);
      if (!row || row.spaceId !== spaceId || row.authorId !== authorId) {
        return fail("not_found");
      }
      row.deletedAt = at;
      row.body = null;
      return ok(undefined);
    },
    async useful(_spaceId, postId, userId, on) {
      if (on) {
        state.useful.add(`${postId}:${userId}`);
      } else {
        state.useful.delete(`${postId}:${userId}`);
      }
      return ok(undefined);
    },
    async report(_spaceId, postId, userId, reason) {
      const key = `${postId}:${userId}`;
      if (state.reports.has(key)) {
        return fail("conflict");
      }
      state.reports.set(key, { postId, userId, reason, open: true, at: state.clock });
      const open = [...state.reports.values()].filter((r) => r.postId === postId && r.open);
      const row = state.items.get(postId);
      if (row && open.length >= 3 && row.hiddenAt === null) {
        row.hiddenAt = state.clock;
      }
      return ok(undefined);
    },
    async isBanned(userId) {
      return state.bans.has(userId);
    },
    async follow(spaceId, userId, on) {
      if (!state.liveSpaces.has(spaceId)) {
        return fail("not_found");
      }
      if (on) {
        state.follows.add(`${userId}:${spaceId}`);
      } else {
        state.follows.delete(`${userId}:${spaceId}`);
      }
      return ok(undefined);
    },
    async block(userId, blockedId, on) {
      if (on) {
        state.blocks.add(`${userId}:${blockedId}`);
      } else {
        state.blocks.delete(`${userId}:${blockedId}`);
      }
      return ok(undefined);
    },
    async feed(userId, page) {
      const rows = [...state.items.values()]
        .filter(
          (r) =>
            r.parentId === null &&
            r.deletedAt === null &&
            blocked(userId)(r) &&
            (visible(r, userId) ||
              (r.byCreator && r.hiddenAt === null && state.follows.has(`${userId}:${r.spaceId}`))),
        )
        .sort(newer)
        .filter(before(page.before));
      const items = rows
        .slice(0, page.limit)
        .map((r) => ({ ...shown(r, userId), routeTitle: null }));
      const last = items.at(-1);
      return {
        items,
        next: rows.length > page.limit && last ? { at: last.createdAt, id: last.id } : null,
      };
    },
    async notifications(userId, page) {
      const own = [...state.notifications.values()].filter((n) => n.userId === userId);
      const rows = own.sort(newer).filter(before(page.before));
      const items = rows.slice(0, page.limit).map(({ userId: _, ...n }) => n);
      const last = items.at(-1);
      return {
        items,
        next: rows.length > page.limit && last ? { at: last.createdAt, id: last.id } : null,
        unread: own.filter((n) => n.readAt === null).length,
      };
    },
    async markRead(userId, ids, at) {
      for (const n of state.notifications.values()) {
        if (n.userId === userId && n.readAt === null && (ids === null || ids.includes(n.id))) {
          n.readAt = at;
        }
      }
    },
    async profile(userId) {
      return state.profiles.get(userId) ?? { displayName: null, sharesMilestones: false };
    },
    async setProfile(userId, change) {
      state.profiles.set(userId, { ...(await this.profile(userId)), ...change });
    },
    async openReports() {
      return [];
    },
    async moderate(postId, decision) {
      const row = state.items.get(postId);
      if (!row) {
        return fail("not_found");
      }
      row.hiddenAt = decision === "restore" ? null : (row.hiddenAt ?? state.clock);
      if (decision === "ban" && row.authorId) {
        state.bans.add(row.authorId);
      }
      closeReports(postId);
      return ok(undefined);
    },
  };
}
