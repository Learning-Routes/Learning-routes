import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

// The request's database scope (Platform STEP 2 §1.6). A client is made per
// request, from Hyperdrive, and never kept in a module variable. The work runs in
// one transaction: load, a pure decide step in core, then the writes. withDb
// resolves only after the commit, so a response is never built on uncommitted
// data; only closing the client goes to ctx.waitUntil. No outside call (AI,
// email, payments) ever runs inside it: call out after withDb returns.

export type Transaction = Parameters<Parameters<ReturnType<typeof drizzle>["transaction"]>[0]>[0];

/** Runs fn in one transaction as userId (or nobody), and commits before resolving. */
export async function withDb<T>(
  env: Pick<Env, "DB">,
  ctx: Pick<ExecutionContext, "waitUntil">,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: env.DB.connectionString });
  try {
    await client.connect();
    return await drizzle(client, { casing: "snake_case" }).transaction(async (tx) => {
      // First statement, local to this transaction: RLS reads the acting user here,
      // and a pooled connection's next transaction starts with nobody.
      await tx.execute(sql`select set_config('app.user_id', ${userId ?? ""}, true)`);
      return fn(tx);
    });
  } finally {
    ctx.waitUntil(client.end());
  }
}

export type Database = NodePgDatabase;

/**
 * A client whose statements each commit on their own, for Better Auth only: it
 * expects that, catching a conflict on one statement and going on with the next,
 * which a transaction would refuse. Its tables have no row-level security, so it
 * sets no user. Closing the client goes to ctx.waitUntil, as in withDb.
 */
export async function withClient<T>(
  env: Pick<Env, "DB">,
  ctx: Pick<ExecutionContext, "waitUntil">,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: env.DB.connectionString });
  try {
    await client.connect();
    return await fn(drizzle(client, { casing: "snake_case" }));
  } finally {
    ctx.waitUntil(client.end());
  }
}
