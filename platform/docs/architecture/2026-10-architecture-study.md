# Learning Routes: why React Router? The architecture from first principles

26 October 2026 · Gilber Garcia

## In short

React Router 8 stays, for different reasons than before and with four structural changes. My earlier reasons (“it is already installed”, “switching is cheap”) do not count: they were switching cost, not merit.

The real reason: it is the only option that serves both faces of Learning Routes with one framework. One face is the creator's storefront, which needs a server and SEO. The other is the student app and the creator studio, which run in the browser.

The four changes:

1. An **action registry** in `core`. The API, the MCP tools and the typed client are generated from it, so parity is guaranteed.
2. **Two Workers:** one for the API and the agents, one for the pages.
3. **Sessions and payments live only on `app.learningroutes.com`.** Creator domains carry no cookies.
4. **The agent writes an event log** that can be resumed, read the same way by the UI and by MCP clients.

Decided on 26 October: the new platform moves into the `Learning-routes` repository, students learn in the app, Stripe handles tax, and there is no mobile app in the plan.

After building and testing all twelve alternatives and reopening every layer, three things changed:

- **The storefront is server HTML without hydration.** It ships about 0.3 KB of JavaScript instead of 111 KB, measured in the bake-off, while the app keeps full React.
- **The rest of the stack holds on evidence:** one shared Postgres on Neon, Hono with REST, MCP and webhooks from one registry, server-sent events, Better Auth with fast patching, Cloudflare. Each section says what would change it.
- **One owner decision has to be revisited:** “no age asked” conflicts with Brazil's ECA Digital, which forbids self-declared age and is enforced from November 2026. Portuguese is a launch language, so this needs a Brazilian lawyer before selling there.

## On the argument: it is right on the main point

It is right: two of my arguments for React Router were switching cost, not merit. “It is already installed and merged” and “switching is cheap” say nothing about whether it is the best base. With agents and end-to-end tests, rebuilding a one-page frontend takes hours, not weeks.

Where I agree:

- **The cost of rewriting no longer decides.** What matters is the cost of running it: how often it breaks, how much upkeep it needs, and how well it serves the product.
- **The questions have to change.** “Which one is more mature?” mattered when a person had to learn the tool. For an agent, documentation, types and how easily everything can be tested matter more.
- **Confirmation bias is real.** Ask a model to justify what is already chosen and it will. This document starts from the requirements, not from what exists.

Where I disagree, or would add nuance:

- **Code is not the only thing that migrates.** Student data, URLs Google has already indexed, creator domains and payments in flight cannot be rewritten with tokens. They weigh even when the code does not.
- **A dependency's release pace still matters with agents.** Every new version changes what the agent learned, and its mistakes show up in production, not in the editor. Fewer changes mean fewer surprises.
- **New is not better for being new.** A cheaper migration makes mistakes cheaper, but it does not make any option right.

## What Learning Routes actually needs

Learning Routes is not one application. It is three surfaces with opposite needs, and that is where the decision lies.

| Surface | Who uses it | What it demands |
| --- | --- | --- |
| The storefront: the creator page, each route's landing page, the free modules, the marketing site | Anyone, arriving from Google or social media, on the creator's domain | Indexed by Google, fast on a cheap phone, little JavaScript, five languages, many domains on one server |
| The student app: the map, lessons, blocks, reviews | A signed-in student, on app.learningroutes.com | Heavy interaction, the animated map, reviews on time |
| The creator studio: the agent, the plan, approval, preview, versions | A signed-in creator, usually on a computer | Live streaming chat, complex on-screen state, undo, a lasting connection to the agent |

Three platform rules weigh on this:

- **Parity:** anything a button does, an agent can do through the API or MCP. The safest way is for the interface to use the same door as the agent, so permissions, credits and history are applied once.
- **A team of one plus agents:** few moving parts and a single language, because every extra part is something to watch.
- **Reviews on time:** spaced repetition only works if the student comes back on the right day. With no mobile app planned, reminders go by email and web push.

## The candidates, as of October 2026

I reviewed nine options. Six are out, on facts or on decisions already taken, not on taste. Three stay in play.

| Option | What it is | Status today | Verdict |
| --- | --- | --- | --- |
| [React Router 8](https://remix.run/blog/react-router-v8), framework mode | React rendered on the server, with loaders and actions | Stable since June 2026; Cloudflare's official template; CSP nonces documented. [Server Components](https://reactrouter.com/8.3.1/how-to/react-server-components.md) are still experimental | In play |
| Single-page app: Vite + TanStack Router + TanStack Query | React in the browser only, talking JSON to the API | Mature parts; nothing renders on the server; a strict CSP is trivial | In play |
| [Astro 7](https://astro.build/blog/astro-6-beta/) | Content sites with little JavaScript and interactive “islands” | [Cloudflare acquired Astro](https://thenewstack.io/cloudflare-acquires-team-behind-open-source-framework-astro/) in January 2026. Version 7 shipped in June 2026. It runs on workerd, and its CSP has been stable since version 6 | In play, for the storefront |
| [Expo Router](https://docs.expo.dev/router/web/server-rendering/), universal | One codebase for web, iOS and Android | Server rendering stable since SDK 58, with a Workers adapter | Out after 26 October: no mobile app in the plan |
| [TanStack Start](https://tanstack.com/blog/announcing-tanstack-start-v1) | React with a server and server functions | Recently stable. Supports CSP nonces, according to [Makerkit](https://makerkit.dev/docs/tanstack-supabase/security/csp). Changes very often | Out: it does what React Router does, with more churn |
| Next.js on [OpenNext](https://opennext.js.org/cloudflare) | Next.js adapted to Workers | Works with version 16. The Worker is capped at 10 MiB and Node middleware is not supported yet | Out: an adapter layer with no advantage for us |
| [Remix 3](https://infoq.com/news/2026/07/remix-3-beta-preview) | A rewrite without React, on a modified Preact | Stable since 3.0.0 on 1 October 2026; 3.1.0 followed on 23 October | Out: we would lose the React ecosystem |
| Hono JSX + htmx | HTML from the server, in fragments | Stable | Out: it does not suit the live studio or the animated map |
| SvelteKit or SolidStart | Other frameworks | Stable | Out: nothing they offer justifies leaving React |

## Each option against each surface

No option wins on all three surfaces, and that is what the earlier plan missed.

| Surface | React Router 8 with a server | Single-page app (TanStack) | Astro 7 |
| --- | --- | --- | --- |
| Creator storefront | Good: SEO, and React shared with the app | Poor: Google first sees an empty page, and the first render is slow on cheap phones | Best: almost no JavaScript, and a stable CSP |
| Student app | Good | Good | Weak: too much interaction for islands |
| Creator studio | Acceptable, though loaders and actions open a second path beside the API | Best: everything goes through the same API as the agent | Poor |

What decides is not the framework but where the data flows:

- **With loaders and actions,** the interface has its own path to the server, separate from the agent's. Parity can hold, but only through discipline.
- **With an app that only talks to the API,** parity comes by construction: if the button can do it, the API exposes it, and the agent can do it too.
- **The independent review showed** that neither guarantee is real on its own. Parity comes from the action layer, not from how pages render. That is why the decision below adds a registry.

## The recommended decision

One React Router 8 app with two route groups, with parity guaranteed by an action registry rather than by the framework. I got here after an independent review broke my first draft, which split the storefront and the app across two frameworks.

What changed from my draft, and why:

- **One framework, not two.** React Router 8 already does both jobs: the storefront renders on the server, and the app runs in the browser through `clientLoader`. Two routers would mean two ways of loading data for a team of one.
- **Parity does not depend on rendering.** A single-page app can break it too, for example with a button that chains three calls no agent has. The real guarantee is an action registry: each action is a schema plus a function in `core`, and the API route, the MCP tool and the typed client are generated from it. A test fails if the interface changes anything without going through a registered action.
- **No Astro for now.** Storefront pages only change when a creator publishes. They are rendered on publish and served from Cloudflare's cache, so speed comes from the cache, not the framework. A JavaScript budget in the tests guards it.

The full architecture:

&#91;embedded content: architecture · two Workers, one door for actions\]

The storefront, the app and outside agents all reach Hono, and every change goes through the action registry before it touches the database.

1. **Two Workers in the `Learning-routes` repository.** One holds the API, MCP, payment webhooks and agents; the other serves the pages. They talk over a service binding, and each deploys and rolls back on its own, so a storefront change cannot take payments down.
2. **Sessions and payments live only on `app.learningroutes.com`.** Sign-in, the studio, the student player and checkout are there. Creator domains show the storefront with no cookies, and their buttons lead to the app. A malicious block on a creator's page cannot steal sessions.
3. **Blocks are data, not code.** They are JSON validated by `core` and drawn by a single component. Anything that is creator code, such as an interactive page, runs isolated on a separate domain.
4. **The agent writes an event log.** Each agent session keeps a numbered list of events in its Durable Object. The interface and MCP clients read it the same way, through a stream that resumes after a dropped network or a closed tab.
5. **Reviews are submitted safely to retry.** Each review carries its own id and time, and the server recomputes FSRS, so a retry never counts twice. Reminders go by email and web push.
6. **Languages from the start:** the host identifies the creator, `/:lang/` comes first in the path, and content language is a field on each route version. None of the five languages is written right to left.
7. **Tax through Stripe:** Stripe Tax calculates and collects VAT and sales tax at checkout.

What changes in the next STEPs:

- **STEP 45** does not change: it is pure `core`.
- **STEP 46** first moves the new platform into the `Learning-routes` repository, keeping its history. Then it adds the action registry and the split into two Workers. Accounts are created only on `app.learningroutes.com`.
- **STEP 47** builds the single block renderer, the map, and the app's two route groups.
- **A one-day spike** tests the agent event log in the hard cases: closing the tab, dropping the network, deploying mid-run and approving from a second device.

## End-to-end walkthrough

I built the recommended architecture as a working prototype, then broke it on purpose. It passes all 16 browser tests: React Router 8, a gateway Worker, Hono with MCP, Durable Object agents and a shared action registry, run locally on workerd. What the prototype cannot prove yet is marked as not tested.

| Flow | Path through the parts | What can go wrong | How the design handles it | Proven |
| --- | --- | --- | --- | --- |
| A creator asks the agent for modules | App → Hono → agent Durable Object → registry → storage | Tab closed, network drop, deploy in the middle, approval from a phone, a stranger approves | Numbered event log, one step per alarm, approval checked against the owner | Yes: resume with no gaps, restart mid-run, second device, stranger refused |
| A creator edits by hand | App → Hono → registry | A button that does something no agent can | Every browser write goes through one API client to a registered action | Yes: every UI write is a registered action; no stray fetch in the code |
| An outside agent (ChatGPT, Claude) | MCP → Hono → registry | Tools drift from the UI; weaker validation | MCP tools are generated from the registry | Yes: same tool list, same result, same validation, no access without a session |
| Publish | Registry → storage → storefront | Drafts leak; stale pages | Storefront reads only the published snapshot; cache purged by tag on publish | Drafts: yes. Purge by tag: not tested, it needs real Cloudflare |
| A visitor on a creator domain | Gateway → pages Worker → API | Slow first paint, bad SEO, a session that leaks, unknown domains | Server-rendered, cacheable, cookies stripped, unknown host 404 | Yes: HTML has the content, no cookie sent or set, custom domain works, 404 |
| Five languages | Storefront | Missing translation; wrong alternate links | `title[lang]` falls back to the source language; five hreflang links | Yes |
| A creator's interactive block | Iframe → usercontent domain | Steals the session or reads the page | Sandboxed iframe with an opaque origin | Yes: no parent access, no cookies, no storage |
| A visitor buys a route | CTA → app → Stripe Checkout → webhook to the API Worker | Double charge; webhook replay | Idempotent webhook handling, a v1 lesson | Not tested: no Stripe here |
| A student reviews on a bad connection | Player → local queue → registry | Review lost offline; counted twice on retry | Queue in the browser, one id per review, the server recomputes FSRS | Yes: offline then online counts once; a retry is a duplicate |
| Review reminders | API → email or web push | Missed day | Scheduled job per due review | Not tested |
| Creator payouts | Stripe Connect | Tax, payouts per country | Stripe Tax at checkout; payouts later | Not tested |

What the prototype found that the plan had missed:

1. **The current `platform` page would fail the strict CSP.** Its `root.tsx` runs an inline theme script with no nonce. STEP 46 has to give it the nonce or move it to a file.
2. **Importing `core` in the browser pulls in the validation library.** A storefront page went from 2 KB to 93 KB until it imported a browser-safe file. `core` needs separate exports for browser code, and a lint rule that enforces them.
3. **React on the storefront costs about 111 KB of compressed JavaScript.** That is the price of hydrating a page that is almost all text. Serving the storefront without hydration brought it to 0.3 KB, with all 16 tests still passing.
4. **A creator's block can talk before the page listens.** Messages from the iframe need a small handshake or a retry, not a single message.
5. **`crypto.randomUUID` only exists on https pages.** Local development over http needs a fallback.

## The bake-off: every alternative, built and tested

Twelve frontends were built against one contract and run through the same 16 browser tests, one after another on an idle machine. Ten pass all 16. The biggest difference is not the framework but whether the storefront is hydrated: React Router 8 serving the storefront as plain HTML ships 0.3 KB of JavaScript, as little as Astro or Hono, and keeps one React codebase.

&#91;embedded content: measured in the prototype · 12 frontends, the same page, Chromium, gzip\]

Astro's figure is its one inline script; every other figure is downloaded files.

| Option | Tests passed (of 16) | Worker, compressed | Server response, median | Build | What decides it |
| --- | --- | --- | --- | --- | --- |
| React Router 8, storefront not hydrated | 16 | 162 KiB | 16 ms | 2.9 s | One React codebase for every surface; storefront components render on the server only. Interactive pieces on the storefront must be wired by hand |
| React Router 8, hydrated | 16 | 162 KiB | 16 ms | 2.9 s | The same app, paying React's runtime on every creator page |
| SPA app + Hono storefront | 16 | 23 KiB | 15 ms | 1.3 s | Smallest worker; two JSX dialects, so storefront and app cannot share components |
| Astro 7 | 16 | 177 KiB | 15 ms | 4.2 s | Best pure storefront; CSP by hashes only, added page by page; the studio would need islands, a second programming model |
| Hono JSX + htmx | 16 | 25 KiB | 15 ms | 0.2 s | Simplest toolchain; htmx expects HTML from the server, which clashes with JSON actions shared with MCP |
| Remix 3 | 16 | 37 KiB | 14 ms | 0.3 s | Not React; stable for 25 days; no Workers tooling, so the build is ours; its `css()` cannot run under the CSP |
| SolidStart 2 | 16 | 100 KiB | 17 ms | 5.2 s | Clean CSP out of the box; re-platformed weeks ago, with Solid 2.0 about to land |
| TanStack Start | 16 | 206 KiB | 17 ms | 3.0 s | Close peer of React Router with typed routing; very high churn; nonce wired by hand and exposed in a meta tag |
| Next.js 16 + OpenNext | 16 | 1,389 KiB | 38 ms | 14.8 s | Nonces force every page dynamic, cancelling its caching; Next and OpenNext versions broke each other within one patch |
| Expo Router (React Native Web) | 16, with two workarounds | 372 KiB | 19 ms | 2.6 s | Only path to one codebase with native apps; strict CSP needs a patch to React Native Web internals; the storefront is unstyled until JS runs |
| SvelteKit 3 | 15 | 71 KiB | 17 ms | 6.0 s | Fails the CSP: its route announcer writes an inline style; a 25-day-old major that agents still write as version 2 |
| SPA only (TanStack) | 15 | 1 KiB | 12 ms | 1.4 s | Fails server rendering: Google and slow phones get an empty page first |

How to read the numbers: all twelve ran through the same gateway, API and tests, one after another on an idle two-core machine, so the server timings compare with each other but not with production. Worker size counts the script only; the SPA's files are served as static assets. Versions were the newest releases at least two weeks old, pinned exactly, except where a security fix forced a newer one (Next.js).

What the bake-off changes in the recommendation: React Router 8 stays, now on measured merit, with one rule added. **The storefront is rendered on the server and not hydrated.** It ships about 0.3 KB, while the app and studio keep full React. The next best design, an SPA app with a Hono storefront, is as light but splits the code into two JSX dialects. Astro is the strongest storefront if the storefront ever becomes its own product.

## Every layer, questioned

The frontend was only one of the decisions taken on trust. Each layer below is reopened with the same method: the questions that matter for Learning Routes, the real options as of today with sources, a recommendation with its confidence, and what would change it. Five research tracks run in parallel; results land here as they come in.

| Layer | The question that was skipped | What we had assumed |
| --- | --- | --- |
| Hosting | Is Cloudflare the right home at all, against Vercel, Fly, AWS or staying on Hetzner? | Cloudflare |
| Data | Relational or not, Postgres or SQLite, one database or one per creator? | Postgres on Neon, with Drizzle |
| APIs | REST, RPC, GraphQL or MCP as the main API? A public API for creators? | Hono, REST plus MCP |
| Real time | Websockets, server-sent events or streamable HTTP? Is live co-editing needed? | Server-sent events from Durable Objects |
| Clients | Web only, an installable app, desktop, mobile? | Web; no mobile app |
| Security | Which auth, how tenants are isolated, how agents are contained, what the law asks | Better Auth; app-level checks |
| SEO | One creator on several domains: which page does Google keep? | Server rendering |
| The rest | Jobs, media, AI routing, email, observability, cost | Not decided |

## Data: one shared Postgres, with each kind of data in its right place

Keep one shared Postgres as the system of record, but do not put everything in it. Confidence: medium-high. The deciding fact is money: payments, enrollments, credits, payouts and the audit log need transactions that cross creators. That rules out SQLite-per-creator as the main store, however cheap it is.

The questions that matter:

1. **Where does the truth about money and ownership live?** It needs transactions across creators, which means one relational system of record.
2. **One database for everyone, or one per creator?** “Its own database on request” means per-creator is a premium add-on, not the default.
3. **Can a global edge reach it without paying a round trip per query?** Workers run everywhere; the database lives in one region.
4. **Does v1 migrate without transforming data?** v1 is Postgres, so Postgres to Postgres is a plain dump and restore.
5. **What if the vendor changes hands?** It already happened twice this year: [Databricks bought Neon](https://thenewstack.io/?p=22791787) in 2025, and [Supabase bought Turso](https://www.vktr.com/ai-platforms/supabase-buys-turso-to-scale-ai-agent-databases/) on 2 October 2026.

| Option | Facts, October 2026 | Fit |
| --- | --- | --- |
| [Neon](https://neon.com/pricing) | Owned by Databricks. Launch plan $0.106 per compute-hour, $0.35 per GB-month, restore up to 7 days, 100 projects. Scale plan $0.222, 30 days, 1,000 projects. Scales to zero, waking in a few hundred ms | Best fit now: plain Postgres, cheap while idle, a project per creator by API |
| [PlanetScale Postgres](https://planetscale.com/pricing) | Single node from $5; $30 for three nodes with high availability; can be billed through Cloudflare. No scale to zero | The step up when load or tail latency demands it |
| [Supabase](https://supabase.com/pricing) | Pro $25; point-in-time recovery costs $100 a month per 7 days | Pays for bundled auth and storage we would not use |
| [Prisma Postgres](https://www.prisma.io/pricing) | Billed per operation | Punishes frequent small writes, which is the agent workload |
| [Cloudflare D1](https://developers.cloudflare.com/d1/platform/limits) | SQLite, 10 GB per database hard cap, 50,000 databases per account, read replication in beta | Good for shards; no transactions across databases |
| [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/platform/limits/) | 10 GB per object, unlimited objects, EU and US jurisdictions | Ideal for live agent sessions and an isolated store per creator |
| [Turso](https://turso.tech/pricing) | SQLite, databases from $4.99; now part of Supabase, with its cloud roadmap unclear | Avoid for now: ownership risk |
| [Xata](https://xata.io/pricing) | Postgres with branches, about $9 a month and up | A viable fallback from a small vendor |
| [Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html) | No triggers, at most 3,000 rows per transaction, optimistic retries | Constraints that add friction, for multi-region we do not need |
| Self-hosted on Hetzner | Dedicated servers from about €43 a month | Cheapest at a million students, but backups and failover fall on one person |

Where each kind of data goes:

- **Postgres on Neon, through Hyperdrive:** accounts, spaces, routes and their versions, enrollments, payments, the credit ledger and the audit log. Every row carries `creator_id`, and a query layer in `core` enforces it. Row-level security is a second guard.
- **Durable Objects SQLite:** each live agent session (its plan, scratch state and event log). On approval, the session writes its result to Postgres in one transaction.
- **Outside the database:** analytics and raw event streams go to Workers Analytics Engine or R2.
- **Search for agents:** pgvector in the same Postgres, so tenant and entitlement filters run in the same query. Vectorize later, for very large collections.
- **A creator's own database:** a separate Neon project, created by API and sold as an add-on. It is plain Postgres, so the creator can take a dump with them.
- **Backups:** Neon's restore window, plus a nightly dump to R2, so recovery never depends on one vendor.

Why Drizzle: one typed schema in TypeScript covers both Postgres and Durable Object SQLite, so agents use one tool. Migrations stay as reviewed SQL files.

What would change this:

- **Every creator gets an isolated database by default**, or a contract demands it. Then the main store becomes SQLite in a Durable Object per creator, with a thin shared database for billing.
- **EU law or customers require EU-resident data.** Add an EU project, or use the EU jurisdiction of Durable Objects for personal data.
- **Neon raises prices or neglects self-serve.** Move to PlanetScale or Xata with a dump; Hyperdrive and Drizzle stay the same.
- **Sustained heavy load or tail-latency complaints.** Move to PlanetScale with high availability.

Rough cost, under unverified assumptions about how much each student writes: about $5–25 a month for 1,000 students, $250–500 for 100,000, and $1,500–4,000 for a million. At that last size, PlanetScale Metal or a dedicated server should be re-priced.

## APIs: one registry, three doors

One action registry generates three surfaces: the internal endpoint the app uses, a public REST API with OpenAPI, and MCP. Confidence: high. Every outside caller wants something different: Zapier and LMS tools want REST and signed webhooks, and AI clients want MCP. Nobody here wants GraphQL. If any surface is written by hand, parity drifts.

| Option | Facts, October 2026 | Fit |
| --- | --- | --- |
| REST with OpenAPI generated from zod | `@hono/zod-openapi` 1.6.3. [Stripe's MCP](https://docs.stripe.com/mcp) is a thin layer over its REST API; [Notion's MCP](https://developers.notion.com/docs/mcp) uses the Notion API | Required for the public API |
| [oRPC](https://orpc.dev/docs/openapi/openapi-specification) | One router serves RPC and OpenAPI 3.0 to 3.2, with a typed client | Good, but our registry already does this job |
| [tRPC](https://trpc.io/docs/openapi) | OpenAPI support is still “alpha” | Poor for a public API |
| [hono/client](https://hono.dev/docs/guides/rpc) | Types inferred from the app; its docs warn the editor slows as routes grow | Poor at registry scale |
| GraphQL | Linear and Shopify keep it, but expose MCP for agents | No: query-cost limits for nothing |
| [MCP 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) | Now stateless: no `initialize` handshake and no session header. Long state goes through an explicit handle a tool returns. Clients must validate the issuer on OAuth | A first-class door, not the main one: Zapier, LMS tools and websites cannot use it |

The design:

- **Internal endpoint:** `POST /api/a/:name`, with a small typed client generated from the registry's types, not inferred by Hono.
- **Public REST:** `/v1`, with an OpenAPI 3.1 document generated from the same schemas. Only additive changes; a dated version header appears at the first breaking change.
- **MCP:** the stateless 2026-07-28 spec at `/mcp`. Agent runs are long, so a tool returns the session id and the client reads its events.
- **Webhooks to creators:** signed with [Standard Webhooks](https://www.standardwebhooks.com/), delivered from the same per-creator event log, with Zapier-style subscribe and unsubscribe.
- **Keys and limits:** scoped, hashed API keys. Approximate rate limits per key with the Workers binding; credit budgets enforced exactly in the database.
- **Dangerous writes:** publishing, deleting and spending past a cap need a human approval in the app, which then hands the agent an approval token. That is plan, approve, build, as an API.

What would change this: past about 40 tools, MCP should expose a search tool and an execute tool instead of one tool per action, the way Cloudflare's own servers do.

What the prototype must fix: it speaks the 2025-06-18 version of MCP with `initialize`. It has to move to 2026-07-28.

## Real time: server-sent events now, websockets only when co-editing ships

Agent output streams as server-sent events from the session's event log, with numbered events that resume after any drop. No websockets and no CRDT in the first version. Confidence: medium. The real question is whether a creator and an agent ever type into the same lesson at the same moment. With plan, approve and versions, they do not: the agent proposes a change, the creator approves it, and every block write checks its version number.

| Option | Facts, October 2026 | Fit |
| --- | --- | --- |
| Server-sent events | No effective duration limit on Workers; the browser reconnects with `Last-Event-ID` by itself | Agent output: yes. The prototype proves resume, restart and offline |
| [Websockets with Durable Object hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) | No duration billed while asleep; messages up to 32 MiB; every deploy disconnects every socket; a browser websocket cannot send an Authorization header | Only for presence and co-editing |
| MCP streamable HTTP | Streams belong to one request and cannot be resumed | Progress inside a single tool call |
| [WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport) | In browsers, but [not among Workers' protocols](https://developers.cloudflare.com/workers/reference/protocols/) | No |
| [Cloudflare Agents SDK](https://developers.cloudflare.com/changelog/product/agents/index.md) | Version 0.30, before 1.0, moving fast; its `McpAgent` class is already deprecated | Use its MCP handler; keep the core off its classes until 1.0 |
| CRDTs: Yjs, [Loro](https://loro.dev/blog/v1.0), [Automerge](https://automerge.org/blog/automerge-3/) | Yjs has the largest editor ecosystem; Loro adds git-like history; Automerge 3 cut memory more than tenfold | Not needed until several people edit one lesson at once |

Risks to manage:

- **An open stream keeps the session awake and billed.** Close it on `done`, cap idle time, send keepalives.
- **Deploys drop every connection.** Clients already resume by event id; keep it that way.
- **If websockets come later,** authenticate the upgrade with the app cookie or a short-lived single-use ticket, never an API key in the URL.

What would change this: several people editing one lesson at the same time. Then websockets on Durable Objects with Yjs, or Loro if branching and merging versions matters more than editor plugins.

## Clients: an installable web app now, with a measured trigger for a store app

“No mobile app” holds, with one condition: it must not cost reviews. Spaced repetition only works if the reminder arrives, and iOS sends web push only to sites a student adds to the Home Screen by hand. Confidence: medium-high.

| Option | Facts, October 2026 | Fit |
| --- | --- | --- |
| Installable web app (PWA) | iOS push only after the student adds it to the Home Screen; no install prompt; [Declarative Web Push](https://webkit.org/?p=16535) since iOS 18.4 needs no service worker; no background sync on iOS | Best now: one codebase, no store fees, no store age rules |
| [Capacitor 8](https://blogs.apievangelist.com/blogs/ionic-2025-12-09-announcing-capacitor-8/) | The same web app inside a native shell, with native push and widgets | The phase-2 wrapper: cheap to maintain |
| [Expo SDK 58](https://expo.dev/changelog/sdk-58) | Shipped 15 October 2026; a new SDK every 2–4 months | A second interface and a fast upgrade treadmill |
| [Tauri v2](https://v2.tauri.app/plugin/) | Remote push and in-app purchase only through community plugins | Not mature enough on mobile |
| Electron | A major release every 8 weeks | No case for it |
| A desktop studio for creators | Claude and ChatGPT already act as the desktop client through MCP | No. A thin CLI over the API only if creators ask |

What the stores would cost, if an app ever ships:

- **Apple, US:** apps may link to web checkout. Whether Apple may charge a commission on those links is [before the Supreme Court](https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/).
- **Apple, EU:** [15% on linked-out purchases](https://ppc.land/apple-kills-eu-per-install-fee-for-5-commission-on-non-app-store-sales/) since 1 October 2026, 10% for small businesses.
- **Apple, elsewhere:** content bought on the web may be used in the app only if it is also sold as an in-app purchase.
- **Apple, one app per creator:** [guideline 4.2.6](https://developer.apple.com/app-store/review/guidelines/) bars template apps unless the creator submits them. That is why [Kajabi charges $199 a month](https://help.kajabi.com/en/articles/12696396-kajabi-branded-app-faqs) and makes creators use their own developer account.
- **Google Play:** [10% on the first $1M](https://www.androidheadlines.com/2026/06/google-play-store-external-billing-fee-changes.html) in the US, UK and EEA when billing is outside Play.
- **Age:** store apps bring age-assurance laws, such as [Texas since June 2026](https://9to5mac.com/2026/06/03/apple-says-texas-app-store-age-assurance-rules-start-tomorrow-after-court-ruling/). Staying on the web avoids them for now.

The phases:

1. **Now:** the installable web app. FSRS runs on the device, with the next seven days of reviews cached. Web push with a short “add to Home Screen” guide on iOS, and email reminders for those who never install it.
2. **Measure:** the iOS install rate, and the share of due reviews finished on iOS against Android and desktop.
3. **If iOS falls behind clearly, or fewer than about 20% install:** one Capacitor “Learning Routes” app where students log in and learn, with native push and a widget of reviews due. Nothing is sold inside it outside the US.
4. **Later, as a paid add-on:** branded apps per creator, published under the creator's own developer account.

Competitors, for reference: [Duolingo](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm) is app-first and lives on streaks; Skool and Kajabi have apps with push; Teachable has a plain student app. Course students expect an app eventually, mostly for reminders, not for buying.

## Security: the decision most likely to change is “no age asked”

Brazil's [ECA Digital](https://www.mayerbrown.com/ja/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies) reaches foreign providers and has been in force since 17 March 2026. It expressly forbids self-declared age as age verification. Sanctions start in November 2026, with fines up to 10% of revenue in Brazil. Portuguese is a launch language, so this needs a Brazilian lawyer before selling there. It is the largest open legal risk in the plan.

The five questions that decide security here:

1. **Who owns the student record?** The platform charges the student, but the creator owns the relationship. That split decides who is the data controller and what a creator's export contains.
2. **Which origin runs creator code?** If creator script runs anywhere that shares cookies with the app, or on the page with the checkout button, nothing else matters.
3. **What can an outside agent do with a creator's token?**
4. **Do child-protection laws make “no age asked” untenable?**
5. **Accounts: buy or build?** With agents, writing auth is cheap; auditing and patching it is not.

| Option for accounts | Facts, October 2026 | Fit |
| --- | --- | --- |
| [Better Auth](https://better-auth.com/blog/better-auth-joins-vercel) | Joined Vercel on 7 July 2026, saying it stays open source and platform-agnostic. Has an [OAuth 2.1 provider](https://www.better-auth.com/docs/plugins/oauth-provider) suited to MCP. Several high-severity CVEs in 2026, all fixed by 1.6.22 | Best fit, with a patch window measured in days. Workers support not verified |
| [WorkOS AuthKit](https://workos.com/pricing) | Free to a million users; custom domain $99 a month; sells MCP auth | The strongest option to buy instead. Students would live in a vendor |
| Clerk | A critical 9.1 middleware bypass in 2026 | Adds little over WorkOS |
| Auth.js | Now maintained by the Better Auth team | Not for new work |
| Our own passkeys | Cheap to write; the risk is recovery and account linking, exactly where Better Auth's CVEs landed | No |

The decisions:

- **Accounts:** Better Auth, pinned to 1.6.22 or later, patched within 72 hours of an advisory. Passkeys plus email codes; no open password signup; no automatic account linking. If another critical CVE appears, or Workers support fades after the Vercel deal, switch to WorkOS.
- **Sessions:** a host-only cookie on `app.learningroutes.com`. Creator subdomains move to a **separate domain listed on the Public Suffix List**, so script on one creator's site can never touch the app's cookies.
- **Outside agents:** OAuth with scopes per creator workspace (`routes:read`, `routes:write`, `publish`, `credits:spend`). Student personal data gets its own scope, off by default. Publishing, deleting and spending past a cap need approval in the app.
- **Tenant isolation:** one scoped data layer in `core`, with Postgres row-level security as a backstop. The app role cannot bypass it, and the tenant is set per transaction. “Provable” means a CI test that seeds two creators and calls every route and every tool as creator A, expecting zero rows of B.
- **Untrusted content:** markdown sanitized to an allowlist on the server. Creator HTML runs only in a sandboxed iframe on the separate content domain, which the prototype already proves. Published model output goes through the same pipeline.
- **Agents:** imported sources are data and can never widen an approved plan. The plan pins the tools allowed and a hard token budget, checked before every model call. No student personal data in an agent's context. This follows the [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/): prompt injection, excessive agency and unbounded consumption.
- **Payments:** hosted Stripe Checkout keeps us in the lightest PCI category, but only if the checkout button lives on the app origin behind a strict CSP, never inside creator HTML. Webhooks are verified on the raw body, deduplicated by event id, and processed in a queue.
- **Privacy defaults for everyone:** the [UK Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/) covers education sites likely to be used by under-18s, and lets a service apply its standards to all users instead of checking ages. High-privacy defaults, no profiling, no nudges. Terms set a minimum age of 13. Export and deletion exist as both a button and a tool.

For the pilot, before anything else: hardened auth, the separate content domain, verified webhooks, rate limits, spend caps, terms and privacy defaults. Before the second creator: the two-tenant isolation test. Later: OAuth for outside agents, custom domains, and the Brazil review.

## SEO: one canonical host per creator, and no indexed fallbacks

Each route has one URL that ranks: the creator's custom domain if they have one, otherwise their subdomain, with a 301 from the other. Confidence: high. A route can appear on three hosts and in five languages, so without this rule Google picks one at random and the rest dilute it.

The rules:

- **Canonical:** the subdomain until a custom domain exists, then a 301 that keeps the path. [Google treats redirects as the strongest canonical signal](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls). The learningroutes.com catalog shows short summaries that link to the creator, never copies.
- **Robots and sitemaps per host:** built by the Worker from the Host header, listing only the canonical host, with the language alternates inside the sitemap.
- **Languages:** [hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions) links are reciprocal, include the page itself, and use full URLs, with `x-default` pointing to the source language. **A missing translation gets no URL.** This corrects the prototype: it serves source-language fallback on every language URL, and Google counts those as duplicates. A fallback page must be `noindex`, or not exist.
- **Free and paid:** modules 1–5 are indexed in full. Paid lessons get a public outline page: title, objectives, a preview. Gated content is never in the HTML, and pages with a free lead-in use [paywalled-content markup](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content).
- **Structured data:** Google [removed Course Info rich results](https://searchengineland.com/google-to-drop-support-for-several-rich-result-types-to-simplify-the-search-results-page-456969) in 2025. The [Course list carousel](https://developers.google.com/search/docs/appearance/structured-data/course) remains, in English only, for summary pages with three or more courses. Emit `Course` with `provider`, `inLanguage`, `offers` and `isAccessibleForFree` anyway: it is cheap and other engines read it.
- **Speed:** [Google's thresholds](https://web.dev/articles/vitals) are LCP 2.5 s, INP 200 ms and CLS 0.1. Our budget for public pages is LCP 1.8 s.
- **Rendered on publish, served from cache:** public HTML is built at publish time, per language, and purged by tag on the next publish. Prices and login state live in small client widgets; the HTML never varies by cookie.
- **Social cards:** a 1200×630 image per route and language, generated on publish and stored in R2.
- **AI search:** [llms.txt is close to hype](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/): 97% of such files got no requests, and [Google says no AI-specific files are needed](https://developers.google.com/search/docs/appearance/ai-features). Generate one because it costs nothing. The real AI channel is the MCP server, plus clean server-rendered HTML.
- **Translations by AI:** indexed only after the creator approves them, so they never read as scaled machine content.

**Custom domains:** [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) includes 100 hostnames, then $0.10 per hostname a month, up to 50,000. A bare domain such as `example.com` [needs apex proxying](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/) through Cloudflare's sales team, so creators should use `learn.theirdomain.com`.

## Hosting and everything else: AI tokens are 90% of the bill

Stay on Cloudflare, with the exits built in. Confidence: medium. Hosting price does not decide anything: AI tokens are 90% or more of spend at every size. What decides is how well long agent runs survive, how few hours of operations one founder spends, how bad a mistake gets, and how easy it is to leave.

| Home | Facts, October 2026 | Fit |
| --- | --- | --- |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/index.md) | $5 a month base; up to 5 minutes of CPU per request; 128 MB per isolate; Node compatibility on by default since August 2026; [a preview per pull request](https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/) with its own Durable Objects | Strong for agent work that mostly waits on the network. Heavy media needs a container |
| [Vercel](https://vercel.com/docs/fluid-compute/pricing) | Billed on active CPU and provisioned memory | Workable, but memory is billed while waiting on the model, and there are no stateful sessions |
| [Fly.io](https://docs.fly.io/about/pricing) | 1 GB machine about $6.70 a month | Plain containers; queues and state are ours to run |
| [Railway](https://docs.railway.com/reference/pricing/plans) | $20 per vCPU-month | Simple, expensive per unit |
| Hetzner with Kamal, where v1 runs | Prices rose 30% to 175% across 2026 | No runtime limits and familiar, but one region, manual patching and no previews |

Service by service:

- **Agent runs:** [Workflows](https://developers.cloudflare.com/changelog/post/2026-07-07-workflows-billing-updates/) for durable steps, Durable Objects for live session state. [Trigger.dev](https://trigger.dev/pricing) is the alternative when a step needs real CPU or memory.
- **AI:** OpenRouter with our own provider keys (no fee on the first $25,000 a month), zero data retention on every request, and [Cloudflare AI Gateway](https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/) in front for spend limits, logs and caching. Keep a direct-provider fallback: [OpenRouter had two outages of over 30 minutes](https://openrouter.ai/blog/announcements/openrouter-outages-on-february-17-and-19-2026/) in February. Prompt caching cuts repeated input to a tenth of its price. Every call writes its usage to a ledger before credits are debited.
- **Files:** R2, with no egress fees. Video stays on standby; when it returns, Bunny Stream is the cheapest.
- **Email:** Resend or Postmark now. Cloudflare's own email service is cheaper but its sending is still in beta.
- **Search for agents:** pgvector in Postgres, so tenant filters and the creator's export include it.
- **Observability:** Workers Logs and traces, plus an error tracker.
- **Analytics and flags:** PostHog in cookieless mode; flags kept in a Postgres table, so an agent can flip them as a tool.
- **CI:** a Worker preview and a Neon branch per pull request.

Rough monthly cost:

| Size | Infrastructure | AI tokens |
| --- | --- | --- |
| Pilot, about 100 students | $15–30 | $50–150 per route built, plus a little student use |
| 10,000 students, 200 creators | $200–400 | About $4,000 for creators (charged back as credits), plus $130–2,600 for students |
| 1 million students | $5,000–15,000 | $13,000–260,000 for students alone |

What this means: the model chosen for student features and the prompt-cache hit rate matter far more than any hosting choice. Student AI is a cost the platform carries unless it is priced in.

What would change this: the video studio or heavy media returning (add containers or Trigger.dev), or a preference for zero lock-in over previews and edge delivery (Hetzner is defensible, and the cost difference is small).

## Questions answered on 26 October

- [x] Where does the new code live? It moves into `Learning-routes`, which becomes the new main folder.
- [x] Does the student learn on the creator's domain or on `app.learningroutes.com`? In the app.
- [x] Tax: if Learning Routes charges students worldwide, it likely owes each country's VAT. Stripe handles it.
- [x] Is there a mobile app? No.

## Sources

- [React Router v8 (Remix blog)](https://remix.run/blog/react-router-v8)
- [React Router: React Server Components, experimental](https://reactrouter.com/8.3.1/how-to/react-server-components.md)
- [Announcing TanStack Start v1](https://tanstack.com/blog/announcing-tanstack-start-v1)
- [TanStack Start and CSP (Makerkit)](https://makerkit.dev/docs/tanstack-supabase/security/csp)
- [Astro 6 Beta](https://astro.build/blog/astro-6-beta/)
- [Cloudflare acquires Astro (The New Stack)](https://thenewstack.io/cloudflare-acquires-team-behind-open-source-framework-astro/)
- [Expo Router: server rendering](https://docs.expo.dev/router/web/server-rendering/)
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)
- [Remix 3 beta (InfoQ)](https://infoq.com/news/2026/07/remix-3-beta-preview)
- [Cloudflare Agents with React (assistant-ui)](https://www.assistant-ui.com/docs/integrations/frameworks/cloudflare-agents/overview.md)
