import type { Hono } from "hono";
import { withClient } from "../db/with-db";
import { AUTH_PATH, CONFIRM_PATH, createAuth, takeFromWindow } from "./auth";
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
const FAILED = "/sign-in?notice=failed";
const LINK_IS_THE_PROBLEM = "INVALID_TOKEN";
const PEEKS_PER_CLIENT = 30;
const PEEKS_PER_TOKEN = 10;
const PEEK_WINDOW_MS = 600_000;
const ANY_ORIGIN = "https://origin.invalid";

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

/** Enough to recognise your own account: a forwarded or leaked link shows no more. */
export function maskAddress(email: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

/** Where the confirm POST's answer sends a person instead, or null to let it through. */
export function screenAfterConfirm(response: Response): string | null {
  if (response.status === 429) {
    return LIMITED;
  }
  if (response.status >= 400) {
    return FAILED;
  }
  const location = response.headers.get("location");
  if (!location?.includes("notice=expired")) {
    return null;
  }
  // Better Auth sends every failure to the same place: only a bad link reads as expired.
  const error = new URL(location, ANY_ORIGIN).searchParams.get("error");
  return error === LINK_IS_THE_PROBLEM ? EXPIRED : FAILED;
}

export function confirmRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.get(`${AUTH_PATH}/magic-link/verify`, (c) => c.notFound());

  // Reads the pending link and leaves it: only the POST below uses it up. It answers the
  // same for an unknown, expired or used token, and counts a token whether or not it
  // exists, so the answer tells nobody which tokens were real.
  app.post(`${AUTH_PATH}/magic-link/peek`, async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    const sent = body?.token;
    if (typeof sent !== "string" || sent.length === 0) {
      return c.json({ code: "invalid_input" }, 400);
    }
    const hash = await identifierOf(sent);
    const identifier = `magic-link:${hash}`;
    const client = c.req.header("cf-connecting-ip") ?? "unknown";
    const email = await withClient(c.env, c.executionCtx, async (db) => {
      const { adapter, internalAdapter } = await createAuth(c.env, db, emailSender(c.env)).$context;
      const byClient = `magic-link-peek:${client}`;
      const byToken = `magic-link-peek-token:${hash}`;
      if (
        !(await takeFromWindow(adapter, byClient, PEEKS_PER_CLIENT, PEEK_WINDOW_MS)) ||
        !(await takeFromWindow(adapter, byToken, PEEKS_PER_TOKEN, PEEK_WINDOW_MS))
      ) {
        return "limited" as const;
      }
      const pending = await internalAdapter.findVerificationValue(identifier);
      return pending && new Date(pending.expiresAt) > new Date() ? addressIn(pending.value) : null;
    });
    if (email === "limited") {
      return c.json({ code: "too_many_requests" }, 429);
    }
    return email === null
      ? c.json({ code: "not_found" }, 404)
      : c.json({ email: maskAddress(email) });
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
    try {
      const response = await withClient(c.env, c.executionCtx, (db) =>
        createAuth(c.env, db, emailSender(c.env)).handler(request),
      );
      const screen = screenAfterConfirm(response);
      return screen ? c.redirect(screen, 303) : response;
    } catch {
      return c.redirect(FAILED, 303);
    }
  });
}
