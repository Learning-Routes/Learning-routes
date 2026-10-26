# STEP 44 — The new platform: its foundations, and the behaviour we keep

**Written:** 26 October 2026 by the reviewer. **Base:** `origin/main` of this repository (Rails), and a new,
empty repository for the platform.

## 0. Why this step exists

Learning Routes is no longer a product that sells its own AI-generated routes to learners. It becomes an
agent-native platform: creators build routes by talking to agents, publish them on their own page, and sell
them to their own students. The owner approved the vision on 26 October (the doc "Learning Routes: visión de
la plataforma") and the stack:

- **TypeScript everywhere**, in a pnpm + Turborepo monorepo.
- **Cloudflare** as the one platform: Workers, Durable Objects (one per agent session), Workflows, Queues,
  R2, Stream, Cloudflare for SaaS (creator domains).
- **React Router 7** (framework mode, on Workers) for every page: landing, creator studio, creator pages,
  the student's route.
- **Hono** for the API, the MCP endpoint, the CLI's endpoint and payment webhooks. Not Elysia: its Cloudflare
  adapter is marked experimental by its own documentation.
- **Postgres on Neon** through Hyperdrive, with **Drizzle**. **Better Auth** for accounts. **OpenRouter**
  for every model (text, image, speech). **Stripe Connect** for payments, later.
- A **`core` package** holds every business rule and depends on no platform (no Cloudflare, Hono, React or
  database driver imports). It is what makes a later move to another host a matter of weeks.

This Rails app stays live on learningroutes.com while the platform is built beside it. It only gets stability
fixes (STEP 42). **STEP 43 is paused**: add one line under its title, `Paused on 26 October 2026: the learning
experience is redesigned on the new platform (STEP 44 onward).`

The platform is not a rewrite from memory. It reuses three things from this repository, and this step sets
up all three:

1. **Behaviour**, captured as golden fixtures from the Rails code (§1).
2. **Assets** that are already JavaScript, CSS or data (§2.4–§2.6).
3. **Lessons**: the bugs the audits and STEPs found become rules of the new code (§3).

## Batch rules

- Two PRs: **PR A** in this repository (§1 and the STEP 43 note), **PR B** in the new repository (§2, §3).
- One commit per item, red-first tests where a behaviour is added. The STEP file itself is the first commit of
  PR A: `docs(steps): STEP 44`.
- Work straight through. Stop **once**, at the end, for the reviewer.
- If an item needs a decision from the owner, write the question in the PR description, skip it, keep going.
- Nothing in either repository may say it was made with AI: no co-author trailers, no "generated with" lines,
  no mentions in docs or comments. Instruction files for agents, if any, are named for the work
  (`docs/WORKING_AGREEMENT.md`), not for a tool.
- No secrets in either repository. Local values live in `.dev.vars` / `.env`, both ignored.

## §1 — PR A: capture the behaviour we keep (this repository)

Add `lib/tasks/characterize.rake` with one task per unit, plus `rake characterize:all`. Each task writes
JSON to the directory in `ENV["OUT"]` (default `tmp/characterization/`). Rules for every task:

- **Read-only.** Wrap each task in a transaction that always rolls back. No AI calls, no network, no jobs
  enqueued. Freeze time with `travel_to` so dates are stable.
- **No personal data.** Fixtures hold content and numbers only: no user ids, emails, names, IPs or tokens.
- **Deterministic.** Running the task twice produces byte-identical files (sort keys and arrays).
- Each file is `{ "unit": "...", "source": "<path:line of the Ruby code>", "captured_at": "<frozen time>",
  "cases": [ { "input": ..., "output": ... } ] }`.

The units and the minimum number of cases:

| File | Unit | Cases |
|---|---|---|
| `block_registry.json` | `ContentEngine::LessonBlocks`: types, fence types, heading map (ES and EN), authored vs system types, default titles, `known?` | one case with the whole registry |
| `block_grader.json` | `LearningRoutesEngine::BlockGrader#call` and `.answerable?` for `check`, `drag_drop`, `fill_blank` | ≥ 200: real sections from the dev database's `parsed_sections`, plus edge cases (empty payload, missing options, no correct answer, accents, case, whitespace, punctuation in `normalize`) |
| `gating.json` | `.gradable?`, `.gating?`, engagement-only for every block type | every type |
| `fsrs.json` | `LearningRoutesEngine::SpacedRepetition`: `review` over rating sequences, `retrievability`, `next_interval` | ≥ 100 sequences of 1–12 reviews at varied elapsed days, every rating, new and existing cards |
| `attempt_rating.json` | `BlockAttempt` mapping from attempts to an FSRS rating, including the flashcards worst-card rule and the release after 3 failed tries | every branch |
| `lesson_parser.json` | `ContentEngine::LessonSectionParser` on lesson markdown | every lesson body in the dev database (cap 500) plus every markdown fixture in the test suite |
| `cost_estimate.json` | `AiOrchestrator::CostTracker.estimate_microcents` | every model in the pricing table × at least 5 token mixes (input, cached, cache write, output, audio where it applies) |
| `spend_limits.json` | `SpendGuard` decisions (allowed or refused, and why) for the daily global cap, the per-user cap and the rate limit | ≥ 30 situations around each limit |

Add a short test that runs each task against the test database and checks the file shape, so the task keeps
working while Rails is alive. Commit the task and its test, **not** the generated fixtures (they go to PR B).

## §2 — PR B: the new repository

**2.1 The repository.** Create `Learning-Routes/platform` (private). If `gh` is authenticated, run
`gh repo create Learning-Routes/platform --private --clone` inside `~/Documents/`; if not, stop and ask the
owner. Default branch `main`, protected later by the owner.

**2.2 The workspace.** pnpm workspaces + Turborepo, Node 22 LTS, TypeScript `strict`, ESM only. One lint and
format tool for the whole repo (Biome), Vitest for tests. Pin every dependency to an exact version. Layout:

```
apps/web        React Router 7 on Workers (start from Cloudflare's official React Router template)
apps/api        Hono on Workers
packages/core   domain, schemas, rules: no platform imports
packages/ui-tokens   Ciruela tokens and fonts
packages/journey     the route map modules
docs/           ADRs, lessons, working agreement
```

Both apps run locally with `pnpm dev` (`wrangler dev`). Neither is deployed in this step. `apps/web` shows
one page: the Learning Routes name and the line "Lo que sabes, convertido en una ruta.", styled with the
tokens, light and dark. `apps/api` answers `GET /health` with `{ ok: true, version }`.

**2.3 `packages/core`: the pieces as schemas.** With Zod, define and export types for: `Space`, `Membership`
(roles: owner, coeditor, assistant, student; plus the platform operator), `Route` (open or closed, free or
paid, versioned, `forkedFrom`), `Module`, `Lesson` (with prerequisites, so a route is a graph), `Block`,
`Resource`, `Offer` (one-time, subscription, lesson package, promo code, group price, currency), `Enrollment`,
`Progress` (per student, never stored on the content), `Change` (every agent or creator action: who, what,
before, after, so it can be shown, approved and undone) and `CreditLedgerEntry`.

`Block` is a discriminated union on `type` with one schema per type in the registry fixture: the 13 authored
types (concept, check, tip, example, summary, drag_drop, fill_blank, code_playground, simulation, scenario,
flashcards, visual, motion) and the 3 system types (audio, audio_explainer, video). Field names come from
what `lesson_parser.json` actually produces. Every string a student reads is a per-locale map, for es, en,
pt, fr and it.

A Biome or ESLint rule fails the build if anything under `packages/core` imports `cloudflare:*`, `hono`,
`react`, `drizzle-orm` or a database driver.

**2.4 Golden fixtures.** Copy the JSON from PR A into `packages/core/test/golden/`. In this step, the tests
only prove the schemas fit reality: every recorded section in `lesson_parser.json` and `block_grader.json`
parses with `Block`, and the registry fixture lists exactly the types the union defines. Porting the grader,
FSRS and the cost rules to pass these fixtures is STEP 45; leave a skipped test per unit naming that.

**2.5 `packages/ui-tokens`.** Copy the Ciruela token blocks (light in `:root`, dark in
`html[data-theme="dark"]`) from `app/assets/tailwind/application.css` into `tokens.css`, plus a typed
`tokens.ts` with the same values, and the Archivo and DM Mono font files. Keep the token names.

**2.6 `packages/journey`.** Copy the six modules from `app/javascript/lib/` (`journey_camera`,
`journey_map_layout`, `journey_map_paths`, `journey_terrain`, `landing_placement`, `card_tilt`). Convert them
to TypeScript with the smallest changes that compile. Their tests today are Ruby files under
`test/javascript/` that drive node (`*_test.rb`, with `journey_shapes.rb` and `fixtures/`): port every
assertion to Vitest, unchanged in meaning.

**2.7 CI.** GitHub Actions on every push and PR: install, typecheck, lint, test, build both apps.

## §3 — PR B: the docs that carry the decisions

- `docs/adr/0001-stack.md`: the stack above, why, and the fallback (the same packages on Next.js and Vercel).
- `docs/adr/0002-core-boundary.md`: what goes in `core`, what never does, and the lint rule that enforces it.
- `docs/LESSONS_FROM_V1.md`: each lesson as a rule, with the v1 file that proved it. At least:
  1. An AI job is claimed atomically before it starts; a poll never enqueues a second one
     (`steps_controller.rb`, `content_pipeline_job.rb`, ROADMAP_v3 §1a).
  2. Every AI call, text, image or speech, goes through one gate that checks the cost and rate limits
     (`model_router.rb`, `audio_generator.rb`, ROADMAP_v3 §1c).
  3. A background job never writes back a whole document it loaded minutes earlier; it updates the fields it
     owns (`media_prefetch_job.rb`, ROADMAP_v3 §1d).
  4. Content added after a purchase (reinforcement, new steps) inherits the access of where it is inserted
     (`adaptive_difficulty.rb`, ROADMAP_v3 §1b).
  5. A payment event is processed exactly once, a refund revokes what it must, and expired price links are
     rejected (`order_processor.rb`, ROADMAP_v3 §4).
  6. A section the student cannot answer is never a gate (`BlockGrader.answerable?`).
  7. Progress never lives on the content row (the v1 `route_steps` FSRS columns).
  Add any other lesson you find in `docs/audits/` and the STEP files that still applies to the platform.
- `docs/WORKING_AGREEMENT.md`: how work is done in this repository (STEP files, one PR per batch, red-first
  tests, golden fixtures before ports, no AI mentions, no secrets).
- `README.md`: what the platform is in two sentences, how to install and run it, where the docs are.

## Done when

- [ ] PR A: `rake characterize:all` runs twice with byte-identical output; its shape test is green; the
      STEP 43 note is in.
- [ ] Fixture counts meet the table in §1; no personal data in any fixture.
- [ ] PR B: `pnpm install && pnpm test && pnpm build` green locally and in CI.
- [ ] `pnpm dev` serves the web page and `/health` locally.
- [ ] Every recorded section parses with the `Block` schema; the registry and the union agree.
- [ ] The `core` boundary rule fails a test import of `hono` (prove it once, then remove the probe).
- [ ] The journey modules' tests pass under Vitest.
- [ ] The three docs and the README exist and say what §3 asks.

## Stop

Open both PRs. In PR B's description, list: the fixture counts per unit, any Ruby behaviour that surprised
you while capturing it (it may be a bug we must decide to keep or fix), any `Block` field you had to guess,
and every question for the owner. Then stop for the reviewer.
