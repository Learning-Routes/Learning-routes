// user.erase (Platform STEP 2 §2.16): the one path that deletes a user, run as the
// migrator. Spaces and content are never deleted, and a space's last owner is
// never erased; a user's own rows
// (profile, memberships, roles, enrollments, progress, cards, reviews, sessions,
// accounts, pending sign-in links and the address's sign-in limit) go, in one transaction. The action log and published versions
// keep the bare id, which then points at no one.
//
//   BETTER_AUTH_SECRET=... node scripts/erase-user.ts <user id>
import { fileURLToPath } from "node:url";
import pg from "pg";
import { emailRateKey } from "../src/auth/rate-key";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";

/**
 * Erases one user inside the caller's transaction. authSecret is the API Worker's
 * BETTER_AUTH_SECRET: the per-address sign-in limit is keyed by an HMAC with it.
 */
export async function eraseUser(db: pg.Client, userId: string, authSecret: string): Promise<void> {
  // A space always keeps an owner: the last one hands it over before going. The
  // owner rows of the user's spaces are locked first, so a concurrent erase of a
  // co-owner waits here and then sees this one gone.
  await db.query(
    `select 1 from memberships
      where role = 'owner'
        and space_id in (select space_id from memberships where user_id = $1 and role = 'owner')
      order by space_id, user_id
        for update`,
    [userId],
  );
  const { rows: alone } = await db.query(
    `select space_id from memberships as mine
      where mine.user_id = $1 and mine.role = 'owner'
        and not exists (
          select 1 from memberships as other
           where other.space_id = mine.space_id and other.role = 'owner' and other.user_id <> mine.user_id
        )`,
    [userId],
  );
  if (alone.length > 0) {
    throw new Error(
      `the last owner of ${alone.length} space(s) cannot be erased; hand them over first`,
    );
  }
  // Lock the enrollments first, so a progress write in flight finishes before the
  // deletes, and its row goes with the rest.
  await db.query("select 1 from enrollments where user_id = $1 for update", [userId]);
  // The cards before the user, the order review.submit takes them: it holds its card
  // while its review's foreign key needs the user row, so the other order deadlocks.
  await db.query("select 1 from cards where user_id = $1 for update", [userId]);
  // reviews are append-only; their rule lets this transaction remove this user's.
  await db.query("select set_config('app.erasing_user_id', $1, true)", [userId]);
  // progress restricts its enrollment's delete, so it goes first.
  await db.query("delete from progress where user_id = $1", [userId]);
  // Pending magic links name the address, not the user: Better Auth stores
  // {"email": ...} as the value. Rows of other kinds, or not JSON, are left alone.
  await db.query(
    `delete from verification
      where case when pg_input_is_valid(value, 'jsonb') then lower(value::jsonb ->> 'email') end
          = (select lower(email) from "user" where id = $1)`,
    [userId],
  );
  const { rows: found } = await db.query<{ email: string }>(
    `select email from "user" where id = $1`,
    [userId],
  );
  if (found[0] !== undefined) {
    await db.query("delete from rate_limit where key = $1", [
      await emailRateKey(authSecret, found[0].email),
    ]);
  }
  // Every other per-user row cascades from the user.
  const { rowCount } = await db.query(`delete from "user" where id = $1`, [userId]);
  if (rowCount !== 1) {
    throw new Error(`no such user: ${userId}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const userId = process.argv[2] ?? "";
  // Read from the environment, never an argument, so it stays out of shell history.
  const authSecret = process.env.BETTER_AUTH_SECRET ?? "";
  if (authSecret === "") {
    throw new Error("set BETTER_AUTH_SECRET: the sign-in limit's row is keyed with it");
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR ?? LOCAL });
  await client.connect();
  try {
    await client.query("begin");
    await eraseUser(client, userId, authSecret);
    await client.query("commit");
    console.log(JSON.stringify({ message: "user erased", user_id: userId }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
