import { createApp } from "../../src/app";
import type { MagicLinkMessage } from "../../src/auth/email";
import { URLS } from "../db/connect";

// The API as a browser on the app origin reaches it, against the local database:
// requests go through the Worker's Hono app, with env and ctx as Workers give them.
// Sent sign-in links are kept instead of mailed.

export const APP = "https://app.example.test";

export function harness() {
  const sent: MagicLinkMessage[] = [];
  const pending: Promise<unknown>[] = [];
  const app = createApp({
    emailSender: () => ({ sendMagicLink: async (message) => void sent.push(message) }),
  });
  const env = {
    DB: { connectionString: URLS.app } as Hyperdrive,
    APP_ORIGIN: APP,
    EMAIL_DELIVERY: "none",
    BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef0123456789abcdef",
  } as Env;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
  /** One request, from a browser on the app origin unless headers say otherwise. */
  /** origin: null sends none; by default a non-GET carries the app's. */
  const call = async (
    path: string,
    init: RequestInit & { ip?: string; origin?: string | null } = {},
  ) => {
    const headers = new Headers(init.headers);
    const origin =
      init.origin === undefined && init.method && init.method !== "GET" ? APP : init.origin;
    if (origin) {
      headers.set("origin", origin);
    }
    headers.set("cf-connecting-ip", init.ip ?? randomIp());
    const url = path.startsWith("http") ? path : `${APP}${path}`;
    return app.request(url, { ...init, headers }, env, ctx);
  };
  const settle = () => Promise.allSettled(pending.splice(0));
  return { sent, call, settle };
}

export const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...extra },
  body: JSON.stringify(body),
});

export const randomEmail = () => `learner-${crypto.randomUUID()}@example.com`;

/**
 * A documentation-range IPv6 address no earlier test run used: rate-limit rows
 * outlive a run, and Better Auth counts an IPv6 client by its /64, so the random
 * part goes in the prefix.
 */
export const randomIp = () => {
  const [a, b] = crypto.randomUUID().split("-");
  return `2001:db8:${a?.slice(0, 4)}:${b}::1`;
};
