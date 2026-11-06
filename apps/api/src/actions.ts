import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { purgeTagsAfter } from "@learning-routes/core/actions/purge-tags";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import type { Hono } from "hono";
import { createAuth, SESSION_COOKIE } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { queuePurge } from "./cache/purge";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { type Transaction, transactionAs, withClient } from "./db/with-db";
import { storeQuietly } from "./files";
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
  conflict: 409,
  position_taken: 409,
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

/** After the commit, never inside it: R2 and the queue are outside calls. */
async function afterCommit(env: Env, name: string, input: unknown, result: ActionResult) {
  if (result.ok) {
    await storeQuietly(env, name, input, result.output);
    await queuePurge(env, purgeTagsAfter(name, result.output));
  }
}

export function actionRoutes(app: Hono<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  app.post("/api/a/:name", async (c) => {
    const input: unknown = await c.req.json().catch(() => null);
    return withClient(c.env, c.executionCtx, async (db) => {
      // The session first, before BEGIN on this client: Better Auth may renew it, and
      // expects its statements to commit on their own. The renewed cookie goes back below.
      const { headers: renewed, response: session } = await createAuth(
        c.env,
        db,
        emailSender(c.env),
      ).api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
      if (session === null) {
        // A dead session's cookie goes with it, so the browser stops sending it.
        if (c.req.header("cookie")?.includes(`${SESSION_COOKIE}=`)) {
          c.header("set-cookie", DEAD_SESSION);
        }
        return c.json({ ok: false, code: "unauthenticated" }, 401);
      }
      const userId = session.user.id;
      const name = c.req.param("name");
      const result = await transactionAs(db, userId, (tx) =>
        runAction(ACTIONS, name, input, ctxFor(tx, userId)),
      );
      await afterCommit(c.env, name, input, result);
      renewed.getSetCookie().forEach((cookie) => {
        c.header("set-cookie", cookie, { append: true });
      });
      return c.json(result, result.ok ? 200 : STATUS[result.code]);
    });
  });
}
