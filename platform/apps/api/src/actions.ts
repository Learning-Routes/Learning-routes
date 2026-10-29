import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { newBlockId } from "@learning-routes/core/ids";
import type { Hono } from "hono";
import { createAuth } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { setActingUser, type Transaction, withDb } from "./db/with-db";

// The app's way into the action registry (Platform STEP 2 §5.7): POST
// /api/a/:name. The actor is the session's user, read by Better Auth from the
// session cookie, never from the request body; with no session, nothing runs. The
// action runs in one transaction, as lr_app, under that user's row-level security.

const STATUS = {
  unknown_action: 404,
  invalid_input: 400,
  not_found: 404,
  forbidden: 403,
  invalid: 422,
} as const;

function ctxFor(tx: Transaction, userId: string) {
  return {
    actor: { via: "ui" as const, userId },
    repos: pgRepos(tx),
    tenancy: pgTenancy(tx),
    clock: { now: () => Date.now() },
    ids: { newId: () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10))) },
  };
}

export function actionRoutes(app: Hono<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  app.post("/api/a/:name", async (c) => {
    const input: unknown = await c.req.json().catch(() => null);
    return withDb(c.env, c.executionCtx, null, async (tx) => {
      const auth = createAuth(c.env, tx, emailSender(c.env));
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session === null) {
        return c.json({ ok: false, code: "unauthenticated" }, 401);
      }
      await setActingUser(tx, session.user.id);
      const result = await runAction(
        ACTIONS,
        c.req.param("name"),
        input,
        ctxFor(tx, session.user.id),
      );
      return c.json(result, result.ok ? 200 : STATUS[result.code]);
    });
  });
}
