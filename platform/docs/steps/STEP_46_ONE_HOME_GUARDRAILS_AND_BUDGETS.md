# STEP 46: One home, guardrails and budgets

Written by the reviewer, 28 October 2026. Start it only after STEP 45 is merged.

## 0. Context

The architecture is settled. The full study is the reviewer's architecture document: twelve frontends were built against one contract and tested with the same browser suite, and every layer was reopened with current sources. The decisions this STEP acts on:

- **Pages:** React Router 8. **API, MCP and webhooks:** Hono. **Rules:** `core`. **AI:** OpenRouter.
- **The storefront is server HTML without hydration.** The prototype measured 0.3 KB of JavaScript against 111 KB hydrated. The student app and the studio keep full React.
- **One action registry in `core`** generates the internal endpoint, public REST and MCP. Every browser write goes through one API client, to a registered action.
- **The new platform lives in the `Learning-routes` repository** (owner decision, 26 October).

The prototype is at `~/Documents/lr-spike-reference/lr-spike/`, outside any repo. Read these before writing code:
- `CONTRACT.md`;
- `packages/core/src/index.ts` (the registry);
- `apps/api/src/index.ts` (Hono, MCP, agent event log);
- `apps/gateway/src/index.ts` (routing by host);
- `frontends/react-router-lean/` (the storefront without hydration);
- `e2e/architecture.spec.ts` (the 16 tests).

Treat it as a reference, not code to copy blindly. It is a spike: its MCP speaks an old protocol version, storage is a Durable Object standing in for Postgres, and auth is a fake session.

## Batch rules

- Same rules as always: no tool or AI attribution anywhere, no secrets, exact pins, no skipped or weakened tests, small commits, each with a test that fails first.
- **Version rule, now enforced by tooling:** every dependency is the newest release that is at least 14 days old (§2.6).
- One PR per section is fine; say in each PR which section it closes. Stop once, at the end, with every PR green. Merge §1 yourself once it is green, because everything after it depends on the move. Leave the rest open for the reviewer.

## §1. Move the platform into Learning-routes, keeping its history

1. In `Learning-routes`, branch `step-46-move` from `main`, then `git subtree add --prefix=platform <path to the platform repo> main`. History must survive; check with `git log --follow platform/packages/core/src/index.ts`.
2. CI: a new workflow `platform.yml` runs the platform's install, typecheck, lint, test and build, only when `platform/**` changes (path filters). The Rails workflows ignore `platform/**`. Branch protection on `main` must require the new job; update it with `gh api`.
3. Make sure the Rails app, its Docker build and Kamal deploy ignore `platform/`: `.dockerignore`, and any glob that would pick it up.
4. `platform/README.md` says how to work on it from the repo root.
5. Once the PR is merged and `main` is green, archive the old repository with `gh repo archive Learning-Routes/platform --yes`. Archiving is reversible. Put a one-line pointer to the new location in its README first.

## §2. Guardrails: lint, boundaries, budgets, cost

Each item is a CI step that fails the build. Pin each tool to the newest release that is at least 14 days old. Expected as of today, but verify with `npm view <pkg> time`: knip 6.41.0, dependency-cruiser 18.6.0, size-limit 14.2.0 with @size-limit/file 14.2.0.

1. **Biome, stricter.**
   - Turn on the `performance` group as errors: `noAccumulatingSpread`, `noBarrelFile`, `noReExportAll`, `noDelete`, `useTopLevelRegex`.
   - Turn on `complexity/noExcessiveCognitiveComplexity` with a maximum of 15, `suspicious/noConsole` in `packages/core`, and `correctness/noUnusedImports`.
   - Fix what it finds. Do not add ignores, except a short commented one where a rule is genuinely wrong for a line.
2. **knip.** No unused files, exports, dependencies or devDependencies, across the workspace. Unused code and packages are bundle bytes and upgrade work.
3. **dependency-cruiser.** These rules are architecture, and the build must fail when one breaks:
   - `packages/core` imports nothing from Cloudflare, Hono, React, Drizzle or any `node:` module. Biome already checks part of this; this rule is the second guard.
   - **Browser code imports `core` only through browser-safe subpaths.** Add `exports` for `@learning-routes/core/browser` and `@learning-routes/core/locales`; they never pull zod or any server code. This is the 2 KB to 93 KB jump the prototype found.
   - Storefront route modules import no client-only libraries.
   - `apps/web` never imports from `apps/api`, and the reverse.
   - No circular dependencies.
4. **size-limit, measured on the built client.**
   - The storefront route's JavaScript: **at most 1 KB gzip.** With no hydration it is only the tiny listener file.
   - The app entry plus a studio route: at most 150 KB gzip. Report the real number and set the budget at about +10% of it.
5. **Worker size budget.** `scripts/check-worker-size.mjs` runs `wrangler deploy --dry-run --outdir` for each Worker and fails above:
   - 250 KiB gzip for `apps/web`;
   - 150 KiB gzip for `apps/api`.

   Print the numbers. Bigger Workers start slower and cost more to ship.
6. **Supply chain and the 14-day rule.**
   - `pnpm-workspace.yaml`: `minimumReleaseAge: 20160` (minutes, so 14 days). Verify the unit and the minimum pnpm version in pnpm's docs; record them in a comment.
   - `.github/dependabot.yml` with `cooldown: { default-days: 14 }` for npm and GitHub Actions. Group minor and patch updates weekly. Security updates are not delayed.
   - A check that fails on any `^` or `~` range in any `package.json`.
   - `osv-scanner` (Google's official GitHub Action), on every PR and weekly.
   - Record in the PR every pin STEP 44 or 45 took that was under 14 days old at the time, and correct each one in this section. One known case: `@biomejs/biome` 2.6.3 was two days old when it was pinned.
7. **AI cost guard.** AI tokens are more than 90% of the platform's spend at every size, so this matters most.
   - `packages/core/src/ai/models.ts` is a table of the OpenRouter model ids we allow, each with input, output and cache prices per million tokens, as of a stated date with a source URL. It is the single source of truth.
   - `packages/core/src/ai/gate.ts` is the only place a model call is described. It requires a model from the table, `max_tokens`, a prompt-cache setting, and the spend estimate from `credits/`. It returns an explicit refusal on an unknown model or an unknown cost.
   - A dependency-cruiser rule forbids any module except the gate's single platform adapter from calling the OpenRouter endpoint or importing an AI SDK. The adapter can live in `apps/api` for now, with a stub test.
   - A test fails if a prompt template names a model missing from the table, or if a template's estimated input tokens exceed its declared budget. A simple 4-characters-per-token estimate is enough.
   - Default student-facing features to the cheapest model that passes the feature's own test cases. Write that rule in `docs/WORKING_AGREEMENT.md`.
8. **Benchmarks, not gating yet.** Add `pnpm bench` (Vitest bench) for the hot pure functions: grade, the FSRS review, the lesson parser and decideSpend. Commit a baseline file. CI prints the comparison but does not fail. A regression over 30% is called out in the PR description.

## §3. Fixes the prototype found

1. **The inline theme script in `apps/web/app/root.tsx` breaks the strict CSP.** Move it to an external file, or give it the per-response nonce. Then add the strict CSP header from the prototype's `entry.server.tsx`, with a fresh nonce on every HTML response, and a test that a page with an inline script lacking the nonce is refused.
2. **The storefront is not hydrated.** Copy the pattern from `frontends/react-router-lean/app/root.tsx`: on storefront requests, render no `<Scripts/>`, only the external listener. Add a test that the storefront HTML contains no module script.
3. **hreflang has no fallback URLs.** A locale whose text is missing has no URL and no alternate link; it returns 404, or noindex if a page must exist. Links are reciprocal, include the page itself, use full URLs, and add `x-default`. Test it.
4. **`crypto.randomUUID` exists only on https pages.** Use the `getRandomValues` helper wherever browser code makes ids.

## §4. The action registry

Port the registry pattern from the prototype into `packages/core`, keeping the shapes STEP 45 settled.

- Each action is a `name`, a `kind` (query or mutation), a `description`, a zod `input`, and a `run(ctx, input)`. The context gives the actor (`ui`, `mcp` or `agent`), the store, the time and an id maker.
- `runAction` is the one gate: it validates, runs and reports.
- `mcpTools()` returns the tool descriptors from the same registry, with `readOnlyHint` from the kind.
- Start with the actions STEP 45's logic already supports: `review.submit`, which is idempotent by `reviewId`, as in the prototype. Add the route and module actions once STEP 47 brings the database. For now they run against an in-memory store used only by the tests.
- Tests:
  - the registry, the MCP tool list and the typed client name exactly the same actions;
  - one action called through `runAction` with two different actor kinds gives the same result;
  - invalid input is refused the same way for every actor.
- MCP targets the **2026-07-28** spec: stateless, no `initialize`, explicit handles for long jobs. Write that in ADR 0004. The endpoint itself comes in a later STEP.

## §5. ADR 0004

Write `docs/adr/0004-architecture-after-the-bake-off.md`. Keep it to about a page. It covers:
- what each part is for: React Router for people, Hono for programs, `core` for the rules;
- the storefront without hydration;
- the registry;
- the data placement: shared Postgres on Neon, Durable Object SQLite for live agent sessions, analytics outside the database;
- server-sent events for agent output;
- the guardrails in §2;
- a link to the architecture document.

## Done when

- [ ] The platform lives in `Learning-routes/platform` with its history. CI runs it on path changes, branch protection requires it, and the old repository is archived.
- [ ] Every guardrail in §2 runs in CI and fails on purpose when broken. Prove each one once in the PR description: break it, show the red run, revert.
- [ ] The storefront ships at most 1 KB of JavaScript, and the strict CSP is on every HTML response with no violations.
- [ ] The registry exists, with the parity tests.
- [ ] ADR 0004 is written.
- [ ] The PR descriptions list the measured numbers: storefront JS, app JS, both Worker sizes, benchmark baselines and the pins that were corrected.

Stop once, at the end. Do not start STEP 47 (database, accounts, spaces and roles); it will come as its own file.
