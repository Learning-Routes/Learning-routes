// The minimal build leaves out Kysely, which the Drizzle adapter does not need.

import { negotiateLocale } from "@learning-routes/core/locales";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import * as tables from "../db/schema/auth";
import type { Database, Transaction } from "../db/with-db";
import { readConnectIntent } from "./connect-intent";
import type { EmailSender } from "./email";
import { intentIdentifier } from "./magic-token";
import { authOptions } from "./options";
import { emailRateKey } from "./rate-key";
import { takeFromWindow } from "./rate-window";
import { AUTH_PATH, SESSION_COOKIE, sharedAuthOptions } from "./shared";
import { readStartIntent } from "./start-intent";

// Better Auth for one request (Platform STEP 2 §5), on withClient's client: a
// Worker has no long-lived state, so it is built per request from env. The app
// origin is its base URL and its only trusted origin; the secret comes from env.
// Magic links are the only way in; social providers plug in here later, as
// socialProviders next to the plugin.

export { AUTH_PATH, SESSION_COOKIE, takeFromWindow };
export const CONFIRM_PATH = `${AUTH_PATH}/magic-link/confirm`;
/** The app's page a link opens; the web Worker serves it. */
const LINK_PATH = "/sign-in/confirm";

// The email says five minutes.
const LINK_LIFETIME_S = 300;
const LINKS_PER_ADDRESS = 5;
const ADDRESS_WINDOW_MS = 600_000;

type EndpointContext = Parameters<Parameters<typeof magicLink>[0]["sendMagicLink"]>[1];

/**
 * At most five sign-in links per address in ten minutes, whatever its letter case and
 * whatever the IPs asking, keyed by an HMAC of the address.
 */
async function refuseFloodedInbox(
  endpoint: EndpointContext,
  address: string,
  secret: string,
): Promise<void> {
  if (endpoint === undefined) {
    throw new APIError("INTERNAL_SERVER_ERROR");
  }
  const key = await emailRateKey(secret, address);
  if (
    !(await takeFromWindow(endpoint.context.adapter, key, LINKS_PER_ADDRESS, ADDRESS_WINDOW_MS))
  ) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many sign-in links for this address. Try again later.",
    });
  }
}

/** What this browser was doing when it asked for the link, kept with the token (magic-token.ts). */
async function keepIntent(ctx: EndpointContext, token: string, secret: string) {
  const cookies = ctx?.request?.headers.get("cookie");
  const joining = await readStartIntent(secret, cookies, Date.now());
  const target = readConnectIntent(cookies) ?? (joining ? `/empezar?ruta=${joining}` : null);
  if (target && ctx) {
    await ctx.context.internalAdapter.createVerificationValue({
      identifier: await intentIdentifier(token),
      value: target,
      expiresAt: new Date(Date.now() + LINK_LIFETIME_S * 1000),
    });
  }
}

export function createAuth(env: Env, db: Database | Transaction, email: EmailSender) {
  return betterAuth({
    ...authOptions,
    ...sharedAuthOptions(env),
    database: drizzleAdapter(db, { provider: "pg", schema: tables }),
    // Sending and confirming sign-in links get tighter rules of their own.
    rateLimit: {
      ...authOptions.rateLimit,
      customRules: {
        "/sign-in/magic-link": { window: 600, max: 3 },
        "/magic-link/verify": { window: 600, max: 10 },
      },
    },
    plugins: [
      magicLink({
        storeToken: "hashed",
        expiresIn: LINK_LIFETIME_S,
        // The link opens the app's page, which asks first; Better Auth's own link
        // would sign in on a GET, with the token in its query.
        sendMagicLink: async ({ email: address, token }, ctx) => {
          await refuseFloodedInbox(ctx, address, env.BETTER_AUTH_SECRET);
          await keepIntent(ctx, token, env.BETTER_AUTH_SECRET);
          await email.sendMagicLink({
            email: address,
            // In the fragment: no request, and so no log, ever carries it.
            url: `${env.APP_ORIGIN}${LINK_PATH}#token=${encodeURIComponent(token)}`,
            locale: negotiateLocale(ctx?.request?.headers.get("accept-language")),
          });
        },
      }),
    ],
  });
}
