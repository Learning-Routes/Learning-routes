// A one-off for production (Platform STEP 7 §5): makes one address the platform's operator and the
// owner of its first space. It runs once, by hand, as the migrator, and running it again changes
// nothing. The address comes from the Keychain or a prompt, never from a file or an argument, so
// it reaches no shell history, and it is never printed. If nobody has signed in with it yet, its
// account is made here, and the first sign-in with that address finds everything waiting.
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";

export interface Owner {
  email: string;
  name: string;
  slug: string;
  locale: string;
}

export async function bootstrapOwner(db: pg.ClientBase, owner: Owner) {
  const email = owner.email.trim().toLowerCase();
  await db.query("begin");
  try {
    const account = await db.query<{ id: string }>(
      `insert into "user" (email, name, email_verified) values ($1, '', true)
       on conflict (email) do update set email = excluded.email
       returning id`,
      [email],
    );
    const userId = account.rows[0]?.id;
    await db.query(
      `insert into platform_roles (user_id, is_operator) values ($1, true)
       on conflict (user_id) do update set is_operator = true`,
      [userId],
    );
    const created = await db.query<{ id: string }>(
      `insert into spaces (slug, name, default_locale, locales)
       values ($1, jsonb_build_object($3::text, $2::text), $3, array[$3])
       on conflict (slug) do nothing
       returning id`,
      [owner.slug, owner.name, owner.locale],
    );
    const space = await db.query<{ id: string }>("select id from spaces where slug = $1", [
      owner.slug,
    ]);
    await db.query(
      `insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')
       on conflict (space_id, user_id) do update set role = 'owner'`,
      [space.rows[0]?.id, userId],
    );
    await db.query("commit");
    return { spaceCreated: created.rows.length > 0 };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

function fromKeychain(service: string): string | null {
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      locale: { type: "string", default: "es" },
    },
  });
  const url = process.env.DATABASE_URL_MIGRATOR ?? fromKeychain("lr-migrator");
  if (!(url && values.name && values.slug)) {
    throw new Error("needs --name and --slug, and the migrator's URL in the lr-migrator item");
  }
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  const email = fromKeychain("lr-owner-email") ?? (await prompt.question("Owner's email: "));
  prompt.close();
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { spaceCreated } = await bootstrapOwner(db, {
      email,
      name: values.name,
      slug: values.slug,
      locale: values.locale ?? "es",
    });
    console.log(JSON.stringify({ message: "owner ready", spaceCreated, slug: values.slug }));
  } finally {
    await db.end();
  }
}
