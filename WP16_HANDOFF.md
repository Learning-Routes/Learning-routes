# WP-16 Handoff: Single Owner and Private Owner Dashboard

## Outcome

WP-16 introduces one owner identity, a credentials-first promotion path, hard-private `/admin`
authorization, append-only audit records, and a bilingual responsive owner dashboard. It uses
only current user, session, learning-route, route-step, and WP-7 ledger data. No commerce facts are
invented.

Branch: `wp16-owner-dashboard`

## Commits

- `373ae31` — approved WP-16 implementation plan.
- `be69959` — owner role and PostgreSQL single-owner invariant.
- `cf22597` — authenticated promotion, session invalidation, and promotion audit.
- `8addc4d` — private owner-only authorization for every admin route.
- `4493c16` — initial bounded user and route metrics.
- `868381b` — completed summary, filtering, pagination, and drill-down presenters.
- `eb064e3` — bilingual light/dark dashboard and user drill-down UI.
- `7ae27af` — real PostgreSQL simultaneous-promotion coverage.
- `259ac58` — browser, cache isolation, and cross-user coverage.
- `705fc4a` — restored owner comment-moderation authority found in review.
- `f4edf98` — removed hardcoded alert recipient and routed alerts to the sole owner.
- `83ee96d` — bounded route drill-down pagination.
- `36a9baf` — exact route-cost attribution and explicit unpriced usage.
- `a539e45` — basic account state in the user drill-down.
- `7d43266` — exact fixed-query-count evidence.

The final documentation commit is the commit containing this handoff.

## Database invariants and migrations

`20260901000001_enforce_single_owner.rb` adds partial unique index
`idx_core_users_single_owner` on `core_users.role WHERE role = 2`. PostgreSQL therefore rejects a
second owner even if application validation is bypassed. `Core::User` also validates owner
uniqueness for normal application errors.

`20260901000002_create_owner_audit_events.rb` adds `owner_audit_events` with UUID actor/subject
references, action, request ID, SHA-256 IP/user-agent digests, JSON metadata, and timestamps.
Model callbacks reject update/destroy, and sensitive metadata key names are rejected.

Promotion additionally takes PostgreSQL transaction advisory lock `691016`, rechecks the current
owner inside the transaction, promotes exactly one authenticated existing account, deletes all of
that account's sessions, and records `owner.promoted`. The unique index remains the final database
boundary.

## Owner promotion procedure

Create and verify a normal account through the existing credential flow first. On the intended
environment, read credentials without placing the password in shell history:

```bash
read -r -p "Existing account email: " OWNER_EMAIL
read -r -s -p "Existing account password: " OWNER_PASSWORD
echo
export OWNER_EMAIL OWNER_PASSWORD
bin/rails owner:promote
unset OWNER_EMAIL OWNER_PASSWORD
```

The task authenticates the existing password; it does not create an account. Repeating it for the
same owner is idempotent. A different account is rejected once an owner exists. No owner email,
password, secret, or default login-capable owner is seeded or committed.

## Dashboard fields and authoritative sources

Summary:

- registered users — `COUNT(core_users)`;
- routes created — `COUNT(learning_routes_engine_learning_routes)`;
- exact priced AI cost — sum of completed, uncached, WP-7 `cost_microcents` rows;
- pricing-incomplete count — completed, uncached WP-7 rows whose pricing status is unpriced.

User index:

- name, email, registration — `core_users`;
- last activity — maximum `core_sessions.last_active_at`;
- route count — routes reached through the user's learning profile;
- educational progress — completed and total route-step counts;
- purchase readiness — real route generation completion and positive step count, explicitly
  described as readiness for future commerce rather than a purchase;
- exact priced AI cost and unpriced count — the user's WP-7 ledger rows.

User drill-down:

- role, email verification, onboarding, registration, and identity — `core_users`;
- last activity — `core_sessions`;
- route topic, lifecycle state, generation state, and link — learning-route records;
- completed/total progress — route-step records;
- exact route AI cost — completed uncached priced ledger rows attributed by route metadata or the
  route's primary `ai_interaction_id`, counted once;
- pricing-incomplete count — attributed completed uncached unpriced ledger rows;
- readiness — actual generation completion and positive educational content.

Buyer state, payment state, purchases, prices, quotes, refunds, revenue, fees, and profit are
absent because no authoritative commerce tables exist yet.

## Authorization, isolation, audit, and browser evidence

- Anonymous, student, and teacher requests receive direct 403 responses for dashboard, index,
  and detail paths; no sign-in redirect is used.
- Owner requests succeed and create `owner.admin_access` audit events containing controller/action,
  request ID, and digests—not credentials, prompts, responses, or raw network identifiers.
- All admin responses, including 403 and 404, set `Cache-Control: private, no-store`,
  `Pragma: no-cache`, and `X-Robots-Tag: noindex, nofollow`.
- Alternating owner/student sessions prove cache isolation; user detail proves cross-user identity
  and sensitive-column isolation.
- Real headless Chrome covers dashboard navigation, search, user pagination, user detail, real
  route links, hard non-owner denial, persisted light/dark themes, and a 390×844 mobile viewport
  without horizontal overflow.
- Two synchronized PostgreSQL threads prove one promotion succeeds, one receives
  `OwnerExistsError`, one owner persists, and one promotion audit event exists.

## Query bounds

- User index: exactly 2 SQL queries with both small data and 30 additional users.
- User drill-down: exactly 5 SQL queries with both zero and 30 routes.
- User pages and route pages default to 25 rows and enforce a maximum of 100.
- Summary is one aggregate SQL statement. No query count grows linearly with users or routes.

## Verification

Focused final surface:

```bash
env -u RAILS_MASTER_KEY bin/rails test test/models/core/single_owner_database_test.rb engines/core/test/models/core/user_test.rb test/services/owner/promotion_test.rb test/services/owner/promotion_concurrency_test.rb test/tasks/owner_test.rb test/controllers/admin test/queries/admin test/system/owner_dashboard_test.rb test/controllers/community_engine/comment_moderation_test.rb engines/ai_orchestrator/test/mailers/ai_orchestrator/admin_mailer_test.rb engines/ai_orchestrator/test/jobs/ai_orchestrator/ai_request_job_test.rb --seed 16712
```

Result: 61 runs, 347 assertions, 0 failures, 0 errors, 0 skips.

Main suite:

```bash
env -u RAILS_MASTER_KEY bin/rails test --seed 16801
env -u RAILS_MASTER_KEY bin/rails test --seed 16802
env -u RAILS_MASTER_KEY bin/rails test --seed 16803
```

Each: 322 runs, 1,253 assertions, 0 failures, 0 errors, 0 skips.

Combined suite:

```bash
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 16811
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 16812
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 16813
```

Each: 643 runs, 2,181 assertions, 3 failures, 9 errors, 0 skips. All twelve exact names equal the
documented WP-7 baseline; see `FINDINGS_WP16.md`.

Additional verification:

- `env -u RAILS_MASTER_KEY RAILS_ENV=test bin/rails zeitwerk:check` — all good.
- `RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop --format simple` — 466 files, no offenses.
- `bundle exec bundler-audit check` — no vulnerabilities.
- `bundle exec brakeman --no-pager` — one unrelated pre-existing medium warning documented in
  `FINDINGS_WP16.md`; no WP-16 warning.
- `bin/importmap audit` — the six explicitly deferred DOMPurify/Mermaid advisories only.

## Scope confirmation

No RouteModule work, pricing UI, payment integration, purchases, webhooks, refunds, module locks,
paid generation, landing redesign, dependency-pin update, production access, deployment, merge,
push, or WP-17 work occurred. The branch is intentionally preserved for later integration.
