import type { LocalizedText } from "../localized-text";
import type { RepoResult } from "./repo-result";

// A route's community (Platform STEP 17): posts, one level of replies, a "useful" mark,
// following a creator's space, blocks, reports and in-app notifications. Row-level security holds
// who reads and writes each row; these ports say what the actions ask for.

export const POST_KINDS = ["question", "win", "note"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const REPORT_REASONS = ["spam", "abuse", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const NOTIFICATION_KINDS = ["reply", "answer", "pinned"] as const;

/** A post or a reply as its reader may see it. Never an email: a name, and its initial. */
export interface CommunityItem {
  id: string;
  spaceId: string;
  routeId: string;
  parentId: string | null;
  /** null for a reply; "milestone" for a learner's shared progress. */
  kind: PostKind | "milestone" | null;
  /** The topic a post points to: a lesson's id in the route. */
  lessonId: string | null;
  /** A milestone's finished module, from 1. */
  moduleNumber: number | null;
  /** null once deleted, or for a milestone. */
  body: string | null;
  /** null once the author erased their account. */
  authorId: string | null;
  /** The display name the author had when writing; "" once deleted. */
  authorName: string;
  byCreator: boolean;
  isPinned: boolean;
  isAnswer: boolean;
  /** Shown only to its author and the route's creators, marked as hidden. */
  isHidden: boolean;
  isDeleted: boolean;
  usefulCount: number;
  markedUseful: boolean;
  createdAt: number;
}

/** A feed's post, with its route's published title: public, as on the route's own page. */
export type FeedItem = CommunityItem & { routeTitle: LocalizedText | null };

export interface NewCommunityItem {
  routeId: string;
  parentId: string | null;
  kind: PostKind | "milestone" | null;
  lessonId: string | null;
  moduleNumber: number | null;
  body: string | null;
  authorId: string;
  authorName: string;
  byCreator: boolean;
}

/** Newest first: an item's time and id, so equal times keep one order. */
export interface Cursor {
  at: number;
  id: string;
}

export interface Page<T> {
  items: T[];
  next: Cursor | null;
}

export interface CommunityNotification {
  id: string;
  kind: (typeof NOTIFICATION_KINDS)[number];
  spaceId: string;
  routeId: string;
  postId: string;
  createdAt: number;
  readAt: number | null;
}

export interface OpenReport {
  postId: string;
  spaceId: string;
  routeId: string;
  item: CommunityItem;
  reasons: ReportReason[];
  reports: number;
  firstAt: number;
}

export type ModerationDecision = "hide" | "restore" | "ban";

export interface Community {
  /** A route's posts with their replies: pinned ones on the first page, then newest first. */
  thread(
    spaceId: string,
    routeId: string,
    viewerId: string,
    page: { before: Cursor | null; limit: number },
  ): Promise<
    { pinned: (CommunityItem & { replies: CommunityItem[] })[] } & Page<
      CommunityItem & { replies: CommunityItem[] }
    >
  >;
  /** One post or reply in the route, as the viewer may see it. */
  item(
    spaceId: string,
    routeId: string,
    id: string,
    viewerId: string,
  ): Promise<CommunityItem | null>;
  /** What the author wrote since a time: posts, replies or reports. Holds the author's write lock
   * until the action ends, so two writes at once cannot both take the last place. */
  countSince(userId: string, what: "post" | "reply" | "report", since: number): Promise<number>;
  /** not_found when the reply's post is gone or its author blocked the replier. */
  add(spaceId: string, item: NewCommunityItem, at: number): Promise<RepoResult<CommunityItem>>;
  /** A creator's marks. not_found outside the route. */
  mark(
    spaceId: string,
    id: string,
    change: { isPinned?: boolean; isAnswer?: boolean; isHidden?: boolean },
    at: number,
  ): Promise<RepoResult<void>>;
  /** The author's own; its replies stay. */
  remove(spaceId: string, id: string, authorId: string, at: number): Promise<RepoResult<void>>;
  useful(spaceId: string, postId: string, userId: string, on: boolean): Promise<RepoResult<void>>;
  /** conflict when this person already reported it. */
  report(
    spaceId: string,
    postId: string,
    userId: string,
    reason: ReportReason,
  ): Promise<RepoResult<void>>;
  isBanned(userId: string): Promise<boolean>;
  /** not_found for a space nobody may follow. */
  follow(spaceId: string, userId: string, on: boolean): Promise<RepoResult<void>>;
  block(userId: string, blockedId: string, on: boolean): Promise<RepoResult<void>>;
  /** The routes one is enrolled in and the spaces one follows, newest first. */
  feed(userId: string, page: { before: Cursor | null; limit: number }): Promise<Page<FeedItem>>;
  notifications(
    userId: string,
    page: { before: Cursor | null; limit: number },
  ): Promise<Page<CommunityNotification> & { unread: number }>;
  /** All of one's own, or those named. */
  markRead(userId: string, ids: string[] | null, at: number): Promise<void>;
  profile(userId: string): Promise<{ displayName: string | null; sharesMilestones: boolean }>;
  setProfile(
    userId: string,
    change: { displayName?: string | null; sharesMilestones?: boolean },
  ): Promise<void>;
  /** The operator's list: items with open reports, oldest first. */
  openReports(): Promise<OpenReport[]>;
  /** The operator's answer: the reports close, and the author may be banned. */
  moderate(
    postId: string,
    decision: ModerationDecision,
    operatorId: string,
    at: number,
  ): Promise<RepoResult<void>>;
}
