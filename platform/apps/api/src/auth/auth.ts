// The minimal build leaves out Kysely, which the Drizzle adapter does not need.

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import * as tables from "../db/schema/auth";
import type { Transaction } from "../db/with-db";
import type { EmailSender } from "./email";
import { authOptions } from "./options";

// Better Auth for one request (Platform STEP 2 §5), on the request's transaction:
// a Worker has no long-lived state, so it is built per request from env. The app
// origin is its base URL and its only trusted origin; the secret comes from env.

export const AUTH_PATH = "/api/auth";

export function createAuth(env: Env, db: Transaction, _email: EmailSender) {
  return betterAuth({
    ...authOptions,
    baseURL: env.APP_ORIGIN,
    basePath: AUTH_PATH,
    trustedOrigins: [env.APP_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: tables }),
  });
}
