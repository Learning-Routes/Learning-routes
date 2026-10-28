# ADR 0001: The stack

**Status:** accepted, 26 October 2026 (the owner approved the vision doc "Learning Routes: visión de la plataforma" and this stack).

## Context

Learning Routes becomes a platform where creators build routes by talking to agents, publish them on their own page and sell them to their own students. The v1 Rails app stays live on learningroutes.com while this repository is built beside it. One person reviews every change, so the stack has to be small, typed end to end and cheap to run while there is little traffic.

## Decision

- TypeScript everywhere, in a pnpm and Turborepo monorepo. Node 22 LTS, `strict`, ESM only. Biome lints and formats the whole repository; Vitest runs every test. Every dependency is pinned to an exact version.
- Cloudflare is the one platform: Workers for every app, a Durable Object per agent session, Workflows for long jobs, Queues, R2 for files, Stream for video, and Cloudflare for SaaS for creator domains.
- React Router 8 in framework mode, on Workers through `@cloudflare/vite-plugin`, for every page: the landing, the creator studio, creator pages and the student's route. `apps/web` started from Cloudflare's official React Router template. The pinned version is 8.4.0, the newest 8.x release that was at least two weeks old when it was chosen.
- Hono for the API, the MCP endpoint, the CLI's endpoint and payment webhooks (`apps/api`). We did not pick Elysia because its own documentation marks its Cloudflare adapter as experimental.
- Postgres on PlanetScale (ADR 0005), reached through Hyperdrive, with Drizzle as the query layer.
- Better Auth for accounts.
- OpenRouter for every model call: text, image and speech.
- Stripe Connect for payments, later.
- `packages/core` holds every business rule and imports no platform (ADR 0002).

## Why

One language from the database schema to the page means one set of types, and the Zod schemas in `core` are checked at every boundary. Workers, Durable Objects and Workflows give an agent session a home with its own state and a way to run long jobs without a separate server, a queue broker or a job database. PlanetScale (ADR 0005) and Hyperdrive keep Postgres, which v1 already uses, without running it ourselves. OpenRouter puts every provider behind one key and one bill, which makes the single spending gate in LESSONS_FROM_V1.md (lesson 2) easier to hold.

## Fallback

If Cloudflare stops fitting, the same packages move to Next.js on Vercel: `core` does not change, the pages move from React Router to Next.js routes, Hono runs as a Next.js route handler, and agent sessions move from Durable Objects to a database row plus a queue. The boundary in ADR 0002 is what keeps that move to weeks.

## Consequences

- Workers limits (CPU time, memory, no long-lived sockets outside Durable Objects) shape the design of agent sessions and media jobs.
- Local development runs on `wrangler dev`; nothing is deployed until a later step decides how.
- The approved stack named React Router 7. React Router 8 shipped in June 2026, and Cloudflare's template moved to it, while 7 only receives security fixes, so the owner moved us to 8 (ADR 0003). On 8, Workers need no custom server entry and no future flags.
