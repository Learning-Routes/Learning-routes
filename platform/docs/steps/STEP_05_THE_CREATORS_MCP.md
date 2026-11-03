# Platform STEP 5: The creator's MCP

Written by the reviewer, 3 November 2026. Start from main at 26863757, green.

## 0. Context

The owner moved the MCP ahead of learning. It is the fastest way to create a real route from start to finish: a creator connects Claude, or any MCP client, to Learning Routes and says "create this route with these modules". The route is drafted and, when they say so, published on their page.

**The order from here:**

| STEP | What it covers |
| --- | --- |
| 5 | This STEP: the MCP |
| 6 | The first deploy, to new.learningroutes.com |
| 7 | Learning (Aprender) |
| 8 | Payments (Pagar) |
| 9 | Teaching (Enseñar): the studio, the in-app assistant and invitations |

Fix the STEP numbers in `FOUNDATIONS.md` and in the earlier STEP files where they name later STEPs.

**What already exists:**
- **Actions in `core`:** route.create, route.get, route.list, module.add, lesson.add, block.add and route.publish.
- **The actor kind `mcp`.** The permission table is `can(role, action, via)`.
- **Content:** the content parser and the blocks schema.
- **Accounts:** Better Auth 1.7.8, magic link only.

**What is current (verified 3 November 2026; check again before you write code):**
- **MCP 2026-07-28 is the current protocol.** It is stateless:
  - no `initialize` handshake and no `Mcp-Session-Id`;
  - a mandatory `server/discover`;
  - the protocol version is sent in `_meta` and in the `MCP-Protocol-Version` header;
  - the `Mcp-Method` and `Mcp-Name` headers must agree with the body;
  - JSON Schema 2020-12 for `inputSchema` and `outputSchema`;
  - dynamic client registration is deprecated in favour of Client ID Metadata Documents (CIMD);
  - the authorization server should send the RFC 9207 `iss` parameter.
- **Better Auth has `@better-auth/mcp`.** It is an OAuth 2.1 provider with MCP resource binding:
  - it needs the `jwt()` plugin, and `@better-auth/cimd` with `metadataProfile: "mcp-2026-07-28"`;
  - it serves `/.well-known/oauth-protected-resource`;
  - it verifies with `requireMcpAuth` / `verifyAccessTokenRequest`, checking `aud`, `iss`, expiry and DPoP.

  Check which Better Auth version it needs, and whether that version passes the 14-day rule.
- **Cloudflare Agents SDK v0.20.0 (27 July 2026):** `createMcpHandler` from `agents/mcp/server` builds a stateless server for each request with the MCP SDK v2, and validates browser Origins. `McpAgent` is deprecated: do not use it.

## Batch rules

**Same as always:**
- no tool or AI attribution anywhere;
- the repository is public: no secrets, no personal data, fixtures with invented names;
- exact pins at the newest release at least 14 days old;
- red-first tests;
- one PR per section, stacked;
- merge §0 and §1 yourself once green, and leave the rest for the reviewer;
- `pnpm check` before every push;
- no "wip" in any title that reaches main.

**Skills to load at user scope,** and list them in each PR:
- mcp-builder;
- lr-data-and-tenancy;
- lr-performance-budget;
- workers-best-practices and wrangler;
- cloudflare:agents-sdk;
- llm-secure-patterns: agent-action-surface, output-validation and secure-external-ingestion;
- a security skill;
- the vectorlab skills for the consent and connections screens.

**No model calls in this STEP.** The MCP server never calls OpenRouter: the creator's own client does the thinking. lr-ai-cost-guard is not needed, and a test proves the MCP Worker code never imports the OpenRouter adapter.

## §0. Housekeeping

1. Remove the `slug` field from `space.update`, which was added in STEP 4. Changing a page's address breaks every link to it. It returns in STEP 9 with permanent redirects from the old address.
2. Fix the later STEP numbers, as in §0 above.

## §1. Creating a space from admin

The owner needs a real space to test with, and creator invitations wait for STEP 9.

1. **A new action, `space.create`:**
   - operator only, `ui` only;
   - fields: name, slug (`SpaceSlug`, so the reserved names are refused) and the owner's email, which must belong to an account that has already signed in;
   - it creates the space and the owner membership in one transaction, and writes `action_log`.

   If no account has that email: "Esa persona todavía no ha entrado nunca. Pídele que entre una vez con su correo."
2. **In admin:** "Crear un espacio", reachable from an application marked "Ya envié la invitación" (name and email filled in), or blank.
3. **Grants:** add only what this needs, idempotent, and list them in `grants.test.ts`.

## §2. Authorization: OAuth 2.1 for MCP clients

1. **Add `jwt()` and `mcp()` to Better Auth, plus `cimd()` if it is mature.** Verify:
   - which clients support CIMD today: Claude (web, desktop and Code), ChatGPT and the MCP Inspector;
   - whether any of them still needs dynamic client registration.

   Enable dynamic registration only if a client we want needs it. Rate-limit it per IP, store no unverified redirect hosts, and say which clients needed it in the PR.
2. **The resource is `https://<api host>/mcp`.** Tokens are bound to it as `aud`, and the server refuses any other audience.
3. **Scopes:**
   - `routes:read`: list and read the creator's spaces and drafts;
   - `routes:write`: create and change drafts;
   - `routes:publish`: publish.

   A token never grants more than the person's role allows in a space. `core` checks both the scope and `can(role, action, "mcp")`.
4. **Token lifetimes:**
   - access tokens last one hour;
   - refresh tokens rotate, and a refresh token used twice revokes the whole chain;
   - tokens are stored hashed, as sessions are.
5. **The consent screen, on the app host.** v2 has no artboard for it, so build it in v2's language:
   - "[Client name] quiere usar tu cuenta de Learning Routes";
   - what each scope means in plain words: "Ver tus rutas", "Crear y cambiar borradores", "Publicar rutas en tu página";
   - the client's registered name and its redirect host, shown as they are;
   - one primary action, "Permitir", and "No permitir".
6. **Who can connect.** Only accounts with an owner, coeditor or assistant role in some space. Anyone else sees: "Para conectar un asistente necesitas tener un espacio para enseñar." No token is issued.
7. **"Conexiones" in the app,** under Enseñar: each connected client, when it was last used, its scopes, and "Desconectar", which revokes its tokens at once.
8. **Every grant and revoke writes `action_log`.**

## §3. The MCP server

1. **Where it runs.**
   - In the API Worker, at `/mcp`, with `createMcpHandler` (stateless) and a factory that builds the server for each request. No Durable Object.
   - Measure the Worker against its 300 KiB budget (263.19 KiB today). If the MCP SDK breaks it, move the MCP to its own Worker, `learning-routes-mcp`, sharing the repositories through a package. Record the choice in an ADR either way.
2. **The transport.**
   - Streamable HTTP, protocol 2026-07-28.
   - Answer legacy clients only if a client in §2.1 still needs it.
   - Reject requests whose `Mcp-Method` or `Mcp-Name` disagree with the body.
   - Reject a browser `Origin` that is not ours.
   - Send `ttlMs`, and `cacheScope` set to per-user, on list results.
3. **Every tool is a `core` action with `via: "mcp"`:**
   - it runs through the same permission table, row-level security, transaction and `action_log` as the app;
   - the log records the OAuth client id;
   - no tool talks to the database directly.
4. **The tools.** Names are snake_case, each with a short description written for a model, a JSON Schema 2020-12 `inputSchema` and `outputSchema`, `structuredContent`, and annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

   | Tool | Scope | What it does |
   | --- | --- | --- |
   | `list_spaces` | read | The person's spaces and their role in each |
   | `list_routes` | read | The routes in a space: draft or published, with counts |
   | `get_route` | read | A route's draft: modules, lessons and blocks, with their ids and `draft_revision` |
   | `create_route` | write | New draft: title, description, topic, level, source locale, price |
   | `import_route` | write | A whole route in one call; see §4 |
   | `add_module` / `add_lesson` / `add_blocks` | write | As the actions, with `draft_revision` |
   | `update_route_details` | write | Title, description, topic, level and price on the draft |
   | `publish_route` | publish | Publishes the draft. `destructiveHint: true`. The result includes the public URL |

   Add `update_route_details` as a `core` action (`ui` and `mcp`) if it does not exist. Editing and removing modules, lessons and blocks waits for STEP 9, unless it costs less than a day; say which you chose.
5. **Optimistic locking.** Every write takes the `draft_revision` it read. A stale one returns a clear error, with the current revision, telling the model to call `get_route` again.
6. **Errors a model can act on.** Return them as tool results with `isError` and a plain message: which field, what was wrong, what to send instead. Internal details never leak, and neither do other spaces' ids or names: outside your spaces, `not_found`.
7. **Limits:**
   - the request body is at most 1 MB;
   - at most 30 write calls a minute per token and 300 an hour per space, stored like the existing rate limits;
   - schema validation is bounded in depth and time;
   - external `$ref` is never dereferenced.

## §4. `import_route`: a whole route in one call

This is the tool creators will use most: they bring a route already written with Claude or another assistant, and upload it in one go.

1. **The input** is one document: the route details, then modules, then lessons, then blocks, in the blocks schema `core` already has.
   - Publish its JSON Schema, generated from the zod schema, so models can follow it.
   - Add a short guide as an MCP resource, `learning-routes://guides/route-format`, in Spanish and English, with one small complete example using invented content.
2. **Validation.**
   - Everything is checked before anything is written. The answer lists every problem at once, each with its path (`modules[1].lessons[3].blocks[0]`), capped at 50.
   - Limits: 30 modules, 300 lessons, 5,000 blocks.
3. **One transaction.**
   - The import creates a new draft route, or replaces the draft of an existing route the person can edit (`route_id` plus `draft_revision`).
   - It never touches a published version: students keep what they have until `publish_route`.
4. **Content is data.** Treat imported text as untrusted:
   - strip unknown fields;
   - accept no HTML outside what the blocks schema allows;
   - links only `https`;
   - media only by URL, with no fetching in this STEP.

   Rendering it is already escaped; test it with hostile fixtures (script tags, `javascript:` links, giant strings, deeply nested JSON).
5. **The result:** the route id, the new `draft_revision`, counts, and the next step in words: "Revisa el borrador y, cuando quieras, publícalo con publish_route."

## §5. For creators: how to connect

1. **`docs/mcp.md`, in Spanish and English:**
   - the server URL;
   - how to add it as a custom connector in Claude, Claude Code and ChatGPT (verify each one's current steps);
   - what each scope allows;
   - how to disconnect;
   - three example requests a creator can type.
2. **A page on the app host, "Conecta tu asistente", under Enseñar,** saying the same in short, with the URL and a copy button. That is the only JavaScript it needs.
3. **Testing locally:**
   - the MCP Inspector and Claude Code against `wrangler dev`, written as steps in `docs/mcp.md`;
   - Claude on the web needs a public URL, so that test waits for STEP 6.

## §6. Tests that prove it

1. **Authorization:**
   - no token → 401 with `WWW-Authenticate` pointing to the protected resource metadata;
   - a wrong `aud`, an expired token, another issuer, a revoked token → 401;
   - a missing scope → 403 `insufficient_scope`;
   - a refresh token reused → the chain is revoked;
   - a student-only account gets no token.
2. **Tenancy:**
   - a token for a person in space A cannot read or write space B, through any tool, and gets `not_found`;
   - an assistant cannot publish even with `routes:publish`;
   - two tenants, every tool.
3. **The protocol:**
   - `server/discover` answers;
   - header and body disagreement is refused;
   - a foreign Origin is refused;
   - every tool's `structuredContent` validates against its `outputSchema`.
4. **`import_route`:**
   - a complete valid route imports and publishes, and appears on the creator's page and in Mis rutas after "Empezar gratis";
   - an invalid one writes nothing and lists every problem;
   - a stale `draft_revision` is refused;
   - the hostile fixtures render as text.
5. **The whole path, in the browser and a real MCP client (the SDK's client in the test suite):**
   1. sign in;
   2. consent;
   3. `list_spaces`;
   4. `import_route`;
   5. `publish_route`;
   6. the route page on the creator's host;
   7. "Desconectar" in Conexiones;
   8. the next call → 401.
6. **Accessibility and visuals:** axe and visual baselines for the consent, Conexiones and "Conecta tu asistente" screens, at 390 and 1440 px, light and dark.

## Report, in one message

- **PRs:** each one, with its screenshots and green run.
- **Numbers:** the Worker sizes, and where the MCP runs and why.
- **Verifications:** each "verify" and what it found, including which clients support CIMD, and whether any needs dynamic registration or the legacy handshake.
- **Copy:** every new string, as links to the copy files.
- **Departures and questions:** every departure and its reason, and the questions for the owner.
- **The owner's test:** the exact steps to connect Claude Code on the Mac to the local server and import a small route, numbered, one action each.
