// user.erase (Platform STEP 2 §2.16): the one path that deletes a user, run as the
// migrator. Spaces and content are archived, never deleted; a user's own rows
// (profile, memberships, roles, enrollments, progress, cards, reviews, sessions
// and accounts) go, in one transaction. The action log and published versions
// keep the bare id, which then points at no one.
//
//   node scripts/erase-user.ts <user id>
import { fileURLToPath } from "node:url";
import pg from "pg";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";

/** Erases one user inside the caller's transaction. */
export async function eraseUser(db: pg.Client, userId: string): Promise<void> {
  // reviews are append-only; their rule lets this transaction remove this user's.
  await db.query("select set_config('app.erasing_user_id', $1, true)", [userId]);
  // progress restricts its enrollment's delete, so it goes first.
  await db.query("delete from progress where user_id = $1", [userId]);
  // Every other per-user row cascades from the user.
  const { rowCount } = await db.query(`delete from "user" where id = $1`, [userId]);
  if (rowCount !== 1) {
    throw new Error(`no such user: ${userId}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const userId = process.argv[2] ?? "";
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR ?? LOCAL });
  await client.connect();
  try {
    await client.query("begin");
    await eraseUser(client, userId);
    await client.query("commit");
    console.log(JSON.stringify({ message: "user erased", user_id: userId }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
