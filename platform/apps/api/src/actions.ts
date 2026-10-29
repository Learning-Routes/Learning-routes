import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import type { Hono } from "hono";
import { createAuth } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { type Transaction, withClient, withDb } from "./db/with-db";
import { newId } from "./ids";

// The app's way into the action registry (Platform STEP 2 §5.7): POST
// /api/a/:name. The actor is the session's user, read by Better Auth from the
// session cookie, never from the request body; with no session, nothing runs. The
// action runs in one transaction, as lr_app, under that user's row-level security.

const STATUS = {
  unknown_action: 404,
  invalid_input: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 422,
} as const;

function ctxFor(tx: Transaction, userId: string) {
  return {
    actor: { via: "ui" as const, userId },
    repos: pgRepos(tx),
    tenancy: pgTenancy(tx),
    clock: { now: () => Date.now() },
    ids: { newId },
  };
}

export function actionRoutes(app: Hono<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  app.post("/api/a/:name", async (c) => {
    const input: unknown = await c.req.json().catch(() => null);
    // The session first, on its own client: Better Auth may renew it, and expects
    // its statements to commit on their own. The renewed cookie goes back below.
    const { headers: renewed, response: session } = await withClient(c.env, c.executionCtx, (db) =>
      createAuth(c.env, db, emailSender(c.env)).api.getSession({
        headers: c.req.raw.headers,
        returnHeaders: true,
      }),
    );
    if (session === null) {
      return c.json({ ok: false, code: "unauthenticated" }, 401);
    }
    const userId = session.user.id;
    const result = await withDb(c.env, c.executionCtx, userId, (tx) =>
      runAction(ACTIONS, c.req.param("name"), input, ctxFor(tx, userId)),
    );
    for (const cookie of renewed.getSetCookie()) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.json(result, result.ok ? 200 : STATUS[result.code]);
  });
}
