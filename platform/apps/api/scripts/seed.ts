// The seed for English Unlimited (Platform STEP 2 §6), run as the migrator:
//
//   pnpm db:seed --owner <email> [--add-owner]
//
// It creates the space, its locales, its owner and one published sample route.
// It refuses unless the address belongs to a user who has signed in (a verified
// email), so the owner signs in once first; it refuses a second owner unless
// --add-owner is given; and running it again changes nothing. No address is
// written in the repository: it is given on the command line.

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { contentHash, snapshotOf } from "@learning-routes/core/content/snapshot";
import { newBlockId } from "@learning-routes/core/ids";
import type { RepoResult } from "@learning-routes/core/repos/ports";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgRepos } from "../src/db/repos/index";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const SLUG = "english-unlimited";
const SAMPLE = "primeros-pasos";

const newId = () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

/** A repository's value; the seed stops at the first refusal. */
function must<T>(result: RepoResult<T>, step: string): T {
  if (!result.ok) {
    throw new Error(`the seed could not ${step}: ${result.error}`);
  }
  return result.value;
}

async function verifiedUser(db: pg.Client, email: string): Promise<string> {
  const { rows } = await db.query(
    `select id from "user" where lower(email) = lower($1) and email_verified`,
    [email],
  );
  if (rows[0] === undefined) {
    throw new Error("no verified user with that address: the owner signs in once first");
  }
  return rows[0].id;
}

async function space(db: pg.Client): Promise<string> {
  const { rows } = await db.query(
    `insert into spaces (slug, name, default_locale, locales)
     values ($1, '{"es": "English Unlimited", "en": "English Unlimited"}', 'es', '{es,en}')
     on conflict (slug) do nothing returning id`,
    [SLUG],
  );
  return (
    rows[0]?.id ?? (await db.query("select id from spaces where slug = $1", [SLUG])).rows[0].id
  );
}

async function owner(db: pg.Client, spaceId: string, userId: string, addOwner: boolean) {
  const { rows } = await db.query(
    "select user_id from memberships where space_id = $1 and role = 'owner'",
    [spaceId],
  );
  if (rows.some((row) => row.user_id === userId)) {
    return;
  }
  if (rows.length > 0 && !addOwner) {
    throw new Error("the space already has another owner; pass --add-owner to add this one too");
  }
  await db.query(
    `insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')
     on conflict (space_id, user_id) do update set role = 'owner'`,
    [spaceId, userId],
  );
}

/** One sample route, built and published through the repositories, once. */
async function sampleRoute(db: pg.Client, spaceId: string, ownerId: string) {
  const repos = pgRepos(drizzle(db, { casing: "snake_case" }));
  if ((await repos.routeDrafts.list(spaceId)).some((route) => route.slug === SAMPLE)) {
    return;
  }
  const routeId = newId();
  const title = { es: "Primeros pasos", en: "First steps" };
  must(
    await repos.routeDrafts.create(spaceId, {
      id: routeId,
      slug: SAMPLE,
      title,
      description: null,
      sourceLocale: "es",
      access: "open",
      pricing: "free",
    }),
    "create the sample route",
  );
  const moduleId = newId();
  const lessonId = newId();
  must(
    await repos.routeDrafts.addModule(spaceId, routeId, 0, { id: moduleId, position: "V", title }),
    "add its module",
  );
  must(
    await repos.routeDrafts.addLesson(spaceId, routeId, 1, {
      id: lessonId,
      moduleId,
      position: "V",
      title: { es: "Hola", en: "Hello" },
    }),
    "add its lesson",
  );
  must(
    await repos.routeDrafts.addBlock(spaceId, routeId, 2, {
      id: newId(),
      lessonId,
      position: "V",
      kind: "concept",
      data: {
        title: { es: "Saludar", en: "Greeting" },
        body: { es: "Di «hello».", en: "Say hello." },
      },
    }),
    "add its block",
  );
  const snapshot = snapshotOf(
    must(await repos.routeDrafts.get(spaceId, routeId), "read the sample route back"),
  );
  must(
    await repos.routeVersions.append(spaceId, {
      routeId,
      version: 1,
      snapshot,
      contentHash: await contentHash(snapshot),
      publishedByUserId: ownerId,
    }),
    "publish it",
  );
  must(await repos.routeDrafts.markPublished(spaceId, routeId, 1), "mark it published");
}

/** Seeds inside the caller's transaction. */
export async function seed(db: pg.Client, options: { ownerEmail: string; addOwner?: boolean }) {
  const ownerId = await verifiedUser(db, options.ownerEmail);
  const spaceId = await space(db);
  await owner(db, spaceId, ownerId, options.addOwner ?? false);
  await sampleRoute(db, spaceId, ownerId);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { owner: { type: "string" }, "add-owner": { type: "boolean" } },
  });
  if (!values.owner) {
    throw new Error("usage: pnpm db:seed --owner <email> [--add-owner]");
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR ?? LOCAL });
  await client.connect();
  try {
    await client.query("begin");
    await seed(client, { ownerEmail: values.owner, addOwner: values["add-owner"] ?? false });
    await client.query("commit");
    console.log(JSON.stringify({ message: "seeded", space: SLUG }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
