import type { Locale, LocalizedText } from "../localized-text";
import type { RepoResult } from "./repo-result";

// The catalog's listings and the applications to teach (Platform STEP 4 §2, §3, §6).

export interface CatalogListing {
  id: string;
  spaceId: string;
  routeId: string;
  status: "requested" | "approved" | "declined" | "withdrawn";
  note: string | null;
  decidedBy: string | null;
  decidedVersion: number | null;
  featuredPosition: number | null;
}

export interface CatalogDecision {
  status: "approved" | "declined";
  note: string | null;
  decidedBy: string;
  decidedVersion: number | null;
}

/** Row-level security holds who may do each: an owner asks and withdraws, an operator decides. */
export interface Catalog {
  /** conflict while the route has an active request or listing. */
  request(spaceId: string, routeId: string): Promise<RepoResult<{ listingId: string }>>;
  /** not_found with nothing active to withdraw. */
  withdraw(spaceId: string, routeId: string): Promise<RepoResult<void>>;
  /** An operator's read: a listing has no space until it is read. */
  get(listingId: string): Promise<RepoResult<CatalogListing>>;
  decide(listingId: string, decision: CatalogDecision): Promise<RepoResult<void>>;
  /** Everything an operator looks after: requests, oldest first, then what is listed. */
  queue(): Promise<CatalogQueueItem[]>;
  /** A position on the landing, 1 to 3, or null. conflict when another holds it. */
  feature(listingId: string, position: number | null): Promise<RepoResult<void>>;
}

export interface CatalogQueueItem extends CatalogListing {
  title: LocalizedText;
  sourceLocale: string;
  creator: LocalizedText;
  latestVersion: number | null;
}

export interface ApplicationRecord {
  id: string;
  name: string;
  email: string;
  teaches: string;
  link: string | null;
  locale: string;
  status: "new" | "invited";
}

/** Where an invitation's link stands: only the database can say. */
export type InvitationState = "ok" | "expired" | "used" | "unknown";

export interface InvitationPreview {
  state: InvitationState;
  email: string | null;
  name: string | null;
  locale: Locale | null;
}

export interface Invitations {
  /** Operators only; not_found for anyone else, or an application that can't be invited. */
  invite(input: {
    applicationId: string;
    tokenHash: string;
    expiresAt: number;
  }): Promise<RepoResult<{ applicationId: string; email: string; name: string; locale: Locale }>>;
  /** Anyone: holding the token is the permission. */
  preview(tokenHash: string): Promise<InvitationPreview>;
  /** The signed-in person's, if the address matches: conflict when the slug is taken. */
  accept(input: {
    tokenHash: string;
    slug: string;
  }): Promise<RepoResult<{ spaceId: string; slug: string }>>;
}

/** Operators only, held by row-level security. */
export interface Applications {
  /** Those not yet declined, oldest first. */
  list(): Promise<ApplicationRecord[]>;
  decide(id: string, status: "invited" | "declined"): Promise<RepoResult<void>>;
}
