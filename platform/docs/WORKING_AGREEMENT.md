# Working agreement

How work is done in this repository.

## STEP files

The reviewer writes each piece of work as a STEP file in `platform/docs/steps/`, named `STEP_<nn>_<title>.md`. The platform numbers its STEPs from 1, starting with Platform STEP 1 on 28 October 2026. STEPs 44 to 46 are its groundwork and keep their names, because merged commits, pull requests and ADRs cite them; the Rails app keeps the old series and continues from 47. A STEP says why the work exists, what to build, the rules of the batch, and when it is done. Work follows the STEP. When a STEP is wrong or needs a decision, the question goes in the pull request description and the work continues with the rest.

## One pull request per section

A STEP is one batch: one pull request per section, stacked, with one commit per item, in the STEP's order. Pull request and commit titles start with `Platform STEP <n>`, as in `Platform STEP 1 §2: …`. The description lists what changed, how it was verified, anything that surprised us, and every question for the owner.

## Tests first

Every behaviour change starts with a test that fails for the right reason, then the code that makes it pass. A change without behaviour (a doc, a config value) needs no test. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass before a pull request is opened, and CI runs the same steps.

## Golden fixtures before ports

A rule that v1 already has (grading, review scheduling, cost, spend limits, parsing) is captured from the Ruby code first, with `rake characterize:all` in the v1 repository, and copied to `packages/core/test/golden/`. A port is done when it reproduces the fixture. A difference from v1 is allowed only as a decision written in the pull request, with the fixture case that shows it.

## Boundaries

`packages/core` imports no platform (ADR 0002); lint enforces it. Apps depend on `core`, never the other way around.

## Dependencies

Every dependency is pinned to an exact version (`.npmrc` has `save-exact=true`). Adding one is a decision: say in the pull request why the platform or an existing package does not already do the job.

## AI calls

AI tokens are most of what the platform spends, at every size. Every model call goes through `packages/core/src/ai/gate.ts`, with a model from `ai/models.ts`, a `max_tokens` and a prompt-cache setting, and through the spend gate in `credits/`. Only the one adapter in `apps/api` sends it. A student-facing feature uses the cheapest model in the table that passes the feature's own test cases; a more expensive model needs a failing case that shows why.

## Clean code

Each rule has a tool that fails the build when it breaks. `pnpm check` runs them all, and CI runs the same command.

| Rule | Held by |
|---|---|
| Strict types: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `exactOptionalPropertyTypes` in `core` | TypeScript (`pnpm typecheck`) |
| No `any`, no non-null assertion `!`, braces on every block, no floating promise, exhaustive switches | Biome (`pnpm lint`) |
| A function is at most 60 lines; complexity at most 15 | Biome |
| A source file in `packages/*/src` or `apps/*/src` is at most 300 lines | `scripts/check-sizes.mjs` |
| Coverage never falls: `core` at least 90% of lines and branches | Vitest with v8 coverage |
| No unused files, exports or dependencies | knip |
| The boundaries in FOUNDATIONS.md §4 | dependency-cruiser |
| A shortcut names the STEP that removes it: `shortcut(Platform STEP <n>): …` | `scripts/check-shortcuts.mjs` |
| No personal data in fixtures | `scripts/check-fixtures.mjs` |

An `as` cast that remains carries a one-line comment saying why it is safe.

## Public repository

Anyone can read every line, commit and CI log, forever.

- No secret, personal detail or security finding goes in a commit, pull request, issue or log. A security finding goes to the owner privately; a vulnerability is reported through GitHub's private vulnerability reporting (`SECURITY.md`).
- Every action in a workflow is pinned by full commit SHA, with the version in a comment.
- Every workflow declares `permissions:`, `contents: read` by default; a job widens it only with a comment saying why.
- No workflow uses `pull_request_target`; CI fails if one does.
- Deploys run only from `main`, in the protected `production` environment.
- `CODEOWNERS` paths need the owner's review.
- gitleaks scans every pull request and every push to `main`.

## Authorship

Commits, pull requests, code comments and docs never say they were made with an AI tool: no co-author trailers, no "generated with" lines. Files that instruct automated agents are named for the work they describe (like this one), not for a tool.

## Secrets

No secret is ever committed. Local values live in `.dev.vars` (Workers) or `.env`, both ignored by git; commit a `.dev.vars.example` with the names and no values when a new one is needed. Deployed secrets are set with `wrangler secret put`.
