import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";

// What the browser journey (STEP 11-prep §A2) checks behind the screen: one creator's writes in
// action_log, and the blocks of the route their space published. The local database only.

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const LOCAL_HOST = /@localhost:54318\//;

export async function journeyFacts(url: string, email: string) {
  if (!LOCAL_HOST.test(url)) {
    throw new Error("the journey's facts come only from the local database");
  }
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: spaces } = await db.query(
      `select membership.space_id from memberships membership
       join "user" person on person.id = membership.user_id
       where person.email = $1 and membership.role = 'owner'`,
      [email],
    );
    const spaceId = spaces[0]?.space_id as string | undefined;
    const { rows: writes } = await db.query(
      `select log.action, log.actor_via as via, log.space_id as "spaceId" from action_log log
       join "user" person on person.id = log.actor_user_id
       where person.email = $1 and log.outcome = 'ok' order by log.at`,
      [email],
    );
    const { rows: versions } = await db.query(
      `select version.snapshot from route_versions version where version.space_id = $1
       order by version.published_at desc limit 1`,
      [spaceId ?? null],
    );
    const snapshot = versions[0]?.snapshot as
      | { blocks: { kind: string; data: Record<string, unknown> }[] }
      | undefined;
    // A block's type is kept beside its data, as its kind.
    const blocks = (snapshot?.blocks ?? []).map((block) => ({ type: block.kind, ...block.data }));
    return { spaceId, writes, blocks };
  } finally {
    await db.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  if (!values.email) {
    throw new Error("give the creator's --email");
  }
  const url = process.env.DATABASE_URL_MIGRATOR ?? LOCAL;
  console.log(JSON.stringify(await journeyFacts(url, values.email)));
}
