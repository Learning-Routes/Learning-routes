import { CreatorApplication } from "@learning-routes/core/applications";
import type { Hono } from "hono";
import * as z from "zod";
import { createAuth, takeFromWindow } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { emailRateKey } from "./auth/rate-key";
import { insertApplication } from "./db/repos/applications";
import { withClient, withDb } from "./db/with-db";
import { verifyTurnstile } from "./security/turnstile";

// "Quiero enseñar" (Platform STEP 4 §6.3): no account, so not an action, which always has
// an actor. In order: the shape, the client's limit, Turnstile, the address's limit, then
// one insert as nobody, which row-level security allows only as a new application.

const Applying = z.object({ token: z.string() }).loose();
const PER_CLIENT = 5;
const CLIENT_WINDOW_MS = 3_600_000;
const PER_ADDRESS = 3;
const ADDRESS_WINDOW_MS = 86_400_000;
const ACTION = "apply";

export function applyRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
  siteverifyFetch: typeof fetch,
) {
  const hasRoom = (
    env: Env,
    ctx: Pick<ExecutionContext, "waitUntil">,
    key: string,
    max: number,
    windowMs: number,
  ) =>
    withClient(env, ctx, async (db) => {
      const { adapter } = await createAuth(env, db, emailSender(env)).$context;
      return takeFromWindow(adapter, key, max, windowMs);
    });

  app.post("/api/apply", async (c) => {
    c.header("Cache-Control", "no-store");
    const raw = Applying.safeParse(await c.req.json().catch(() => null));
    const { token = "", ...fields } = raw.success ? raw.data : {};
    const application = CreatorApplication.safeParse(fields);
    if (!application.success) {
      return c.json({ code: "invalid_input" }, 400);
    }
    const client = c.req.header("cf-connecting-ip") ?? "unknown";
    const { env, executionCtx: ctx } = c;
    if (!(await hasRoom(env, ctx, `apply-client:${client}`, PER_CLIENT, CLIENT_WINDOW_MS))) {
      return c.json({ code: "too_many_requests" }, 429);
    }
    if (!(await verifyTurnstile(env, String(token), client, ACTION, siteverifyFetch))) {
      return c.json({ code: "challenge_failed" }, 403);
    }
    // An HMAC, so the limit's table holds no address.
    const key = `apply-${await emailRateKey(env.BETTER_AUTH_SECRET, application.data.email)}`;
    if (!(await hasRoom(env, ctx, key, PER_ADDRESS, ADDRESS_WINDOW_MS))) {
      return c.json({ code: "too_many_requests" }, 429);
    }
    await withDb(env, ctx, null, (tx) => insertApplication(tx, application.data));
    return c.json({ ok: true });
  });
}
