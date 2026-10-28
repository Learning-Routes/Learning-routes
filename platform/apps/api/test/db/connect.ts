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
