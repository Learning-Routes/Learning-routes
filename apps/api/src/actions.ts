import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { purgeTagsAfter } from "@learning-routes/core/actions/purge-tags";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { CREATOR_REQUIRED } from "@learning-routes/core/copy/creator-required";
import { RATE_LIMITED } from "@learning-routes/core/copy/rate-limited";
import { negotiateLocale } from "@learning-routes/core/locales";
import { ServerTiming } from "@learning-routes/core/server-timing";
import type { Context, Hono } from "hono";
import { createAuth, SESSION_COOKIE } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { queuePurge } from "./cache/purge";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { type Transaction, transactionAs, withClient } from "./db/with-db";
import { storeQuietly } from "./files";
import { withFrames } from "./frames";
import { newId } from "./ids";

// The app's way into the action registry (Platform STEP 2 §5.7): POST
// /api/a/:name. The actor is the session's user, read by Better Auth from the
// session cookie, never from the request body; with no session, nothing runs. The
// action runs in one transaction, as lr_app, under that user's row-level security.

const DEAD_SESSION = `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

const STATUS = {
  unknown_action: 404,
  invalid_input: 400,
  not_found: 404,
  forbidden: 403,
  creator_required: 403,
  conflict: 409,
  position_taken: 409,
  invalid: 422,
  rate_limited: 429,
} as const;

function ctxFor(tx: Transaction, userId: string, name: string) {
  return {
    actor: { via: "ui" as const, userId, name },
    repos: pgRepos(tx),
    tenancy: pgTenancy(tx),
    clock: { now: () => Date.now() },
    ids: { newId },
  };
}

/** After the commit, never inside it: R2 and the queue are outside calls. */
async function afterCommit(env: Env, name: string, input: unknown, result: ActionResult) {
  if (result.ok) {
    await storeQuietly(env, name, input, result.output);
    await queuePurge(env, purgeTagsAfter(name, result.output));
  }
}

/** The refusals a person reads as they are, in their language (Platform STEPs 14 and 17). */
const SAID = { creator_required: CREATOR_REQUIRED, rate_limited: RATE_LIMITED } as const;

function inTheirWords(result: ActionResult, acceptLanguage: string | undefined): ActionResult {
  if (result.ok || !Object.hasOwn(SAID, result.code)) {
    return result;
  }
  const code = result.code as keyof typeof SAID;
  return { ok: false, code, message: SAID[code][negotiateLocale(acceptLanguage)] };
}

/** One action, for the signed-in person: its session, its transaction, and its answer. */
function answered(
  c: Context<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
  name: string,
  input: unknown,
) {
  const timing = new ServerTiming(() => performance.now());
  const started = performance.now();
  return withClient(c.env, c.executionCtx, async (db) => {
    timing.add("connect", performance.now() - started);
    // The session first, before BEGIN on this client: Better Auth may renew it, and
    // expects its statements to commit on their own. The renewed cookie goes back below.
    const { headers: renewed, response: session } = await timing.measure("session", () =>
      createAuth(c.env, db, emailSender(c.env)).api.getSession({
        headers: c.req.raw.headers,
        returnHeaders: true,
      }),
    );
    c.header("Server-Timing", timing.header);
    if (session === null) {
      // A dead session's cookie goes with it, so the browser stops sending it.
      if (c.req.header("cookie")?.includes(`${SESSION_COOKIE}=`)) {
        c.header("set-cookie", DEAD_SESSION);
      }
      return c.json({ ok: false, code: "unauthenticated" }, 401);
    }
    const userId = session.user.id;
    // The action's transaction: every query it makes, as one batch on this connection.
    const result = await timing.measure("db", () =>
      transactionAs(db, userId, (tx) =>
        runAction(ACTIONS, name, input, ctxFor(tx, userId, session.user.name)),
      ),
    );
    await timing.measure("after", async () => {
      await afterCommit(c.env, name, input, result);
      if (result.ok) {
        await withFrames(c.env, name, result.output);
      }
    });
    c.header("Server-Timing", timing.header);
    renewed.getSetCookie().forEach((cookie) => {
      c.header("set-cookie", cookie, { append: true });
    });
    return c.json(
      inTheirWords(result, c.req.header("accept-language")),
      result.ok ? 200 : STATUS[result.code],
    );
  });
}

/** A page of a list from the address: ?beforeAt=<ms>&beforeId=<uuid>&limit=<n>. */
function pageOf(c: Context<{ Bindings: Env }>) {
  const [at, id, limit] = [c.req.query("beforeAt"), c.req.query("beforeId"), c.req.query("limit")];
  return {
    ...(at !== undefined && id !== undefined ? { before: { at: Number(at), id } } : {}),
    ...(limit !== undefined ? { limit: Number(limit) } : {}),
  };
}

export function actionRoutes(app: Hono<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  app.post("/api/a/:name", async (c) => {
    const name = c.req.param("name");
    // The tutor's question is asked only through /api/tutor/ask (tutor.ts): its answer here would be
    // the model's instructions, and a question spent with no answer.
    if (name === "tutor.ask") {
      return c.json({ ok: false, code: "unknown_action" }, 404);
    }
    return answered(c, emailSender, name, await c.req.json().catch(() => null));
  });
  // The community's own addresses (Platform STEP 17), the same actions by another name.
  app.get("/api/feed", (c) => answered(c, emailSender, "community.feed", pageOf(c)));
  app.get("/api/notifications", (c) => answered(c, emailSender, "notification.list", pageOf(c)));
  app.post("/api/notifications/read", async (c) =>
    answered(c, emailSender, "notification.read", await c.req.json().catch(() => ({}))),
  );
}
