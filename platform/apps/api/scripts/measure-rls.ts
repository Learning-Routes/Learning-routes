// Measures row-level security once (Platform STEP 2 §3.10): one route read, with
// its modules, lessons and blocks, as the migrator (which bypasses RLS) and as
// lr_app under RLS, for a user who belongs to 50 spaces. Everything happens in one
// transaction that is rolled back. Not a CI gate: run it, read it, compare.
//
//   pnpm db:measure-rls
import pg from "pg";

const URL =
  process.env.DATABASE_URL_MIGRATOR ??
  "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const RUNS = 300;

const READ = [
  "select * from routes where id = $1",
  "select * from modules where route_id = $1 order by position",
  "select * from lessons where route_id = $1 order by module_id, position",
  "select b.* from blocks b join lessons l on l.id = b.lesson_id where l.route_id = $1 order by b.lesson_id, b.position",
];

async function seed(db: pg.Client) {
  const { rows: users } = await db.query(
    `insert into "user" (name, email) values ('Measure', 'measure-' || uuidv7() || '@example.com') returning id`,
  );
  const userId = users[0].id;
  const { rows: spaces } = await db.query(
    `insert into spaces (slug, name, default_locale, locales)
     select 'measure-' || uuidv7(), '{"en": "S"}', 'en', '{en}' from generate_series(1, 50) returning id`,
  );
  await db.query(
    "insert into memberships (space_id, user_id, role) select unnest($1::uuid[]), $2, 'owner'",
    [spaces.map((space) => space.id), userId],
  );
  const spaceId = spaces[0].id;
  const { rows: routes } = await db.query(
    `insert into routes (space_id, slug, title, source_locale, access, pricing)
     values ($1, 'measured', '{"en": "R"}', 'en', 'open', 'free') returning id`,
    [spaceId],
  );
  const routeId = routes[0].id;
  await db.query(
    `with m as (
       insert into modules (space_id, route_id, position, title)
       select $1, $2, lpad(i::text, 3, '0') || 'V', '{"en": "M"}' from generate_series(1, 10) i returning id
     ), l as (
       insert into lessons (space_id, route_id, module_id, position, title)
       select $1, $2, m.id, lpad(j::text, 3, '0') || 'V', '{"en": "L"}' from m, generate_series(1, 10) j returning id
     )
     insert into blocks (space_id, lesson_id, position, kind, data)
     select $1, l.id, lpad(k::text, 3, '0') || 'V', 'concept', '{"body": {"en": "text"}}' from l, generate_series(1, 10) k`,
    [spaceId, routeId],
  );
  return { userId, routeId };
}

async function time(db: pg.Client, routeId: string) {
  const samples: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now();
    for (const statement of READ) {
      await db.query(statement, [routeId]);
    }
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) => (samples[Math.floor(q * (samples.length - 1))] as number).toFixed(2);
  return { median_ms: at(0.5), p95_ms: at(0.95) };
}

const db = new pg.Client({ connectionString: URL });
await db.connect();
try {
  await db.query("begin");
  const { userId, routeId } = await seed(db);
  const { rows } = await db.query(READ[3] as string, [routeId]);
  // A first pass warms the caches, so neither measured pass pays for it.
  await time(db, routeId);
  const withoutRls = await time(db, routeId);
  await db.query("set local role lr_app");
  await db.query("select set_config('app.user_id', $1, true)", [userId]);
  const asApp = await db.query(READ[3] as string, [routeId]);
  const withRls = await time(db, routeId);
  console.log(
    JSON.stringify({
      message: "route read",
      blocks: rows.length,
      blocks_under_rls: asApp.rowCount,
      runs: RUNS,
      without_rls: withoutRls,
      with_rls: withRls,
    }),
  );
} finally {
  await db.query("rollback");
  await db.end();
}
