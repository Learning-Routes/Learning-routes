import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import { AUTH_PATH, createAuth } from "./auth/auth";
import { confirmRoutes } from "./auth/confirm";
import type { EmailSender } from "./auth/email";
import { withDb } from "./db/with-db";
import { requestLog } from "./log";

// The API Worker's routes. Built by a factory so the tests can give it their own
// email sender; index.ts builds the one Workers run.

export interface AppDeps {
  emailSender: (env: Env) => EmailSender;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestLog);
  app.get("/health", (c) => c.json({ ok: true, version: pkg.version }));
  confirmRoutes(app, deps.emailSender);
  app.on(["GET", "POST"], `${AUTH_PATH}/*`, (c) =>
    withDb(c.env, c.executionCtx, null, (tx) =>
      createAuth(c.env, tx, deps.emailSender(c.env)).handler(c.req.raw),
    ),
  );
  return app;
}
