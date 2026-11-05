import type { ActorKind } from "../actions/actor";
import type { Snapshot } from "../content/snapshot";
import type { Enrollment, Progress, SpaceRole } from "../domain";
import type { Card } from "../learning/fsrs";
import type { Locale, LocalizedText } from "../localized-text";
import type { Member } from "../memberships";
import type { Applications, Catalog, Invitations } from "./catalog-ports";
import type { Connections, OwnSpace } from "./connection-ports";
import type { OwnEnrollment } from "./own-enrollment";
import type { RepoResult } from "./repo-result";
import type { RouteDetails } from "./route-details";

export type {
  ApplicationRecord,
  Applications,
  Catalog,
  CatalogDecision,
  CatalogListing,
  CatalogQueueItem,
  InvitationPreview,
  InvitationState,
  Invitations,
} from "./catalog-ports";

// The repositories, one port per aggregate (Platform STEP 2 §4). core still
// imports no database: the API implements these on Postgres, under the acting
// user's row-level security, and the tests use an in-memory twin. Both pass one
// contract suite. Every method takes the space and filters on it together with
// the id; none accepts a raw filter. Times are epoch milliseconds.

export type { RepoError, RepoResult } from "./repo-result";

export interface SpaceRecord {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: Locale;
  locales: Locale[];
  tagline: LocalizedText | null;
  bio: LocalizedText | null;
  brandColor: string | null;
}

/** What a creator's page says about them; a field left out stays as it is. */
export interface SpacePage {
  tagline?: LocalizedText | null | undefined;
  bio?: LocalizedText | null | undefined;
  brandColor?: string | null | undefined;
}

export interface NewSpace {
  name: string;
  slug: string;
  locale: Locale;
  ownerEmail: string;
}

export interface Spaces {
  get(spaceId: string): Promise<RepoResult<SpaceRecord>>;
  /** An operator's. invalid: nobody has signed in with the address. conflict: the slug is taken. */
  create(space: NewSpace): Promise<RepoResult<{ spaceId: string }>>;
  /** The spaces the user teaches in. */
  listOwn(userId: string): Promise<OwnSpace[]>;
  update(spaceId: string, page: SpacePage): Promise<RepoResult<void>>;
}

export interface Memberships {
  /** Members of the space, ordered by user id. */
  list(spaceId: string): Promise<Member[]>;
  /** conflict when the user already holds a role there. */
  add(spaceId: string, member: Member): Promise<RepoResult<void>>;
  roleOf(spaceId: string, userId: string): Promise<SpaceRole | null>;
}

type RouteFields = Snapshot["route"];
export type DraftModule = Snapshot["modules"][number];
export type DraftLesson = Snapshot["lessons"][number];
export type DraftBlock = Snapshot["blocks"][number];

/** A route's draft: its content in snapshot shape, ordered by position, and its revision. */
export interface RouteDraft extends Snapshot {
  spaceId: string;
  /** Bumped by every change; an edit names the revision it read. */
  revision: number;
  latestPublishedVersion: number | null;
}

export interface RouteSummary {
  id: string;
  slug: string;
  title: LocalizedText;
  revision: number;
  latestPublishedVersion: number | null;
}

/** An edit's answer: the draft's new revision. */
export type Revised = RepoResult<{ revision: number }>;

export interface RouteDrafts {
  /** conflict when the slug is taken in the space. */
  create(spaceId: string, route: RouteFields): Promise<Revised>;
  get(spaceId: string, routeId: string): Promise<RepoResult<RouteDraft>>;
  /** The space's routes, ordered by slug. */
  list(spaceId: string): Promise<RouteSummary[]>;
  /**
   * Locks the draft until the transaction ends, at the revision the caller read:
   * not_found without the route, conflict on a stale revision. An edit or a publish
   * that reads the draft afterwards reads what it locked.
   */
  lockDraft(spaceId: string, routeId: string, expectedRevision: number): Promise<RepoResult<void>>;
  /** Each add: not_found without its parent, conflict on a stale revision, position_taken on a live sibling's key. */
  addModule(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    module: DraftModule,
  ): Promise<Revised>;
  addLesson(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    lesson: DraftLesson,
  ): Promise<Revised>;
  addBlock(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    block: DraftBlock,
  ): Promise<Revised>;
  updateDetails(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    details: RouteDetails,
  ): Promise<Revised>;
  /** All of the draft's content, replaced in one edit that moves the revision once. */
  replaceContent(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    content: {
      details: RouteDetails;
      modules: DraftModule[];
      lessons: DraftLesson[];
      blocks: DraftBlock[];
    },
  ): Promise<Revised>;
  /** Takes a lesson out of the draft; its id stays reserved, and older versions keep it. */
  archiveLesson(
    spaceId: string,
    routeId: string,
    expectedRevision: number,
    lessonId: string,
  ): Promise<Revised>;
  /** not_found unless the version exists and is newer than the last, on a live route. */
  markPublished(spaceId: string, routeId: string, version: number): Promise<RepoResult<void>>;
}

export interface RouteVersion {
  routeId: string;
  version: number;
  snapshot: Snapshot;
  contentHash: string;
  publishedByUserId: string;
}

/** Read and append only: a version never changes. */
export interface RouteVersions {
  get(spaceId: string, routeId: string, version: number): Promise<RepoResult<RouteVersion>>;
  /** The highest published version of a route, or null when it has none. */
  latest(spaceId: string, routeId: string): Promise<number | null>;
  /** conflict when the version exists. */
  append(spaceId: string, version: RouteVersion): Promise<RepoResult<void>>;
}

export interface EnrollmentRecord {
  id: string;
  spaceId: string;
  routeId: string;
  userId: string;
  pinnedVersion: number;
  status: Enrollment["status"];
}

export interface Enrollments {
  get(spaceId: string, enrollmentId: string): Promise<RepoResult<EnrollmentRecord>>;
  /**
   * Enrolls the acting user (never anyone else) in a published, open route, as a student
   * unless they hold a role in its space: not_found for a route they cannot see, invalid
   * for a closed one they can. A paid route's module 1 is free, so a paid route enrolls;
   * paying for the rest is Platform STEP 9's.
   */
  enroll(routeId: string): Promise<RepoResult<{ enrollmentId: string; spaceId: string }>>;
  /**
   * Moves the acting user's own active enrollment to its route's latest published
   * version, never back: not_found for anyone else's, or a revoked one.
   */
  upgrade(spaceId: string, enrollmentId: string): Promise<RepoResult<{ pinnedVersion: number }>>;
  /** The acting user's own active enrollments, newest first, and whether they teach anywhere. */
  listOwn(userId: string): Promise<{ enrollments: OwnEnrollment[]; teaches: boolean }>;
}

export type { OwnEnrollment } from "./own-enrollment";

export interface ProgressRecord {
  enrollmentId: string;
  lessonId: string;
  status: Progress["status"];
  completedAt: number | null;
  blocks: Progress["blocks"];
}

export interface StoredCard {
  id: string;
  card: Card;
  dueAt: number | null;
}

export interface Learning {
  /** An enrollment's progress, ordered by lesson id. */
  progress(spaceId: string, enrollmentId: string): Promise<ProgressRecord[]>;
  saveProgress(spaceId: string, userId: string, record: ProgressRecord): Promise<RepoResult<void>>;
  card(spaceId: string, userId: string, itemId: string): Promise<StoredCard | null>;
  /**
   * The user's card for an item, locked until the transaction ends, so two reviews
   * of it take turns. A missing card is made new, never reset. not_found when the
   * user keeps that item's card in another space.
   */
  lockCard(spaceId: string, userId: string, itemId: string): Promise<RepoResult<StoredCard>>;
  saveCard(
    spaceId: string,
    userId: string,
    cardId: string,
    card: Card,
    dueAt: number,
  ): Promise<RepoResult<void>>;
}

export interface ReviewRecord {
  /** The client's idempotency key. */
  reviewId: string;
  cardId: string;
  rating: number;
  reviewedAt: number;
  elapsedMs: number;
  stateBefore: Card;
}

/**
 * Append only. A retry with the same reviewId gets the stored review back;
 * conflict when the user used that reviewId in another space; not_found when the
 * card is not the user's in this space.
 */
export interface Reviews {
  append(
    spaceId: string,
    userId: string,
    review: ReviewRecord,
  ): Promise<RepoResult<{ review: ReviewRecord; duplicate: boolean }>>;
}

export interface ActionLogEntry {
  actorUserId: string;
  actorVia: ActorKind;
  agentRunId: string | null;
  /** The OAuth client behind a call through the MCP. */
  oauthClientId?: string | null;
  action: string;
  /** Already redacted: no secrets, no free text. */
  input: unknown;
  outcome: string;
  routeRevision: number | null;
}

export interface ActionLog {
  /** not_found when the actor may not write in the space. Null: an operator's, in no space. */
  append(spaceId: string | null, entry: ActionLogEntry): Promise<RepoResult<void>>;
}

export type { ConnectionRecord, Connections, OwnSpace } from "./connection-ports";
export type { RouteDetails } from "./route-details";

export interface Repos {
  connections: Connections;
  spaces: Spaces;
  catalog: Catalog;
  applications: Applications;
  invitations: Invitations;
  memberships: Memberships;
  routeDrafts: RouteDrafts;
  routeVersions: RouteVersions;
  enrollments: Enrollments;
  learning: Learning;
  reviews: Reviews;
  actionLog: ActionLog;
  /** One unit of work: everything fn writes is kept together, or nothing is. */
  transaction<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
}
