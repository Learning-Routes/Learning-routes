# ADR 0004: The architecture after the bake-off

**Status:** accepted, 28 October 2026.

The reviewer built twelve frontends against one contract, ran the same browser suite on each, and reopened every layer with current sources. The full study is the reviewer's [architecture study](../architecture/2026-10-architecture-study.md). This records what the platform takes from it.

## Each part has one job

- **React Router 8 is for people:** every page, on Workers.
- **Hono is for programs:** the internal endpoint, public REST, MCP and webhooks.
- **`packages/core` holds the rules:** grading, scheduling, cost, spend, the action registry. It imports no platform (ADR 0002).
- **OpenRouter is the AI provider.**

## The storefront ships no React

A creator's storefront is server HTML with no hydration. A route in `app/routes/storefront/` exports `handle = storefront`, and the root then renders no `<Scripts/>`. The prototype measured 0.3 KB of JavaScript against 111 KB hydrated. Ours is 220 B gzip (`theme.js`), with a 1 KB budget. The student app and the studio are full React apps.

Every HTML response carries a strict CSP with a fresh nonce: scripts only from our origin or with that nonce, no inline styles, no `unsafe-inline`. That needs a custom `entry.server.tsx`, which ADR 0003 said we did not have; we have one now.

## One action registry

Every change is an action in `core`: a name, a kind (query or mutation), a description, a zod input and `run(ctx, input)`. `runAction` is the one gate. It validates the input, runs the action and reports the result, the same way for the browser, MCP and an agent. The internal endpoint, public REST, MCP's tool list and the browser's typed client all come from the registry. Browser code writes data only through that one client.

MCP follows the **2026-07-28** specification: stateless, with no `initialize` handshake, and long jobs answered with explicit handles that the client polls or streams. The endpoint comes in a later STEP; `mcpTools()` already produces its tool list, with `readOnlyHint` from each action's kind.

## Where data lives

- **Shared data** (spaces, routes, enrollments, the credit ledger) is in Postgres on Neon.
- **A live agent session** keeps its state in a Durable Object's SQLite, next to the code that runs it.
- **Analytics** go to a store outside the database, so reporting never slows the product.

## Agent output streams as server-sent events

An agent's progress reaches the browser as server-sent events with numbered ids. The browser's `EventSource` reconnects by itself with `Last-Event-ID`, and the session resends what was missed.

## Guardrails that fail the build

STEP 46 §2 made these CI steps, each proven once by breaking it:

- Biome, with the performance rules and a complexity limit;
- knip, for unused code and packages;
- dependency-cruiser, for the boundaries above;
- size-limit, for JavaScript budgets;
- a Worker size budget;
- the 14-day version rule, with Dependabot and osv-scanner;
- the AI cost guard: every model call goes through `core/ai/gate.ts`, with a model from the price table, a `max_tokens` and the spend gate.

Benchmarks of the hot functions are printed but do not fail yet.
