# Codex CLI Prompt — WP-7 True AI Costs

Work only in `/Users/go/Documents/Learning-routes` on the current branch. Read these files completely before editing:

1. `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`
2. `docs/superpowers/plans/2026-08-31-wp7-true-ai-costs.md`
3. `FINDINGS_WP7.md` and `WP7_HANDOFF.md` from branch `wp7-true-costs` using `git show`; do not check out that branch.

Use the `superpowers:executing-plans` skill and execute the WP-7 plan task by task with review checkpoints.

Before editing:

- Require a clean worktree except for this prompt and the WP-7 plan if they are not yet committed.
- Verify that commits `d33768d` and `1a6c4b7` are ancestors of `HEAD`.
- Inspect historical commits `825ac45`, `2c60024`, and `bd38b50`, but do not cherry-pick them. Port only behavior supported by the approved plan and current code.
- Establish fresh focused and full-suite baselines and record failures by exact test name.
- Verify every active provider price against official provider documentation. If a rate differs from the plan, is unavailable, or cannot be calculated from usage the application can persist, stop and report the mismatch before changing pricing code.

Scope:

- Implement exact sub-cent AI cost accounting, billable semantics, exact spend limits, provider-reported image usage, all ElevenLabs TTS paths, ElevenLabs STT metering, and safe dry-run reconciliation tooling.
- Do not build or modify the owner dashboard, owner role, routes/modules, quotes, Lemon Squeezy, PayPal, locks, or landing-page journey.
- Do not perform paid live provider calls, apply a backfill, access production, deploy, merge, push, rebase, or change branches.

Execution requirements:

- Follow strict TDD: demonstrate each new test failing for the intended reason before implementing, then make it pass.
- Commit each meaningful, independently verifiable implementation block before starting the next one. Each commit must be narrowly scoped and include its corresponding tests.
- Before every commit, run the focused tests and review `git diff` plus `git diff --check`.
- Do not combine unrelated changes. Do not amend, squash, or rewrite existing commits.
- Never persist monetary truth with binary floats. Never treat cached, failed, pending, timed-out, unknown, or unrecoverable usage as billable zero-cost usage.
- Never expose secrets, provider payloads, prompts, or personal user data in logs, tests, reports, commits, or handoff documents.
- If review discovers a defect directly affecting truthful metering or spend-limit safety, fix it as a separate tested commit. Record unrelated findings without changing them.

At completion, leave the branch clean and provide a structured handoff containing:

- every commit hash and purpose;
- files and migrations changed;
- exact pricing sources and verification date;
- every paid call path and how its usage is measured;
- focused, main-suite, combined-suite, lint, and security command results with exact counts/seeds;
- unknown or unrecoverable historical costs;
- adapter/provider limitations and manual checks still required;
- explicit confirmation that no dashboard, commerce, production data, provider purchase, push, merge, or deployment occurred.

