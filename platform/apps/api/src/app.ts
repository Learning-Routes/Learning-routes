import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import { actionRoutes } from "./actions";
import { AUTH_PATH, createAuth } from "./auth/auth";
import { confirmRoutes } from "./auth/confirm";
import type { EmailSender } from "./auth/email";
import { withClient } from "./db/with-db";
import { requestLog } from "./log";
import { appOriginOnly } from "./security/app-origin";

// The API Worker's routes. Built by a factory so the tests can give it their own
// email sender; index.ts builds the one Workers run.

export interface AppDeps {
  emailSender: (env: Env) => EmailSender;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestLog);
  app.get("/health", (c) => c.json({ ok: true, version: pkg.version }));
  for (const path of ["/api/*", "/mcp", "/mcp/*"]) {
    app.use(path, appOriginOnly);
  }
  confirmRoutes(app, deps.emailSender);
  actionRoutes(app, deps.emailSender);
  app.on(["GET", "POST"], `${AUTH_PATH}/*`, (c) =>
    withClient(c.env, c.executionCtx, (db) =>
      createAuth(c.env, db, deps.emailSender(c.env)).handler(c.req.raw),
    ),
  );
  return app;
}
