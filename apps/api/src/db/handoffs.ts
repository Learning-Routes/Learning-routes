import { sql } from "drizzle-orm";
import type { Database } from "./with-db";

// The old app host's hand-off codes (Platform STEP 19, src/auth/handoff.ts), kept hashed in Better
// Auth's verification table like a sign-in link's.

/** Keeps a code's hash with what it hands off, until it expires. */
export async function keepHandoff(db: Database, identifier: string, value: string, until: Date) {
  await db.execute(
    sql`insert into verification (identifier, value, expires_at) values (${identifier}, ${value}, ${until})`,
  );
}

/** Uses a code up, once: what it hands off while it is in time, or null. */
export async function takeHandoff(db: Database, identifier: string): Promise<string | null> {
  const { rows } = await db.execute(
    sql`delete from verification where identifier = ${identifier} and expires_at > now() returning value`,
  );
  return (rows[0] as { value: string } | undefined)?.value ?? null;
}
