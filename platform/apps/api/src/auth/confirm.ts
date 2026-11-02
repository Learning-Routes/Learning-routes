import type { Hono } from "hono";
import { withClient } from "../db/with-db";
import { AUTH_PATH, CONFIRM_PATH, createAuth } from "./auth";
import type { EmailSender } from "./email";

// What the sign-in link's page needs (Platform STEP 2 review item 11, and Platform
// STEP 3 §3). The link carries the token in its fragment, which no browser sends, so
// no server, proxy or log sees it. The app's page reads it, asks here which address it
// signs in so it can say so, and only its form's POST signs in. A link scanner, or
// another site that opens the link, signs in nobody. Better Auth's own verify, which
// signs in on a GET, answers 404.

const PADDING = /=+$/;
const SIGNED_IN = "/studio";
const EXPIRED = "/sign-in?notice=expired";
const LIMITED = "/sign-in?notice=limited";

/** How Better Auth stores a token when storeToken is "hashed". */
async function identifierOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");
}

function addressIn(value: string): string | null {
  try {
    const { email } = JSON.parse(value) as { email?: unknown };
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

export function confirmRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.get(`${AUTH_PATH}/magic-link/verify`, (c) => c.notFound());

  // Reads the pending link and leaves it: only the POST below uses it up. Whoever holds
  // the token already has the email it was sent to.
  app.post(`${AUTH_PATH}/magic-link/peek`, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    const sent = body?.token;
    if (typeof sent !== "string" || sent.length === 0) {
      return c.json({ code: "invalid_input" }, 400);
    }
    const identifier = `magic-link:${await identifierOf(sent)}`;
    const email = await withClient(c.env, c.executionCtx, async (db) => {
      const { internalAdapter } = await createAuth(c.env, db, emailSender(c.env)).$context;
      const pending = await internalAdapter.findVerificationValue(identifier);
      return pending && new Date(pending.expiresAt) > new Date() ? addressIn(pending.value) : null;
    });
    return email === null ? c.json({ code: "not_found" }, 404) : c.json({ email });
  });

  app.post(CONFIRM_PATH, async (c) => {
    const form = await c.req.formData().catch(() => null);
    const field = form?.get("token");
    if (typeof field !== "string" || field.length === 0) {
      return c.text("Bad request", 400);
    }
    const token = field;
    // Through Better Auth's handler, so its rate limits and checks apply.
    const verify = new URL(`${c.env.APP_ORIGIN}${AUTH_PATH}/magic-link/verify`);
    verify.searchParams.set("token", token);
    verify.searchParams.set("callbackURL", SIGNED_IN);
    verify.searchParams.set("errorCallbackURL", EXPIRED);
    const request = new Request(verify, { headers: c.req.raw.headers });
    const response = await withClient(c.env, c.executionCtx, (db) =>
      createAuth(c.env, db, emailSender(c.env)).handler(request),
    );
    return response.status === 429 ? c.redirect(LIMITED, 303) : response;
  });
}
