// The minimal build leaves out Kysely, which the Drizzle adapter does not need.

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import * as tables from "../db/schema/auth";
import type { Transaction } from "../db/with-db";
import type { EmailSender } from "./email";
import { authOptions } from "./options";

// Better Auth for one request (Platform STEP 2 §5), on the request's transaction:
// a Worker has no long-lived state, so it is built per request from env. The app
// origin is its base URL and its only trusted origin; the secret comes from env.
// Magic links are the only way in; social providers plug in here later, as
// socialProviders next to the plugin.

export const AUTH_PATH = "/api/auth";
export const CONFIRM_PATH = `${AUTH_PATH}/magic-link/confirm`;

/** The session cookie: __Host- pins it to the app's own origin (Secure, Path=/, no Domain). */
const SESSION_COOKIE = "__Host-lr_session";

export function createAuth(env: Env, db: Transaction, email: EmailSender) {
  return betterAuth({
    ...authOptions,
    baseURL: env.APP_ORIGIN,
    basePath: AUTH_PATH,
    trustedOrigins: [env.APP_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: tables }),
    // Off, so a revoked session ends at once instead of living on in a cookie.
    session: { cookieCache: { enabled: false } },
    advanced: {
      ...authOptions.advanced,
      // Better Auth would prefix __Secure- itself; the name below carries __Host-
      // instead, and the attributes it needs are set here.
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: "lax", path: "/" },
      cookies: { session_token: { name: SESSION_COOKIE } },
      crossSubDomainCookies: { enabled: false },
      // Cloudflare sets cf-connecting-ip; X-Forwarded-For is whatever the client sends.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      magicLink({
        storeToken: "hashed",
        // The link opens the app's page, which asks first; Better Auth's own link
        // would sign in on a GET.
        sendMagicLink: ({ email: address, token }) =>
          email.sendMagicLink({
            email: address,
            url: `${env.APP_ORIGIN}${CONFIRM_PATH}?token=${encodeURIComponent(token)}`,
          }),
      }),
    ],
  });
}
