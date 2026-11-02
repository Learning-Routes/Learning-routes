import type { RepoError, RepoResult } from "@learning-routes/core/repos/ports";
import { sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";

// What every Postgres repository shares (Platform STEP 2 §4): results, times, and
// the savepoints that let a refused write answer instead of aborting the request's
// transaction.

/** withDb's transaction, or a test's: lr_app under the acting user's RLS. */
export type Db = PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>;

export const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
export const fail = (error: RepoError) => ({ ok: false, error }) as const;

export const ms = (date: Date | null) => (date === null ? null : date.getTime());
export const date = (time: number | null) => (time === null ? null : new Date(time));

/** Postgres's error codes, mapped to the ports' refusals. */
const REFUSALS: Record<string, RepoError> = {
  "23505": "conflict", // unique_violation
  "23503": "not_found", // foreign_key_violation: the parent is not there
  "23514": "invalid", // check_violation
};
// insufficient_privilege is a refusal only when row-level security refused the
// row; a missing grant is a fault, and must fail loudly.
const RLS_REFUSAL = /row-level security/;

// A unique key on a parent and a position: the sibling's place is taken.
const POSITION_KEY = /_position_key$/;

function refusalOf(error: unknown): RepoError | undefined {
  const { name, code, message, cause } = error as {
    name?: string;
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string; constraint?: string };
  };
  // A stored value core's schemas refuse, such as a snapshot no upcast reads.
  if (name === "ZodError") {
    return "invalid";
  }
  const sqlstate = cause?.code ?? code;
  if (sqlstate === "42501") {
    return RLS_REFUSAL.test(cause?.message ?? message ?? "") ? "not_found" : undefined;
  }
  if (sqlstate === "23505" && POSITION_KEY.test(cause?.constraint ?? "")) {
    return "position_taken";
  }
  return REFUSALS[sqlstate ?? ""];
}

/**
 * Runs work under a savepoint: kept if it finishes, rolled back if it throws.
 * Nested savepoints may share the name: Postgres releases or rolls back the
 * innermost one with it, which is the one this call made.
 */
export async function underSavepoint<T>(db: Db, work: () => Promise<T>): Promise<T> {
  await db.execute(sql`savepoint unit`);
  try {
    const result = await work();
    await db.execute(sql`release savepoint unit`);
    return result;
  } catch (error) {
    // A savepoint survives its rollback; left alive, an outer rollback by this name stops here.
    await db.execute(sql`rollback to savepoint unit`);
    await db.execute(sql`release savepoint unit`);
    throw error;
  }
}

class Refused extends Error {
  constructor(readonly code: RepoError) {
    super(code);
  }
}

/** A write whose refusal, by the database or by the work, becomes a result; it undoes what it did. */
export async function attempt<T>(
  db: Db,
  work: () => Promise<RepoResult<T>>,
): Promise<RepoResult<T>> {
  try {
    return await underSavepoint(db, async () => {
      const result = await work();
      if (!result.ok) {
        throw new Refused(result.error);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof Refused) {
      return fail(error.code);
    }
    const refusal = refusalOf(error);
    if (refusal === undefined) {
      throw error;
    }
    return fail(refusal);
  }
}
