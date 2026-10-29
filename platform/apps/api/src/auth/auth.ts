// The minimal build leaves out Kysely, which the Drizzle adapter does not need.

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import * as tables from "../db/schema/auth";
import type { Database, Transaction } from "../db/with-db";
import type { EmailSender } from "./email";
import { authOptions } from "./options";

// Better Auth for one request (Platform STEP 2 §5), on withClient's client: a
// Worker has no long-lived state, so it is built per request from env. The app
// origin is its base URL and its only trusted origin; the secret comes from env.
// Magic links are the only way in; social providers plug in here later, as
// socialProviders next to the plugin.

export const AUTH_PATH = "/api/auth";
export const CONFIRM_PATH = `${AUTH_PATH}/magic-link/confirm`;

/** The session cookie: __Host- pins it to the app's own origin (Secure, Path=/, no Domain). */
const SESSION_COOKIE = "__Host-lr_session";

const LINKS_PER_ADDRESS = 5;
const ADDRESS_WINDOW_MS = 600_000;

type EndpointContext = Parameters<Parameters<typeof magicLink>[0]["sendMagicLink"]>[1];

/**
 * At most five sign-in links per address in ten minutes, whatever its letter case
 * and whatever the IPs asking. Counted in Better Auth's own rate-limit table, keyed
 * by the address, with the same atomic conditional increment its IP limits use.
 */
async function refuseFloodedInbox(endpoint: EndpointContext, address: string): Promise<void> {
  if (endpoint === undefined) {
    throw new APIError("INTERNAL_SERVER_ERROR");
  }
  const { adapter } = endpoint.context;
  const key = `magic-link-email:${address.toLowerCase()}`;
  const now = Date.now();
  const byKey = { field: "key", value: key };
  const counted = await adapter.incrementOne({
    model: "rateLimit",
    where: [
      byKey,
      { field: "lastRequest", operator: "gt", value: now - ADDRESS_WINDOW_MS },
      { field: "count", operator: "lt", value: LINKS_PER_ADDRESS },
    ],
    increment: { count: 1 },
    set: { lastRequest: now },
  });
  if (counted) {
    return;
  }
  const row = await adapter.findOne<{ lastRequest: number | bigint }>({
    model: "rateLimit",
    where: [byKey],
  });
  if (row === null) {
    // The first link: a concurrent first link may create the row first, so try again.
    const created = await adapter
      .create({ model: "rateLimit", data: { key, count: 1, lastRequest: now } })
      .catch(() => null);
    return created === null ? refuseFloodedInbox(endpoint, address) : undefined;
  }
  if (Number(row.lastRequest) <= now - ADDRESS_WINDOW_MS) {
    await adapter.update({
      model: "rateLimit",
      where: [byKey],
      update: { count: 1, lastRequest: now },
    });
    return;
  }
  throw new APIError("TOO_MANY_REQUESTS", {
    message: "Too many sign-in links for this address. Try again later.",
  });
}

export function createAuth(env: Env, db: Database | Transaction, email: EmailSender) {
  return betterAuth({
    ...authOptions,
    baseURL: env.APP_ORIGIN,
    basePath: AUTH_PATH,
    trustedOrigins: [env.APP_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: tables }),
    // Counted in the database, per client IP, so every Worker instance shares the
    // count, and on in every mode. Sending and confirming sign-in links get tighter
    // rules of their own.
    rateLimit: {
      ...authOptions.rateLimit,
      customRules: {
        "/sign-in/magic-link": { window: 600, max: 3 },
        "/magic-link/verify": { window: 600, max: 10 },
      },
    },
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
        sendMagicLink: async ({ email: address, token }, ctx) => {
          await refuseFloodedInbox(ctx, address);
          await email.sendMagicLink({
            email: address,
            url: `${env.APP_ORIGIN}${CONFIRM_PATH}?token=${encodeURIComponent(token)}`,
          });
        },
      }),
    ],
  });
}
