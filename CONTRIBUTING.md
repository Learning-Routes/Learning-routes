# Contributing to Learning Routes

This repository holds two applications:

- **the Rails app** at the root: v1, which serves learningroutes.com today;
- **the platform** in `platform/`: the new platform that will replace it.

Read [`platform/docs/FOUNDATIONS.md`](platform/docs/FOUNDATIONS.md) first. It says what the platform is, what it is built on and the rules it is built by.

## License and contributions

The repository, the Rails app and `platform/` alike, is licensed under FSL-1.1-ALv2: see [`LICENSE.md`](LICENSE.md).

**Every contributor signs the Contributor License Agreement in [`CLA.md`](CLA.md) once.** On your first pull request, the CLA assistant bot comments with a link: sign there with your GitHub account, and the check passes for that pull request and every later one. A pull request can't be merged until its author has signed.

The agreement also covers contributions made before signing, so people who contributed before it existed are asked to sign it too.

## Set up

**Platform** (Node 22 from `platform/.nvmrc`, pnpm from `platform/package.json`, through `corepack enable`):

```sh
cd platform
pnpm install
pnpm dev        # web on http://localhost:5173, api on http://localhost:8787
```

**Rails app** (Ruby from `.ruby-version`, Postgres running locally):

```sh
bundle install
bin/rails db:create db:migrate db:seed
bin/dev
```

## Run every check

**Platform:** one command runs everything CI runs, so you and CI never disagree:

```sh
cd platform && pnpm check
```

It runs, in order:
- the typecheck, lint, and the size, shortcut and fixture checks;
- the tests, with coverage floors;
- the builds and the budgets.

**Rails app:** `bin/ci` runs the style, security and test steps, and `bin/rails test engines/*/test` runs the engines' tests, which CI runs as a separate step.

## How work is done

- **Work comes as STEP files.** The platform's are in `platform/docs/steps/` and are numbered from 1; titles start with `Platform STEP <n>`. See [`platform/docs/WORKING_AGREEMENT.md`](platform/docs/WORKING_AGREEMENT.md).
- **One pull request per section of a STEP,** stacked, with one commit per item. The description says what changed, how it was verified, and every open question.
- **Tests first.** Every behaviour change starts with a test that fails for the right reason, then the code that makes it pass.
- **Every check passes** before a pull request is opened.

## Secrets and personal data

The repository is public: every line, commit and CI log can be read by anyone, forever.

- **Never commit a secret.** Local values go in `.dev.vars` or `.env`, which git ignores; commit a `.example` file with the names only. GitHub push protection and gitleaks in CI stop most mistakes.
- **Never commit personal data:** no real emails, names, phone numbers or ids in tests, fixtures, seeds, screenshots or issues. Use `example.com` addresses. `platform/scripts/check-fixtures.mjs` checks the platform's fixtures.
- **If one slips anyway,** do not try to hide it with another commit: the old commit stays readable. Tell the owner privately at once, through the private report described in [`SECURITY.md`](SECURITY.md). A leaked secret is revoked and rotated; that is the fix, not rewriting history.
- **A security problem** is reported privately, as [`SECURITY.md`](SECURITY.md) explains, never in a public issue.

## Authorship

Commits, pull requests, code comments and docs never say they were made with an AI tool: no co-author trailers, no "generated with" lines. The `no-tool-attribution` check enforces it.

## Reviews

`.github/CODEOWNERS` lists the paths that need the owner's review: the platform's core rules, the database schema and migrations, authentication, the CI configuration, deploy configuration and credentials, and the documents that hold these rules. Every pull request needs one approving review, and a review is dismissed when new commits are pushed.
