# Foundations

Written by the reviewer, 28 October 2026. This is the first document to read before working on the platform. It says what the platform is, what it is built on and how it is built. The ADRs in `docs/adr/` record each decision and its reasons, and this document links them. When this document and an ADR disagree, the newer ADR wins, and this document is fixed in the same pull request.

Four facts shape every rule below:

- **The repository is public.** Anyone can read every line, every commit and every CI log, forever.
- **Other developers contribute.** A rule that lives only in someone's head will be broken by the next person who never heard it.
- **It is built for heavy traffic:** many creators, and students in the hundreds of thousands and beyond.
- **The core is hard to get right.** Grading, scheduling, money and permissions must be correct before they are fast.

So the rules are written down, and wherever possible a tool enforces them and fails the build.

## 1. What it is

Learning Routes is where creators build learning routes, with AI agents helping, and sell them to their students.

- A **creator** owns a **space** (English Unlimited is the first).
- A space holds **routes**. A route is a graph of **lessons**, grouped in **modules**, and each lesson is made of **blocks**.
- A creator **publishes** a route as an immutable **version**. A **student** enrolls in a version and learns with spaced repetition (FSRS).
- People and AI agents change things through the same **actions**. An agent can never do what the person it acts for could not.

## 2. What we have today

| Part | State |
|---|---|
| `packages/core` | The rules ported from v1 and checked against golden fixtures from the Ruby code: grading, FSRS scheduling, lesson parsing, credit cost and spend limits. The action registry and `review.submit`. About 1,750 tests. |
| `packages/route-map`, `packages/design-tokens` | The route map's geometry and the design tokens (renamed from `journey` and `ui-tokens` in Platform STEP 1). |
| `apps/web` | React Router 8 on Workers. The storefront is server HTML without hydration (220 B of JavaScript); the app and the studio are React. Strict CSP with a nonce per response. |
| `apps/api` | Hono on Workers. Today only `/health`. |
| Guardrails | Biome (performance rules, complexity limit 15), knip, dependency-cruiser boundaries, size-limit, a Worker size budget, the 14-day version rule, osv-scanner, and the AI cost gate. |
| Not yet | The database, accounts, tenancy, MCP, payments, the student experience in React. |

The Rails app at the repository root is v1. It keeps running until the platform replaces it.

**How the platform replaces v1:** gradually, never in one big switch.

1. **Build.** The platform grows inside `platform/`, under the name **New Learning Routes**, at `new.learningroutes.com`. learningroutes.com keeps serving v1.
2. **Move over, one part at a time.** Storefronts, then students, then the studio. Each part moves only once it passes its tests, and v1's data for that part is migrated with a checked script.
3. **Switch.** learningroutes.com points at the platform, and v1 stays read-only for a short, stated period.
4. **Retire v1.** The Ruby code is removed in one pull request. `platform/` moves to the repository root with its history, and the name drops "New".

Technical names keep their final form from the start: packages are `@learning-routes/*`, Workers are `learning-routes-*`. Only the visible name and the host change at the switch, so nothing has to be renamed twice.

## 3. What we build it on

| Layer | Choice | Why | What would change it |
|---|---|---|---|
| Pages | **React Router 8** on Cloudflare Workers | Server-rendered pages people use; the storefront ships no React. ADR 0004. | A storefront that needs more than 1 KB of JavaScript. |
| API, MCP, webhooks | **Hono** | Small, fast on Workers, standard Request and Response. | Nothing on the horizon. |
| Rules | **`packages/core`**, pure TypeScript and zod | One place for what is allowed; testable without a platform. ADR 0002. | Never: this is the centre. |
| Data | **PlanetScale Postgres 18** through **Hyperdrive**, with **Drizzle** and `pg` | Plain Postgres, steady latency, a path to high availability. ADR 0005. | A dump and a new Hyperdrive config; the code stays. |
| Live agent sessions | **Durable Objects** (SQLite) | State next to the code that runs it; survives restarts. | — |
| Accounts | **Better Auth**, at least 1.6.22, magic link only | Runs on Workers, our database, our tables. Has had advisories: pin and watch. | Repeated advisories without fast fixes. |
| AI | **OpenRouter**, only through `core/ai/gate.ts` | One key and one bill; zero-data-retention providers only. | — |
| Hosting | **Cloudflare** (Workers, Hyperdrive, R2, DNS, SaaS custom hostnames) | One platform from the edge to the database connection. | — |
| Live updates | **Server-sent events** | One direction is all an agent stream needs; resumes with `Last-Event-ID`. | Real-time co-editing, which would need websockets and CRDTs. |

## 4. How the code is organised

```
platform/
  packages/core       the rules: pure, imports no platform
  packages/route-map      the route map's geometry
  packages/design-tokens  colours, type, spacing
  apps/web            pages (React Router)
  apps/api            programs (Hono): actions, MCP, webhooks, the database
  docs/               FOUNDATIONS.md, adr/, steps/, runbooks/
```

These boundaries are enforced by dependency-cruiser and Biome, not by trust:

- `core` imports no Cloudflare, Hono, React, Drizzle, `pg` or `node:` module.
- Only `apps/api/src/db/` imports Drizzle or `pg`.
- Only the one AI adapter calls OpenRouter.
- Browser code imports `core` only through its browser subpaths, which pull in no zod.
- `apps/web` and `apps/api` never import each other.

## 4b. Names

A name says what a thing is, in the product's own words. A contributor should be able to guess a file's path from the concept, and a concept from the path.

### The words we use

One word per concept, and the same word in the code, the database, the UI copy and the docs.

| Word | Means | Not |
|---|---|---|
| **space** | A creator's place: their routes, students and storefront | workspace, tenant, school |
| **creator** | The person who owns a space | teacher, author, admin |
| **member** | Anyone with a role in a space: owner, coeditor, assistant or student | user, when the role matters |
| **route** | A course: a graph of lessons | course, path, journey |
| **module** | A group of lessons inside a route | section, unit, chapter |
| **lesson** | One unit a student completes | page, class |
| **block** | One piece of a lesson: prose, a check, media, an interactive | section, widget, component |
| **draft** | The editable state of a route | |
| **version** | An immutable published snapshot of a route | release, revision (a revision is a draft counter) |
| **enrollment** | A student in one version of a route | subscription, purchase |
| **progress** | What a student has completed | |
| **card** / **review** | A spaced-repetition item and one answer to it | flashcard, attempt |
| **route map** | The visual map of a route a student travels | journey map |
| **action** | One registered change or query, named `noun.verb` | endpoint, command |
| **storefront** | A space's public pages | landing, shop |
| **studio** | Where creators build | dashboard, admin |
| **credits** / **spend** | What AI work costs, and the gate that limits it | tokens, when it means money |

### Conventions

- **Files and folders:** kebab-case, such as `route-map/`, `card-tilt.ts` or `block-types.ts`. Biome's filename rule enforces it. A file is named for what it holds, never for its type alone: `utils.ts`, `helpers.ts` and `misc.ts` are not allowed.
- **Code:** types and components are PascalCase. Functions and variables are camelCase, and a function starts with a verb. Booleans read as questions: `isPublished`, `hasAccess`. Constants are SCREAMING_SNAKE_CASE. No abbreviations, except `id`, `url` and `ms`.
- **Actions:** `noun.verb`, lower case, such as `route.publish` or `review.submit`. A test enforces the pattern.
- **Database:**
  - tables are snake_case plural nouns, such as `route_versions`;
  - columns are snake_case;
  - foreign keys are `<entity>_id`;
  - times are `<event>_at`;
  - booleans are `is_<state>`.

  A test reads the Drizzle schema and enforces these.
- **Packages:** `@learning-routes/<what-it-is>`. **Workers:** `learning-routes-<app>`. **Bindings and secrets:** SCREAMING_SNAKE_CASE, named for what they hold: `DB`, `BETTER_AUTH_SECRET`.
- **Branches:** `platform/step-<n>-<slug>`, for example `platform/step-2-data`. **PR and commit titles:** `Platform STEP <n> §<s>: <what changed>`.
- **Tests** are named for the behaviour they prove, such as "a second review with the same id changes nothing", never "works" or "test 1".

## 5. How the core stays correct

1. **Every change is an action.** An action has a name, a kind (query or mutation), a zod input and a `run`. `runAction` is the one gate for the browser, MCP and agents. It validates the input, checks permission and runs the action.
2. **Permission is a table in `core`:** `can(role, action, via)`. A new action without a row fails the build. `via` lets us keep some actions to people only, such as changing members or prices.
3. **The target decides the space, never the input.** `runAction` resolves the space from the resource's own row. A space id in the input must match it, or the answer is `not_found`.
4. **Pure first.** Rules are functions of their inputs. The clock, ids and storage come in through ports, so tests are deterministic.
5. **Tests that prove, not decorate:**
   - golden fixtures for every rule v1 had;
   - a contract suite that runs the same cases against the in-memory and the Postgres repositories;
   - the two-tenant test for isolation;
   - property tests where a rule has a law, such as an ordering key always sorting between its neighbours, or a review never scheduling into the past;
   - coverage floors that can only rise.
6. **Decisions are ADRs.** A change to a rule that v1 had is a written decision, with the fixture case that shows it.

## 6. How data is kept

### Shape

- **Ids are uuidv7.** Postgres 18 makes them natively, and `core` makes them through a port when it needs an id before the insert.
- **Every time is `timestamptz`.** Each learner has a time zone, so "today" means their day.
- **Content ids are stable.** A lesson or block keeps its id from draft to every published version. Progress is keyed by those ids, so a new version never erases a student's history.
- **Published versions are immutable**, enforced by the database, not by convention. Each carries a snapshot format number, and `core` knows how to read every format.
- **Concurrent edits do not overwrite each other.** A route's draft has a revision number, and every edit names the revision it read: a stale edit is refused with `conflict`. Order is a fractional key, so inserting between two items never renumbers the rest.
- **Retries are safe.** A mutation that can be retried, such as a review, carries an idempotency key that the database makes unique.
- **No foreign key crosses spaces.** A fork records where it came from, as plain columns, and copies the content. A space can always be exported on its own.
- **Nothing a student depends on is hard-deleted.** Routes and spaces are archived. Deleting a user is one explicit, tested erasure path.
- **Every action is logged:** who, person or agent, what, and the outcome. The log is append-only and is never used to derive state.

### Isolation: two fences

1. **In `core`:** the permission table and the space resolved from the row.
2. **In Postgres:** row-level security on every table that belongs to a space or a user.
   - The Worker's database role owns no table, bypasses nothing, and has grants table by table, never a blanket "write everything" role.
   - Every transaction first sets the acting user. With none set, policies match nothing.

The two-tenant test proves both fences, together and each on its own.

## 7. How it holds under load

- **No outside call inside a database transaction:** no AI, email or payments. Load, decide, commit, then call out. A transaction holds a pooled connection, and a small database has few.
- **A commit is awaited before the response is sent.** Only closing the connection happens after.
- **Reads that can be cached are cached at the edge:** storefront pages by `Cache-Tag`, purged on publish. Hyperdrive's query cache is never used for anything a write must invalidate, such as sessions or permissions.
- **Each agent session is its own Durable Object.** One busy creator never slows another.
- **Rate limits** on sign-in, on actions and on AI spend, keyed on the client address Cloudflare reports, never on a header the client can set.
- **Budgets fail the build:** JavaScript per page, Worker size, and per-model AI spend.
- **Load is measured before launch,** with a load test of the hot paths (a storefront read, a review submit, an action) against a staging database, in the STEP that prepares launch.

## 8. How data is protected in a public repository

### Never in the repository

- **No secrets, ever.** Local values live in `.dev.vars` or `.env`, which are git-ignored, with a committed `.example` file holding names only. Deployed secrets are set with `wrangler secret put` or GitHub encrypted secrets. Push protection and a secret scan in CI stop the mistake before it lands.
- **No personal data in fixtures, seeds, tests, logs, screenshots or issues.** Seeds take real values at run time.

### CI from forks

- Workflows that run on pull requests have read-only tokens and no secrets.
- `pull_request_target` is never used to run code from a pull request.
- Actions are pinned by commit SHA.
- The deploy workflow runs only from `main`, through a protected environment that needs the owner's approval.

### Who may change what

`CODEOWNERS` requires the owner's review on:
- `packages/core/`;
- the database schema and migrations;
- auth;
- `.github/`;
- the docs that hold these rules.

### Data we hold

- **We collect only what a feature needs.** Accounts are an email and a display name, and no age field until the owner decides.
- **Student content and AI prompts go only to zero-data-retention providers.**
- **Logs never contain emails, tokens or lesson answers.** They carry ids.
- **Tokens are stored hashed.** Session cookies are host-only, `Secure` and `HttpOnly`.
- **Every non-GET request to the API must come from the app's own origin.**
- **Erasure on request is one tested path.** Backups are the database's own, plus a nightly dump to R2 (planned).
- **Students live in the EU, Brazil and the Americas,** so GDPR and LGPD apply. Legal questions go to the owner and, through the owner, to a lawyer.

### Reporting a vulnerability

`SECURITY.md` says how to report a vulnerability privately, through GitHub's private vulnerability reporting. Nobody files one as a public issue.

## 9. Quality gates

Every one of these fails the build:

| Gate | Tool |
|---|---|
| Types | TypeScript strict, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` |
| Lint and format | Biome: performance rules, complexity limit, no `any`, no non-null assertion, no floating promises |
| Dead code | knip |
| Boundaries | dependency-cruiser |
| File and function size | `scripts/check-sizes.mjs` (300 lines per file) and Biome's function length rule |
| Tests and coverage | Vitest, with floors that only rise |
| Migrations | squawk, from the first migration (Platform STEP 2) |
| Bundle and Worker size | size-limit, `check-worker-size.mjs` |
| Dependencies | exact pins, newest release at least 14 days old, osv-scanner, Dependabot |
| Secrets | GitHub push protection and a secret scan in CI |
| Shortcuts | `check-shortcuts.mjs`: every `shortcut(Platform STEP n):` names the STEP that removes it |
| Authorship | the `no-tool-attribution` check |

## 10. How we work

- **Work comes as STEP files** in `platform/docs/steps/`. The platform series started again at 1 on 28 October 2026. STEPs 44–46 are its groundwork and keep their names. Pull request and commit titles start with `Platform STEP <n>`.
- **Tests first.** One commit per item, each with a test that fails before the change.
- **One pull request per section, stacked.** The description says what changed, how it was verified, and every question for the owner.
- **Clean code:** one responsibility per module, names that say what a thing is, no dead code, errors typed and handled where they can be, comments that say why. `docs/WORKING_AGREEMENT.md` lists each rule with the tool that holds it.
- **Contributors** start with `CONTRIBUTING.md`: set up, run the checks, open a pull request.

## 11. Open decisions (the owner's)

- **The license, and the terms for outside contributions.** Until it is decided, the repository has no license. Nobody outside may reuse the code, and contributions are accepted only under the terms the owner sets.
- **Age.** Brazil's ECA Digital forbids relying on a self-declared age, and Portuguese is a launch language.
- **The database region** (expected `aws:us-east-1`), and whether PlanetScale is billed through Cloudflare.
