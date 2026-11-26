// Taking a route or a whole space out of sight, run as the migrator. Nothing is deleted: the row's
// archived_at is set, which the public reads already honour (a retired space answers 410, a
// retired route 404, and neither is listed), and --restore empties it again. The edge keeps a page
// for at most five minutes.
//
//   pnpm db:retire route <space-slug>/<route-slug> [more…]      what it would do
//   pnpm db:retire space <space-slug> [more…] --apply            do it
//   pnpm db:retire route <space-slug>/<route-slug> --restore --apply
//
// A learner already enrolled keeps the route in their list: their version is theirs. For a route
// that was only ever a test, --close-enrollments also ends its active enrollments (their progress
// stays). --restore does not reopen them.
import { fileURLToPath } from "node:url";
import pg from "pg";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";

export type Kind = "route" | "space";

export interface Change {
  kind: Kind;
  name: string;
  /** done: the row changed. already: it was in that state. missing: no such row. */
  outcome: "done" | "already" | "missing";
}

interface How {
  isRestore?: boolean;
  /** Also end the active enrollments of what is retired. */
  closes?: boolean;
}

async function retireOne(db: pg.Client, kind: Kind, name: string, how: How) {
  const { isRestore = false, closes = false } = how;
  const [spaceSlug = "", routeSlug = ""] = name.split("/");
  const found =
    kind === "space"
      ? await db.query<{ id: string; archived: boolean }>(
          "select id, archived_at is not null as archived from spaces where slug = $1 for update",
          [spaceSlug],
        )
      : await db.query<{ id: string; archived: boolean }>(
          `select routes.id, routes.archived_at is not null as archived
             from routes join spaces on spaces.id = routes.space_id
            where spaces.slug = $1 and routes.slug = $2
              for update of routes`,
          [spaceSlug, routeSlug],
        );
  const row = found.rows[0];
  if (row === undefined) {
    return "missing" as const;
  }
  if (row.archived !== isRestore) {
    return "already" as const;
  }
  const table = kind === "space" ? "spaces" : "routes";
  await db.query(
    `update ${table} set archived_at = ${isRestore ? "null" : "now()"}, updated_at = now() where id = $1`,
    [row.id],
  );
  if (closes && !isRestore) {
    await db.query(
      `update enrollments set status = 'expired', updated_at = now()
        where status = 'active' and ${kind === "space" ? "space_id" : "route_id"} = $1`,
      [row.id],
    );
  }
  return "done" as const;
}

/** Retires (or restores) each name inside the caller's transaction, and says what happened. */
export async function retire(
  db: pg.Client,
  kind: Kind,
  names: string[],
  how: How = {},
): Promise<Change[]> {
  const changes: Change[] = [];
  for (const name of names) {
    changes.push({ kind, name, outcome: await retireOne(db, kind, name, how) });
  }
  return changes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, ...rest] = process.argv.slice(2);
  const names = rest.filter((word) => !word.startsWith("--"));
  if ((kind !== "route" && kind !== "space") || names.length === 0) {
    throw new Error(
      "usage: db:retire route|space <name>… [--restore] [--close-enrollments] [--apply]",
    );
  }
  const isApplied = rest.includes("--apply");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR ?? LOCAL });
  await client.connect();
  try {
    await client.query("begin");
    const changes = await retire(client, kind, names, {
      isRestore: rest.includes("--restore"),
      closes: rest.includes("--close-enrollments"),
    });
    // Without --apply it is a rehearsal: the same checks, and nothing kept.
    await client.query(isApplied ? "commit" : "rollback");
    console.log(JSON.stringify({ message: isApplied ? "applied" : "rehearsal", changes }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
