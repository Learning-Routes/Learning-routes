# ADR 0009: The MCP has its own Worker

Status: accepted (Platform STEP 5).

## Context

STEP 5 asks for the MCP server in the API Worker, measured against its 300 KiB budget (ADR 0004), or else in a Worker of its own that shares the repositories.

Measured with `wrangler deploy --dry-run`, gzip:

| Build | Size |
|---|---|
| API Worker today | 248.25 KiB |
| Plus the OAuth provider (`@better-auth/mcp`, `@better-auth/cimd`, the JWT plugin) | 375.32 KiB |
| Plus the MCP SDK (`@modelcontextprotocol/server`) | 432.94 KiB |

The OAuth provider alone breaks the budget, before any tool.

## Decision

`learning-routes-mcp` serves `/mcp` and the OAuth provider. The API keeps signing people in, and stays inside its budget.

- It is a second entry in `apps/api` (`src/mcp/index.ts`, `wrangler.mcp.jsonc`), not a new package. The STEP asks for repositories shared through a package; `apps/api` is that package, and moving the database module out of it would change the fence rules for nothing.
- The web Worker reaches it through a service binding, as it reaches the API, so `/mcp` and `/api/auth/oauth2/*` stay on the app's host and the resource is `https://app.learningroutes.com/mcp`.
- Both Workers use the same `BETTER_AUTH_SECRET` and tables, so a session made by one is read by the other. The secret also encrypts the OAuth signing keys in `jwks`: rotating it needs those rows deleted, which ends every access token within the hour, and refresh tokens keep working.
- The budget is 500 KiB, checked by `scripts/check-worker-size.mjs`. It is a new Worker's first budget, set above the measured size so that adding tools doesn't move it.

## Access tokens are JWTs, checked against the database

A token bound to a resource is a JWT, and Better Auth cannot revoke one. "Desconectar" has to end it at once, so each MCP call also reads the person's consent: no consent, or one newer than the token, is a 401. Each call reads the database anyway.

## No dynamic client registration

Claude (web, Desktop, Code), ChatGPT and MCP Inspector all support Client ID Metadata Documents when the server advertises them, so no client we want needs registration. It stays off.
