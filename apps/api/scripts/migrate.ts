// pnpm db:migrate (Platform STEP 2 §1.5): applies drizzle/'s migrations in their
// journal's order, as the migrator, over a direct connection, never through
// Hyperdrive. Forward-only: an applied migration is never run again or undone.
// Each file runs in one transaction with lock and statement timeouts, unless its
// first line is "-- no-transaction" (for CREATE INDEX CONCURRENTLY).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const TIMEOUTS = { lock: "5s", statement: "5min" } as const;

const BREAKPOINT = "--> statement-breakpoint";
const NO_TRANSACTION = "-- no-transaction";
const TAG = /^\d{4}_[a-z0-9_]+$/;
// One run at a time, across machines: an advisory lock on a fixed key. A second run
// fails at once rather than queueing behind a hung one.
export const LOCK_KEY = 4_602_010;

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";

/** The statements that apply one migration file, in order. */
export function plan(tag: string, sql: string): string[] {
  if (!TAG.test(tag)) {
    throw new Error(`not a migration tag: ${tag}`);
  }
  const statements = sql
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
  const record = `insert into meta.migrations (tag) values ('${tag}')`;
  if (sql.startsWith(NO_TRANSACTION)) {
    // Outside a transaction a failure after the first statement would leave it
    // applied but unrecorded, and every later run would repeat it and fail.
    if (statements.length !== 1) {
      throw new Error(`${tag}: a -- no-transaction migration holds exactly one statement`);
    }
    return [
      `set lock_timeout = '${TIMEOUTS.lock}'`,
      `set statement_timeout = '${TIMEOUTS.statement}'`,
      ...statements,
      record,
    ];
  }
  return [
    "begin",
    `set local lock_timeout = '${TIMEOUTS.lock}'`,
    `set local statement_timeout = '${TIMEOUTS.statement}'`,
    ...statements,
    record,
    "commit",
  ];
}

interface Journal {
  entries: { tag: string }[];
}

/** Applies every migration not yet applied; returns their tags. */
export async function migrate(url: string, dir: URL): Promise<string[]> {
  const folder = new URL(dir.href.endsWith("/") ? dir.href : `${dir.href}/`);
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", folder), "utf8"),
  ) as Journal;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [LOCK_KEY],
    );
    if (!rows[0]?.locked) {
      throw new Error("another migration is running; try again when it finishes");
    }
    await client.query("create schema if not exists meta");
    await client.query(
      "create table if not exists meta.migrations (tag text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (await client.query<{ tag: string }>("select tag from meta.migrations")).rows.map(
        (row) => row.tag,
      ),
    );
    const applied: string[] = [];
    for (const { tag } of journal.entries) {
      if (done.has(tag)) {
        continue;
      }
      await apply(client, plan(tag, readFileSync(new URL(`${tag}.sql`, folder), "utf8")));
      applied.push(tag);
    }
    return applied;
  } finally {
    await client.end();
  }
}

async function apply(client: pg.Client, statements: string[]): Promise<void> {
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
  } catch (error) {
    if (statements[0] === "begin") {
      await client.query("rollback");
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const applied = await migrate(
    process.env.DATABASE_URL_MIGRATOR ?? LOCAL,
    new URL("../drizzle/", import.meta.url),
  );
  console.log(JSON.stringify({ message: "migrations applied", applied }));
}
