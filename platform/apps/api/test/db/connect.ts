import pg from "pg";

// The local database from platform/docker-compose.yml. CI sets the same URLs; the
// passwords are fixed local-only values, never used anywhere else.
export const URLS = {
  app:
    process.env.DATABASE_URL_APP ??
    "postgres://lr_app:local-only-app@localhost:54318/learning_routes",
  migrator:
    process.env.DATABASE_URL_MIGRATOR ??
    "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes",
};

/** The auth secret every test uses: the API harness signs with it, user.erase keys with it. */
export const TEST_SECRET = "test-only-secret-0123456789abcdef0123456789abcdef";

/** Runs SQL on a fresh connection and returns the rows of its last statement. */
export async function query(url: string, sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(sql, values);
    // Several statements give one result each.
    return Array.isArray(result) ? (result.at(-1)?.rows ?? []) : result.rows;
  } finally {
    await client.end();
  }
}

/** Runs fn in a transaction that is always rolled back, so a test leaves nothing. */
export async function rolledBack<T>(
  url: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

/** Runs one statement under a savepoint: its error message, or null if it succeeded. */
export async function attempt(client: pg.Client, sql: string, values: unknown[] = []) {
  await client.query("savepoint attempt");
  try {
    await client.query(sql, values);
    await client.query("release savepoint attempt");
    return null;
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return (error as Error).message;
  }
}

/**
 * A new user, with an example.com address, inside the caller's transaction. The
 * address is random: test files run in parallel, and two open transactions
 * inserting the same unique value wait on each other, or deadlock.
 */
export async function newUser(client: pg.Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into "user" (name, email) values ('Test user', $1) returning id`,
    [`user-${crypto.randomUUID()}@example.com`],
  );
  return rows[0]?.id as string;
}

/** The backend pid of a connected client, to watch its locks. */
export async function backendPid(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  return rows[0]?.pid as number;
}

/**
 * Resolves once the backend `pid` waits on a lock, or `work` settles first: a
 * test that must interleave two transactions waits on pg_locks, never on a timer.
 */
export async function blockedOrDone(pid: number, work: Promise<unknown>): Promise<void> {
  let settled = false;
  work.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const deadline = Date.now() + 10_000;
  while (!settled) {
    const rows = await query(
      URLS.migrator,
      "select 1 from pg_locks where pid = $1 and not granted",
      [pid],
    );
    if (rows.length > 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`backend ${pid} neither waited on a lock nor finished`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * From here on, the transaction acts as the Worker: lr_app's privileges and
 * row-level security, as userId (or nobody), until reset role.
 */
export async function actAs(db: pg.Client, userId: string | null): Promise<void> {
  await db.query("set local role lr_app");
  await db.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);
}
