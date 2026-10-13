# PROMPT 32 — CI back to green, and main deployed

**Package:** CI-2 (small; one afternoon). **Base:** `main` at `f929de5b`. **Branch:** `ci-green`.
**Why:** CI run #223 for `f929de5b` is red (`scan_ruby`, `scan_js`, `test`, `system-test`; `lint`
green), so `deploy.yml` never ran and production does not carry `f929de5b` — nor, possibly,
`7396de2f`. Everything downstream (the WP-40 census, WP-37b's merge) waits on this. Fix the
causes, not the signals: no `continue-on-error`, no ignored audits, no skipped jobs.

## 0. Read the actual failures first
If `gh` is authenticated in this terminal: `gh run view 38001910663 --log-failed` (run #223), and
`gh run list --branch main --limit 8` to see which earlier runs were red — in particular #222
(`7396de2f`). If `gh` is not available, ask the owner to paste the red step of each failed job.
Record in the handoff which commit was the last with a green CI and a successful deploy, so we
know what production runs today (`bin/kamal app details` from the owner settles it).

## 1. `scan_js` — known cause: three stale CDN pins (`config/importmap.rb`)
`bin/importmap audit` on the owner's machine (12 October):

```
dompurify  <=3.4.15            low + moderate   (pinned 3.4.12)
katex      >=0.11.0 <0.18.2    low              (pinned 0.16.21)
mermaid    >=11.0.0 <11.16.1   low + 5 moderate (pinned 11.16.0)
```

Bump the three pins to the first non-vulnerable versions (or latest patch): `dompurify@3.4.16`
or later, `katex@0.18.2` or later, `mermaid@11.16.1` or later, same jsDelivr URLs. Then:
- `bin/importmap audit` prints no vulnerabilities (keep the `mc` notice; it is vendored on
  purpose and hashed by its own freshness test).
- Run every system test that renders KaTeX, Mermaid or sanitised HTML (`grep -rl "mermaid\|katex\|dompurify" test/system app/javascript`) and the Mermaid error-suppression case from
  WP-35 §7; a major-version change in any of the three is **not** this package — if the first
  clean version is a major, pin the latest patch of the current major and say so in the handoff.
- Check `config/initializers/content_security_policy.rb` still allows the exact hosts the new
  pins use.

## 2. `scan_ruby`, `test`, `system-test` — cause from the logs
`bin/brakeman --no-pager` and `bin/bundler-audit` are clean on the owner's machine, and the three
jobs died in 16–50 s, before any suite could run. Expect a setup-step failure (Ruby setup with
`bundler-cache: true`, the Postgres service, `db:test:prepare` against `db/structure.sql`,
Chrome for the system job, a secret the job expects) rather than a failing test. Fix the root
cause; if it is a flaky external (a registry outage), say so with the evidence and re-run.
If a failure *is* in a test, it ships with the test that catches its class, red first.

## 3. Prove it and ship it
- Push `ci-green`, open the PR, and wait for CI green on the PR (same workflow).
- Fast-forward `main` and push; watch **Deploy to Production** go green; the owner confirms
  with `bin/kamal app details` that the running image carries the new commit.
- Then the owner runs `source .env.deploy && bin/kamal app exec -r job 'bin/rails
  wp40:funnel_census'` (WP-40 waits on it).

## 4. Constraints
`env -u RAILS_MASTER_KEY bin/rails test` locally; never commit `config/master.key`,
`config/credentials/*.key`, `.claude/`, `.kamal/secrets` with literal values, or `node_modules`;
no `git add -A`. Touch nothing outside the workflow files, `config/importmap.rb` and what the logs
prove broken. Handoff: `CI2_HANDOFF.md` — root cause per job, what changed, the last green
commit before this, and the commit production runs now.
