# Working agreement

How work is done in this repository.

## STEP files

The reviewer writes each piece of work as a STEP file (in `docs/steps/` of the v1 repository until this one has its own). A STEP says why the work exists, what to build, the rules of the batch, and when it is done. Work follows the STEP. When a STEP is wrong or needs a decision, the question goes in the pull request description and the work continues with the rest.

## One pull request per batch

A STEP is one batch and one pull request, with one commit per item, in the STEP's order. The description lists what changed, how it was verified, anything that surprised us, and every question for the owner. The reviewer reviews once, at the end.

## Tests first

Every behaviour change starts with a test that fails for the right reason, then the code that makes it pass. A change without behaviour (a doc, a config value) needs no test. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass before a pull request is opened, and CI runs the same steps.

## Golden fixtures before ports

A rule that v1 already has (grading, review scheduling, cost, spend limits, parsing) is captured from the Ruby code first, with `rake characterize:all` in the v1 repository, and copied to `packages/core/test/golden/`. A port is done when it reproduces the fixture. A difference from v1 is allowed only as a decision written in the pull request, with the fixture case that shows it.

## Boundaries

`packages/core` imports no platform (ADR 0002); lint enforces it. Apps depend on `core`, never the other way around.

## Dependencies

Every dependency is pinned to an exact version (`.npmrc` has `save-exact=true`). Adding one is a decision: say in the pull request why the platform or an existing package does not already do the job.

## Authorship

Commits, pull requests, code comments and docs never say they were made with an AI tool: no co-author trailers, no "generated with" lines. Files that instruct automated agents are named for the work they describe (like this one), not for a tool.

## Secrets

No secret is ever committed. Local values live in `.dev.vars` (Workers) or `.env`, both ignored by git; commit a `.dev.vars.example` with the names and no values when a new one is needed. Deployed secrets are set with `wrangler secret put`.
