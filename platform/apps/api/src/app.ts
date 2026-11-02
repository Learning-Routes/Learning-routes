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
  for (const path of ["/api/*", "/mcp/*"]) {
    app.use(path, appOriginOnly);
  }
  // A sign-in request names an address and nothing else. Better Auth would give a
  // new account the request's name, which is not the requester's to set: a link
  // asked for by someone else would name the account for them.
  app.post(`${AUTH_PATH}/sign-in/magic-link`, async (c, next) => {
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => null);
    if (body !== null && typeof body === "object" && Object.hasOwn(body, "name")) {
      return c.json({ code: "invalid_input", message: "a sign-in request takes no name" }, 400);
    }
    return next();
  });
  confirmRoutes(app, deps.emailSender);
  actionRoutes(app, deps.emailSender);
  app.on(["GET", "POST"], `${AUTH_PATH}/*`, (c) =>
    withClient(c.env, c.executionCtx, (db) =>
      createAuth(c.env, db, deps.emailSender(c.env)).handler(c.req.raw),
    ),
  );
  return app;
}
