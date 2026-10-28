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

let users = 0;
/** A new user, with an example.com address, inside the caller's transaction. */
export async function newUser(client: pg.Client): Promise<string> {
  users += 1;
  const { rows } = await client.query<{ id: string }>(
    `insert into "user" (name, email) values ('Test user', $1) returning id`,
    [`user-${Date.now()}-${users}@example.com`],
  );
  return rows[0]?.id as string;
}
