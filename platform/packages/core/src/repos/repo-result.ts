/**
 * not_found: no such row for this caller. conflict: a stale revision or a taken
 * unique value. position_taken: a live sibling already holds that position key,
 * so the caller needs a new key, not a fresh read. invalid: the database refused
 * the value.
 */
export type RepoError = "not_found" | "conflict" | "position_taken" | "invalid";
export type RepoResult<T> = { ok: true; value: T } | { ok: false; error: RepoError };
