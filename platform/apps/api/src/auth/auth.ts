// The minimal build leaves out Kysely, which the Drizzle adapter does not need.

import { negotiateLocale } from "@learning-routes/core/locales";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import * as tables from "../db/schema/auth";
import type { Database, Transaction } from "../db/with-db";
import type { EmailSender } from "./email";
import { authOptions } from "./options";
import { emailRateKey } from "./rate-key";

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

/** How often one request races others for the count before it gives up. */
const ATTEMPTS = 3;

type Adapter = NonNullable<EndpointContext>["context"]["adapter"];

/** One more link in the address's current window, if it has room: atomic. */
const countInWindow = (adapter: Adapter, key: string, now: number) =>
  adapter.incrementOne({
    model: "rateLimit",
    where: [
      { field: "key", value: key },
      { field: "lastRequest", operator: "gt", value: now - ADDRESS_WINDOW_MS },
      { field: "count", operator: "lt", value: LINKS_PER_ADDRESS },
    ],
    increment: { count: 1 },
    set: { lastRequest: now },
  });

/**
 * At most five sign-in links per address in ten minutes, whatever its letter case
 * and whatever the IPs asking. Counted in Better Auth's own rate-limit table, keyed
 * by an HMAC of the address, with atomic conditional writes only: the count goes up
 * only inside a window with room; the first link creates the row once; a window
 * that is over is restarted only by the one request that still sees its old start.
 * A request that loses every race gives up after a few tries.
 */
async function refuseFloodedInbox(
  endpoint: EndpointContext,
  address: string,
  secret: string,
): Promise<void> {
  if (endpoint === undefined) {
    throw new APIError("INTERNAL_SERVER_ERROR");
  }
  const { adapter } = endpoint.context;
  const key = await emailRateKey(secret, address);
  const byKey = { field: "key", value: key };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const now = Date.now();
    if (await countInWindow(adapter, key, now)) {
      return;
    }
    const row = await adapter.findOne<{ lastRequest: number | bigint }>({
      model: "rateLimit",
      where: [byKey],
    });
    if (row === null) {
      // The first link. A concurrent first link may create the row first: try again.
      const created = await adapter
        .create({ model: "rateLimit", data: { key, count: 1, lastRequest: now } })
        .catch(() => null);
      if (created !== null) {
        return;
      }
      continue;
    }
    if (Number(row.lastRequest) > now - ADDRESS_WINDOW_MS) {
      break;
    }
    // The window is over. Restart it only if no one else has: the update matches
    // the old start, which a restart changes.
    const restarted = await adapter.updateMany({
      model: "rateLimit",
      where: [byKey, { field: "lastRequest", value: Number(row.lastRequest) }],
      update: { count: 1, lastRequest: now },
    });
    if (restarted === 1) {
      return;
    }
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
        // The email says five minutes.
        expiresIn: 300,
        // The link opens the app's page, which asks first; Better Auth's own link
        // would sign in on a GET, with the token in its query.
        sendMagicLink: async ({ email: address, token }, ctx) => {
          await refuseFloodedInbox(ctx, address, env.BETTER_AUTH_SECRET);
          await email.sendMagicLink({
            email: address,
            // In the fragment: no request, and so no log, ever carries it.
            url: `${env.APP_ORIGIN}${CONFIRM_PATH}#token=${encodeURIComponent(token)}`,
            locale: negotiateLocale(ctx?.request?.headers.get("accept-language")),
          });
        },
      }),
    ],
  });
}
