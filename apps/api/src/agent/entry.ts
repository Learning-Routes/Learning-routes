import { isCreatorRole } from "@learning-routes/core/access";
import { CREATOR_REQUIRED } from "@learning-routes/core/copy/creator-required";
import { negotiateLocale } from "@learning-routes/core/locales";
import { pgTenancy } from "../db/tenancy";
import { type Database, transactionAs } from "../db/with-db";

// Who may open a space's assistant (Platform STEP 10 §1, STEP 14): an editor of that space. Someone
// who is a creator nowhere hears creator_required; a creator elsewhere gets 404, so the answer never
// tells whether a space exists.

export type Entry = "editor" | "creator_required" | "not_found";

export function entryOf(db: Database, userId: string, spaceId: string): Promise<Entry> {
  return transactionAs(db, userId, async (tx) => {
    const tenancy = pgTenancy(tx);
    const scope = await tenancy.scopeOf({ kind: "space", id: spaceId }, userId);
    if (isCreatorRole(scope?.role)) {
      return "editor";
    }
    return (await tenancy.isCreator(userId)) ? "not_found" : "creator_required";
  });
}

/** The refusal, in the language the request asks for. */
export function creatorRequired(request: Request): Response {
  const locale = negotiateLocale(request.headers.get("accept-language"));
  return Response.json(
    { ok: false, code: "creator_required", message: CREATOR_REQUIRED[locale] },
    { status: 403 },
  );
}
