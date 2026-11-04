# Platform STEP 1: Foundations, a public repository, and clean code enforced

Written by the reviewer, 28 October 2026. Start only after STEP 46 is merged. It is: `main` is at 5ef0d37f.

## 0. Context

**Owner, 28 October:**
- the repository is public, and other developers contribute;
- the app must hold heavy traffic, and the core is hard to get right;
- the bases must be written down well, and the code kept clean, ordered and easy to harden, with linters.

This STEP writes the bases and makes the tooling hold them. It builds no feature. The database, accounts and tenancy come next, in Platform STEP 2, which is already written.

**Numbering, owner decision:** the platform has its own STEP series, starting here at 1.
- STEPs 44–46 keep their names, because merged commits, PRs and ADRs cite them.
- The Rails app keeps the old series and continues from 47.
- Platform PR and commit titles start with `Platform STEP <n>`, for example `Platform STEP 1 §2: …`.
- Files are `platform/docs/steps/STEP_<nn>_…md`.

**What the reviewer found in the repository:**
- no `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` or `CODEOWNERS`;
- actions are pinned by tag, not by commit;
- `ci.yml` sets no `permissions`;
- `deploy.yml` (Rails, `workflow_dispatch`) holds the SSH key, the registry password and the Rails master key, but has no protected environment.

## Batch rules

- **Same rules as always:**
  - no tool or AI attribution anywhere: no Co-Authored-By trailers, no generated-with lines, no mentions in docs;
  - no secrets;
  - exact pins at the newest release at least 14 days old;
  - no skipped or weakened tests;
  - small commits, each with a red-first test where the item is code.
- **Each gate is proven.** Every new CI gate is proven once with a throwaway commit that breaks it, as in STEP 46. Link the red run in the PR, then close that draft unmerged.
- **The repository is public.** A secret, a personal detail or a security finding never goes in a PR description, an issue, a commit or a CI log. Those go to the owner in your final message only.
- **One PR per section, stacked.** Merge each yourself once it is green, in order. This STEP is foundations, and Platform STEP 2 builds on all of it. After §2.9 turns on required reviews, merge as an admin (`gh pr merge --admin`), and only once the PR is green.
- Write questions in the PR descriptions and keep going. Stop once, at the end.

## §1. The bases, written

1. Commit `~/Documents/Learning-routes/tmp/FOUNDATIONS.md` as `platform/docs/FOUNDATIONS.md`, unchanged except for fixing anything you can show is wrong. List each fix in the PR. Link it first in `platform/README.md`.
2. **ADR 0005: PlanetScale Postgres instead of Neon.** Owner decision, 28 October. It covers the following, and says what would make us move: a dump and a new Hyperdrive config; Drizzle and the code stay the same.
   - **Engine:** Postgres 18, not Vitess.
   - **Connection:** through Hyperdrive with `pg`, not PlanetScale's serverless driver.
   - **Roles:** no superuser. PlanetScale's default role has `BYPASSRLS` and runs the migrations. The Worker's role inherits no predefined data role (no `pg_write_all_data`) and gets grants table by table; Platform STEP 2 defines them.
   - **Caching:** Hyperdrive's cache never serves anything a write must invalidate.
   - **The database is regional:** use a placement hint.
   - **No scale to zero, no free branches:** CI uses a local Postgres.
3. In ADR 0001 and ADR 0004, change "Postgres on Neon" to "Postgres on PlanetScale (ADR 0005)". Leave `docs/architecture/2026-10-architecture-study.md` unchanged, because it is a dated record. ADR 0005 names the lines it supersedes. Add `@planetscale/*` to the drivers `core` may not import, in both Biome and ADR 0002.
4. **The name while it is built: "New Learning Routes".** This is an owner decision. The platform replaces v1 gradually; `FOUNDATIONS.md` §2 has the four stages. Until the switch, the visible name is **New Learning Routes**:
   - the `platform/README.md` title;
   - the `<title>` and the app's brand text, from one constant in `core/locales` (browser-safe), so the switch is a one-line change;
   - the planned host `new.learningroutes.com`, recorded as a constant and in the runbook, but not deployed in this STEP.

   Technical names keep their final form: `@learning-routes/*` packages and `learning-routes-*` Workers. Add a test that the brand constant is the only place the visible name is written.
5. `docs/WORKING_AGREEMENT.md`:
   - under "STEP files", the numbering above replaces the line pointing at the v1 repository;
   - a new "Clean code" section lists each rule from §3 and §4 with the tool that enforces it;
   - a new "Public repository" section holds the rules from §2.

## §2. A public repository with contributors

**Repository files:**

1. **`CONTRIBUTING.md`** at the root, covering both the Rails app and `platform/`:
   - setup;
   - the one command that runs every check;
   - the STEP and PR rules;
   - "tests first";
   - no secrets and no personal data, and what to do if one slips;
   - the authorship rule;
   - how reviews work: `CODEOWNERS` paths need the owner's review.

   Link `FOUNDATIONS.md`. The license section says only that the license is being decided, and that outside contributions are accepted only once the contribution terms are published. Do **not** add a `LICENSE` file. That is the owner's decision; ask it in the PR.
2. **`SECURITY.md`:**
   - report privately through GitHub's private vulnerability reporting, never in a public issue;
   - which versions are supported;
   - the response time the owner commits to (leave a placeholder and ask).
3. **`.github/CODEOWNERS`.** The owner's handle owns:
   - `packages/core/`;
   - `platform/apps/api/src/db/` and `platform/apps/api/drizzle/`, which do not exist yet; that is fine;
   - auth, at `platform/apps/api/src/auth/`;
   - `.github/`;
   - `config/credentials/` and `config/deploy*.yml` for Rails;
   - `platform/docs/FOUNDATIONS.md`, `platform/docs/adr/` and `docs/WORKING_AGREEMENT.md`.

**Workflows:**

4. **Every action is pinned by full commit SHA**, with the version in a comment, as `osv-scanner.yml` already does. Dependabot's `github-actions` entry keeps them updated.
5. **Every workflow declares `permissions:` at the top**, defaulting to `contents: read`. A job widens it only where it needs to, with a comment saying why.
6. **No workflow uses `pull_request_target`.** Add a check to CI that fails if one ever does.
7. **`deploy.yml` runs only from `main`, in a protected `production` environment:**
   - add `environment: production` to the job and `if: github.ref == 'refs/heads/main'`;
   - move the deploy secrets from repository secrets to that environment's secrets;
   - create the environment with `gh api`, with the owner as required reviewer and deployments limited to `main`.

   Moving the secrets needs their values, and you do not have them. **Do not** read or print any secret. Write the exact numbered steps for the owner in `platform/docs/runbooks/github.md`, and tell the owner in your final message.

**Repository settings, with `gh api`:**

8. Turn on, and record each command in `runbooks/github.md`:
   - secret scanning and push protection;
   - private vulnerability reporting;
   - Dependabot security updates, if still off;
   - for pull requests from forks, require approval before workflows run, for all outside contributors.
9. **Branch protection on `main`:**
   - require a pull request with one approving review and code-owner review;
   - dismiss stale approvals;
   - keep linear history and the required checks;
   - leave `enforce_admins` **off**, so the owner, whose account opens these PRs, can still merge his own work. Outside contributors cannot merge without his review.

   Write this trade-off in `runbooks/github.md`.

**A secret scan in CI:**

10. Run the gitleaks CLI directly on every PR and push to `main`, pinned by checksum. Use the CLI, not `gitleaks-action`, which needs a paid license for organizations; verify that.
11. **Scan the whole history once, locally,** with the same tool. Report findings **only in your final message to the owner**: never in a PR, an issue or a commit. Do not rewrite history. If a real secret is found, the fix is to rotate it, and the owner decides.
12. **A personal-data check on fixtures:**
    - `scripts/check-fixtures.mjs` fails on email addresses, phone numbers or long numeric ids in `**/test/**`, `**/fixtures/**`, seeds and `*.json` fixtures;
    - `example.com` and `example.org` addresses are allowed;
    - keep a small, commented allowlist for false positives.

## §3. Names that make sense

Owner, 28 October: good names from the start. `FOUNDATIONS.md` §4b holds the words and the conventions. This section makes the code match them before Platform STEP 2 adds to it. Every rename uses `git mv`, so history follows, and changes no behaviour. Build, tests and budgets stay green at every commit.

1. **`packages/journey` becomes `packages/route-map`** (`@learning-routes/route-map`). The product word is "route map", not "journey". The files drop the repeated prefix and move to kebab-case:
   - `journey_camera.ts` becomes `camera.ts`;
   - `journey_map_layout.ts` becomes `layout.ts`;
   - `journey_map_paths.ts` becomes `paths.ts`;
   - `journey_terrain.ts` becomes `terrain.ts`.

   `card_tilt.ts` and `landing_placement.ts` become `card-tilt.ts` and `landing-placement.ts`. If they are not route-map geometry, move them where they are used and say so in the PR. Update the comments that mention old paths, such as `journey_map_layout.js` and the Rails test names.
2. **`packages/ui-tokens` becomes `packages/design-tokens`** (`@learning-routes/design-tokens`).
3. **`packages/core/src`, one name per concept:**
   - `blocks.ts` and `learning/registry.ts` (the block vocabulary) become `blocks/schema.ts` and `blocks/types.ts`. Two files called "registry" for different things confuse. `registry` now means only the action registry.
   - `text.ts` becomes `localized-text.ts`.
   - `content/text.ts` becomes `content/ruby-text.ts`, since it holds Ruby's text semantics.
   - `v1.ts` and `coerce.ts` become `v1-import/import.ts` and `v1-import/loose-json.ts`.
   - `content/aftermath.ts` becomes `content/trailing-content.ts`. Keep the comment that defines the term, reworded to match the new name.
4. **The root package** `learning-routes-platform` becomes `@learning-routes/platform`.
5. **Enforce it:**
   - Biome's `useFilenamingConvention` set to kebab-case;
   - a test that every action name matches `^[a-z]+(\.[a-z]+)+$`;
   - a check that fails on a file named `utils`, `helpers`, `misc` or `common`.

   Platform STEP 2 adds the database naming test.
6. **The glossary is the source of truth.** If you find a word in code or copy that the glossary calls "Not", rename it in this section. If a case is unclear, ask in the PR.

## §4. Clean code, enforced

Platform STEP 2 is born under these rules.

1. **TypeScript, stricter,** in `tsconfig.base.json`:
   - `noUncheckedIndexedAccess`;
   - `noImplicitOverride`;
   - `noImplicitReturns`;
   - `noFallthroughCasesInSwitch`.

   In `packages/core` only, also turn on `exactOptionalPropertyTypes`. It fights zod-inferred, Drizzle and Better Auth types in the apps.

   Fix what each flag finds with real handling, not `!` and not casts. An `as` that remains carries a one-line comment saying why it is safe.
2. **Biome, as errors:**
   - `suspicious/noExplicitAny`;
   - `style/noNonNullAssertion`;
   - `style/useBlockStatements`;
   - the floating-promise rule and the exhaustive-switch rule, if the pinned Biome has them.

   In Biome 2 these may be type-aware nursery rules. Pin them and prove they fire. A promise nobody awaits loses writes in a Worker, so the floating-promise rule matters most. If the pinned Biome lacks it, say so and add nothing heavier.
3. **Small files, small functions:**
   - `scripts/check-sizes.mjs` fails on a source file over 300 lines in `packages/*/src` or `apps/*/src`;
   - for functions, use Biome's function-length rule at 60 lines if it exists, and only then add function counting to the script.

   Tests, generated files and migrations are exempt. Split what fails along real responsibilities.
4. **Coverage floors** (Vitest, v8):
   - `packages/core` at least 90% of lines and branches;
   - `apps/api` at least 80% once Platform STEP 2 lands, excluding `src/db/`, which the contract suite covers.

   Set each floor at the measured value rounded down, never below these numbers, so a floor can only rise.
5. **Shortcuts are tracked.** A `shortcut:` comment must name the STEP that removes it, as `shortcut(Platform STEP 2): …`. `scripts/check-shortcuts.mjs` fails on one without a STEP and prints them all in CI. Update the existing `shortcut:` in `review.submit` to name Platform STEP 2.
6. **One command runs every check:** `pnpm check` runs typecheck, lint, the size, shortcut and fixture checks, the tests with coverage, the builds and the budgets. CI calls the same command, so a contributor and CI can never disagree.

## Report, in one message

- **PRs:** the merged PRs and their green runs, and the red run that proves each new gate.
- **Settings:** what changed in the repository settings, and what is left for the owner in `runbooks/github.md`.
- **History scan:** the result of the full-history secret scan. Here only.
- **Departures and questions:** every departure from this STEP and its reason, and the questions for the owner. These include the license and contribution terms, and the response time in `SECURITY.md`.
