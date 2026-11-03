import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { type Context, Hono } from "hono";
import { AUTH_PATH } from "../auth/shared";
import { pgRepos } from "../db/repos/index";
import { pgTenancy } from "../db/tenancy";
import { type Database, transactionAs, withClient } from "../db/with-db";
import { newId } from "../ids";
import { requestLog } from "../log";
import { createOAuth } from "./auth";
import { boundedMetadataFetch } from "./client-metadata";
import { serveMcp } from "./request";

// The MCP Worker's routes (Platform STEP 5). Built by a factory, like the API's, so the tests
// can serve a client's metadata document themselves; index.ts builds the one Workers run.

export interface McpAppDeps {
  fetchClientMetadataResource?: ClientMetadataResourceFetch;
}

type McpContext = Context<{ Bindings: Env }>;

/** The person's yes goes through the log first: no grant is ever left out of it. */
async function logGrant(db: Database, userId: string, query: URLSearchParams) {
  return transactionAs(db, userId, (tx) =>
    runAction(
      ACTIONS,
      "connection.grant",
      {
        clientId: query.get("client_id") ?? "",
        scopes: (query.get("scope") ?? "").split(" ").filter(Boolean),
      },
      {
        actor: { via: "ui", userId },
        repos: pgRepos(tx),
        tenancy: pgTenancy(tx),
        clock: { now: () => Date.now() },
        ids: { newId },
      },
    ),
  );
}

export function createMcpApp(deps: McpAppDeps = {}) {
  const fetchClientMetadataResource = deps.fetchClientMetadataResource ?? boundedMetadataFetch();
  const app = new Hono<{ Bindings: Env }>();
  app.use(requestLog);
  app.get("/health", (c) => c.json({ ok: true }));

  const provider = (c: McpContext) =>
    withClient(c.env, c.executionCtx, (db) =>
      createOAuth(c.env, db, fetchClientMetadataResource).handler(c.req.raw),
    );

  app.post(`${AUTH_PATH}/oauth2/consent`, async (c) => {
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => null)) as { accept?: unknown; oauth_query?: unknown } | null;
    if (body?.accept !== true) {
      return provider(c);
    }
    return withClient(c.env, c.executionCtx, async (db) => {
      const oauth = createOAuth(c.env, db, fetchClientMetadataResource);
      const session = await oauth.api.getSession({ headers: c.req.raw.headers });
      if (session === null) {
        return c.json({ error: "unauthenticated" }, 401);
      }
      const logged = await logGrant(
        db,
        session.user.id,
        new URLSearchParams(String(body.oauth_query ?? "")),
      );
      if (!logged.ok) {
        return c.json({ error: "access_denied" }, 403);
      }
      return oauth.handler(c.req.raw);
    });
  });

  app.all("/mcp", (c) =>
    withClient(c.env, c.executionCtx, (db) =>
      serveMcp(c.req.raw, c.env, db, createOAuth(c.env, db, fetchClientMetadataResource)),
    ),
  );
  app.on(["GET", "POST"], `${AUTH_PATH}/*`, provider);
  app.on(["GET", "HEAD"], "/.well-known/*", provider);
  return app;
}
