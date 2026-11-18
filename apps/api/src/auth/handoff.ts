import type { Context, Hono } from "hono";
import { keepHandoff, takeHandoff } from "../db/handoffs";
import { withClient } from "../db/with-db";
import { createAuth } from "./auth";
import type { EmailSender } from "./email";
import { identifierOf } from "./magic-token";
import { SESSION_COOKIE } from "./shared";

// One address (Platform STEP 19). The app moved from app.learningroutes.com to
// learningroutes.com, and the session cookie is __Host-, so no other host can read it. A
// person signed in on the old host goes through one silent hand-off instead of signing in
// again. The old host's Worker posts here with their cookie and gets a code that lives for
// a minute, is used once, and works only from the same address and browser. The person's
// next request, the GET below, puts the same session cookie on the new host.

const HANDOFF_PATH = "/api/handoff";
const LIFETIME_MS = 60_000;
const PREFIX = "handoff:";
const SESSION_IN_COOKIES = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`);

/** The session cookie's value in a Cookie header, or null. */
const sessionCookieIn = (header: string | null | undefined) =>
  header?.match(SESSION_IN_COOKIES)?.[1] ?? null;

/** Only a path on this host: never another origin, nor a protocol-relative "//". */
const sameHostPath = (next: string | null | undefined) =>
  next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

/** Who asked: the code works only for the same address and browser. */
const browserOf = (c: Context) =>
  identifierOf(`${c.req.header("cf-connecting-ip") ?? ""}\n${c.req.header("user-agent") ?? ""}`);

function code(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

interface Held {
  cookie: string;
  expiresAt: number;
  browser: string;
}

export function handoffRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.post(HANDOFF_PATH, async (c) => {
    c.header("Cache-Control", "no-store");
    const cookie = sessionCookieIn(c.req.header("cookie"));
    if (cookie === null) {
      return c.json({ code: "unauthorized" }, 401);
    }
    const given = code();
    const found = await withClient(c.env, c.executionCtx, async (db) => {
      const auth = createAuth(c.env, db, emailSender(c.env));
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) {
        return false;
      }
      const held: Held = {
        cookie,
        expiresAt: new Date(session.session.expiresAt).getTime(),
        browser: await browserOf(c),
      };
      await keepHandoff(
        db,
        `${PREFIX}${await identifierOf(given)}`,
        JSON.stringify(held),
        new Date(Date.now() + LIFETIME_MS),
      );
      return true;
    });
    return found ? c.json({ code: given }) : c.json({ code: "unauthorized" }, 401);
  });

  app.get(HANDOFF_PATH, async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const next = sameHostPath(c.req.query("next"));
    const given = c.req.query("code");
    if (!given) {
      return c.redirect(next, 303);
    }
    const identifier = `${PREFIX}${await identifierOf(given)}`;
    // Used up whether or not it fits this browser: a code that leaked is worth one try.
    const taken = await withClient(c.env, c.executionCtx, (db) => takeHandoff(db, identifier));
    const held = taken ? (JSON.parse(taken) as Held) : null;
    const maxAge = held ? Math.floor((held.expiresAt - Date.now()) / 1000) : 0;
    if (held && held.browser === (await browserOf(c)) && maxAge > 0) {
      c.header(
        "Set-Cookie",
        `${SESSION_COOKIE}=${held.cookie}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`,
      );
    }
    return c.redirect(next, 303);
  });
}
