# ADR 0002: What goes in `core`

**Status:** accepted, 26 October 2026.

## Decision

`packages/core` holds the domain: the schemas of every piece (spaces, memberships, routes, modules, lessons, blocks, resources, offers, enrollments, progress, changes, the credit ledger) and the rules that act on them: grading a block, deciding whether a block gates, scheduling reviews, estimating cost, deciding whether a spend is allowed, checking access.

Code in `core` takes data in and returns data or a decision. It never does input or output itself. Anything that needs the outside world (a database, a model, a clock it cannot be handed, a queue, a request) receives what it needs as an argument, or `core` defines an interface that an app implements.

`core` never imports:

- `cloudflare:*` or any `@cloudflare/*` package
- `hono`
- `react`, `react-dom` or `react-router`
- `drizzle-orm`
- a database driver: `pg`, `postgres`, `@neondatabase/*`, `mysql2`, `better-sqlite3`, `@libsql/*`

Its only runtime dependency today is `zod`.

## How it is enforced

`biome.json` turns on `style/noRestrictedImports` for `packages/core/**` with the list above, at error level, so `pnpm lint` fails locally and in CI. It was proven once in STEP 44 with a test file in `packages/core/test` that imported `hono`: lint failed with the boundary message, and the probe was then deleted.

When a new platform package is adopted, add it to that list in the same change.

## Why

v1 spread its rules across controllers, jobs and views, so the same question had different answers in different places, and a rule could not be tested without the framework around it. A `core` with no platform imports runs in Vitest in milliseconds, is checked against the golden fixtures captured from v1, and moves unchanged if the host changes (ADR 0001, fallback).
