import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { sharedAuthOptions } from "../auth/shared";
import * as sessionTables from "../db/schema/auth";
import type { Database } from "../db/with-db";

// The assistant's Worker reads the sessions the API makes, with the same secret, as the MCP's does:
// it signs nobody in. Its adapter also keeps the write windows the MCP keeps.
export function readSessions(env: Env, db: Database) {
  return betterAuth({
    ...sharedAuthOptions(env),
    database: drizzleAdapter(db, { provider: "pg", schema: sessionTables }),
  });
}
