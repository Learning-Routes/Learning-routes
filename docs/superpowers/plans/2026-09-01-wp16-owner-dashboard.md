# WP-16 Single-Owner Foundation and Private Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish exactly one privately promoted owner and provide that owner a bounded, bilingual dashboard with user, route, progress, activity, and exact WP-7 cost reporting.

**Architecture:** Keep the cross-engine admin namespace in the host application. Represent owner with role value `2`, enforce at most one such row using a PostgreSQL partial unique index, and serialize credential-authenticated promotion with a transaction-scoped advisory lock. Query objects return immutable presenter rows from bounded SQL; a commerce adapter is absent until WP-17/WP-18 create real records, so this release never renders fabricated payment data.

**Tech Stack:** Rails 8.1, PostgreSQL, Minitest, Capybara/Selenium, ERB, I18n, Tailwind/theme CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`

## Global Constraints

- Preserve the approved WP-15B and WP-7 commits and exact microcent billable semantics.
- Introduce no `RouteModule`, quote, purchase, payment, refund, revenue, fee, profit, locking, pricing, provider, or landing-page work.
- Never commit an owner identity, password, secret, default login-capable owner, or public owner-granting UI.
- Every `/admin` response, including denial, is a hard 403 for anonymous/non-owner callers, private/no-store, and noindex/nofollow.
- All lists use deterministic ordering, bounded pagination, parameterized search/filters, and query counts independent of row volume.
- English and Spanish copy and existing light/dark theme variables are required.
- Every implementation task follows red-green-refactor, focused tests, `git diff`, `git diff --check`, and a narrow commit.
- Do not amend, squash, rebase, merge, push, deploy, or access production.

---

### Task 1: PostgreSQL-enforced owner identity

**Files:**
- Create: `db/migrate/20260901000001_enforce_single_owner.rb`
- Modify: `engines/core/app/models/core/user.rb`
- Modify: `engines/core/test/models/core/user_test.rb`
- Create: `test/models/core/single_owner_database_test.rb`
- Modify: `db/schema.rb`

**Interfaces:**
- Produces: `Core::User.roles == { "student" => 0, "teacher" => 1, "owner" => 2 }`, `owner?`, and PostgreSQL partial unique index `idx_core_users_single_owner` where `role = 2`.

- [ ] Write tests asserting enum compatibility, application rejection of a second owner, and direct SQL/validation-bypassing insertion rejection with `ActiveRecord::RecordNotUnique`.
- [ ] Run `env -u RAILS_MASTER_KEY bin/rails test engines/core/test/models/core/user_test.rb test/models/core/single_owner_database_test.rb --seed 16101`; verify failure because `owner` and the index do not exist.
- [ ] Add migration code:

  ```ruby
  add_index :core_users, :role, unique: true,
    where: "role = 2", name: "idx_core_users_single_owner"
  ```

  Rename enum key `admin` to `owner`, add `validates :role, uniqueness: true, if: :owner?`, and change authorization helpers to `owner?` while preserving teacher permissions.
- [ ] Migrate test/development schema and rerun seed `16101` green.
- [ ] Inspect diff/check; commit `feat(owner): enforce single owner identity`.

### Task 2: Secure promotion and immutable audit trail

**Files:**
- Create: `db/migrate/20260901000002_create_owner_audit_events.rb`
- Create: `app/models/owner_audit_event.rb`
- Create: `app/services/owner/promotion.rb`
- Create: `lib/tasks/owner.rake`
- Create: `test/services/owner/promotion_test.rb`
- Create: `test/tasks/owner_test.rb`
- Modify: `db/schema.rb`
- Modify: `db/seeds.rb`

**Interfaces:**
- Consumes: existing user email/password and `Core::User.owner?`.
- Produces: `Owner::Promotion.call(email:, password:) -> Core::User`; `bin/rails owner:promote` consuming `OWNER_EMAIL` and `OWNER_PASSWORD`; `OwnerAuditEvent.record!(action:, actor:, subject:, request: nil, metadata: {})`.

- [ ] Write failing tests for missing credentials, unknown account, wrong password, existing different owner, idempotent same-owner promotion, concurrent competing promotions, audit fields, and absence of password/email from audit metadata/output.
- [ ] Run `env -u RAILS_MASTER_KEY bin/rails test test/services/owner/promotion_test.rb test/tasks/owner_test.rb --seed 16201`; verify missing constants/task failures.
- [ ] Add an append-only audit table with action, actor/subject UUID foreign keys, request UUID, IP digest, user-agent digest, JSON metadata, timestamps, and action/time indexes; never store raw credentials, IP, or user agent.
- [ ] Implement promotion inside a transaction using `SELECT pg_advisory_xact_lock(691_016)` before checking the current owner, authenticate via `user.authenticate(password)`, update role, rotate/destroy existing sessions, and write only internal IDs/action to audit.
- [ ] Remove every seeded `admin` and production seed bootstrap. The task promotes an existing account only and emits a categorical success message.
- [ ] Run seed `16201` green, inspect diff/check; commit `feat(owner): add secure owner promotion`.

### Task 3: Private owner-only admin boundary

**Files:**
- Create: `app/controllers/admin/base_controller.rb`
- Create: `app/controllers/admin/dashboard_controller.rb`
- Create: `app/controllers/admin/users_controller.rb`
- Create: `app/views/admin/forbidden.html.erb`
- Modify: `config/routes.rb`
- Create: `test/controllers/admin/authorization_test.rb`

**Interfaces:**
- Produces: `Admin::BaseController#require_owner!`, `#secure_admin_response!`, and routes `GET /admin`, `/admin/users`, `/admin/users/:id`.

- [ ] Write failing request tests covering anonymous/student/teacher/owner on every admin route and HTML/JSON/other formats; assert hard 403, identical non-sensitive denial, no redirects, no dashboard queries before authorization, `Cache-Control: private, no-store`, `Pragma: no-cache`, and `X-Robots-Tag: noindex, nofollow` on both 403 and 200.
- [ ] Run seed `16301`; verify routes/controllers are missing.
- [ ] Implement one base-controller gate before resource loading. Set security headers before authorization; render a local minimal forbidden response without account data; audit successful owner access using route/controller/action and internal owner ID only.
- [ ] Run seed `16301` green, inspect diff/check; commit `feat(admin): enforce private owner authorization`.

### Task 4: Bounded metrics, search, filters, and presenters

**Files:**
- Create: `app/queries/admin/dashboard_summary_query.rb`
- Create: `app/queries/admin/user_index_query.rb`
- Create: `app/queries/admin/user_detail_query.rb`
- Create: `app/presenters/admin/dashboard_presenter.rb`
- Create: `app/presenters/admin/user_presenter.rb`
- Create: `app/presenters/admin/route_presenter.rb`
- Create: `test/queries/admin/dashboard_summary_query_test.rb`
- Create: `test/queries/admin/user_index_query_test.rb`
- Create: `test/queries/admin/user_detail_query_test.rb`

**Interfaces:**
- Produces: `DashboardSummaryQuery.call`, `UserIndexQuery.new(search:, activity:, route_state:, page:, per_page:).call`, and `UserDetailQuery.call(user_id:)`; result rows expose IDs, names, emails, timestamps, route/progress counts, readiness, exact cost microcents, and explicit unattributed/unpriced flags.

- [ ] Write failing hand-computed fixture tests for registered count; last activity as maximum session activity; route and state counts; completed/total steps; purchase readiness (`generation_status == completed` and at least one step); exact user billable microcents; exact route microcents from `metadata->>'route_id'` plus the route outline interaction; cached/failed/unpriced exclusions; and unknown route attribution.
- [ ] Write failing pagination/search/filter tests: case-insensitive escaped name/email search, allowlisted activity and route-state filters, `PER_PAGE = 25`, maximum `100`, stable `created_at DESC, id DESC`, and invalid inputs falling back safely.
- [ ] Write a query-count test comparing 5 users/10 routes with 105 users/500 routes; assert growth `<= 2` and total statements below the documented ceiling.
- [ ] Run seed `16401`; verify missing query objects.
- [ ] Implement SQL aggregates/subqueries with `LEFT JOIN`, grouped status counts, session maximums, and WP-7 `AiInteraction.billable`. Never load per-user/per-route associations in loops. Return value objects/presenters rather than relations used lazily by views.
- [ ] Add an explicit `commerce_available? => false` presenter seam. Do not output buyer, payment, paid amount, revenue, fees, or profit fields in WP-16.
- [ ] Run seed `16401` green, inspect query plans for indexed joins, diff/check; commit `feat(admin): add bounded user and route metrics`.

### Task 5: Dashboard and user drill-down UI

**Files:**
- Create: `app/views/admin/dashboard/show.html.erb`
- Create: `app/views/admin/users/index.html.erb`
- Create: `app/views/admin/users/show.html.erb`
- Create: `app/views/admin/shared/_pagination.html.erb`
- Create: `app/assets/stylesheets/admin.css`
- Modify: `app/assets/stylesheets/application.css`
- Modify: `config/locales/en.yml`
- Modify: `config/locales/es.yml`
- Create: `test/controllers/admin/dashboard_test.rb`
- Create: `test/controllers/admin/users_test.rb`

**Interfaces:**
- Consumes query/presenter objects from Task 4 only; views perform no model queries.

- [ ] Write failing request/render tests for every required non-commerce field, escaped search values, pagination links preserving allowlisted filters, English/Spanish keys, no missing translations, no payment/revenue/profit labels, and no prompt/response/password/session token/audit digest leakage.
- [ ] Run seed `16501`; verify templates are missing.
- [ ] Build summary cards and searchable/filterable table plus user drill-down route cards. Render registration/last activity, route counts/states, completed/total progress, readiness, exact WP-7 cost to four decimal USD precision, and honest unknown/unattributed labels.
- [ ] Use semantic tables/headings/forms, theme CSS variables, responsive overflow, visible focus states, and no inline hardcoded light-only colors.
- [ ] Run seed `16501` green, inspect diff/check; commit `feat(admin): build owner dashboard and user drill-down`.

### Task 6: Browser, isolation, cache, and leakage coverage

**Files:**
- Create: `test/system/owner_dashboard_test.rb`
- Create: `test/controllers/admin/cache_isolation_test.rb`
- Create: `test/controllers/admin/cross_user_isolation_test.rb`

**Interfaces:**
- Verifies the public interfaces from Tasks 1–5 without adding production behavior unless a failing acceptance test identifies a defect.

- [ ] Write system tests signing in as owner, searching and drilling into exactly the selected user, switching English/Spanish and light/dark themes, and confirming forbidden student/teacher sessions never see victim email/topic/cost.
- [ ] Add two independent sessions alternating owner/non-owner requests; assert no cached owner body or headers leak. Add direct cross-user IDs/search tests and sensitive-column body scans.
- [ ] Run `env -u RAILS_MASTER_KEY bin/rails test test/system/owner_dashboard_test.rb test/controllers/admin/cache_isolation_test.rb test/controllers/admin/cross_user_isolation_test.rb --seed 16601`; retain the intended red result before any fix.
- [ ] Apply only acceptance-driven fixes, rerun green, inspect diff/check; commit `test(admin): add browser and isolation coverage`.

### Task 7: Review corrections

**Files:** only files implicated by findings.

**Interfaces:** unchanged unless the approved specification requires correction.

- [ ] Review requirements line-by-line: owner cardinality, credential-first promotion, all `/admin` denial paths, auditing, headers/indexing, every field/source, no commerce fiction, bounded queries, translations/themes, concurrency/isolation/browser proof.
- [ ] Review code quality/security: SQL injection, mass assignment, session rotation, logging, PII, cache variance, authorization order, pagination bounds, index use, and N+1 behavior.
- [ ] For each Critical or Important finding, first add a failing regression test, then implement the smallest correction and commit it separately as `fix(owner): ...` or `fix(admin): ...`. Record no-op review if none exist.

### Task 8: Final verification and handoff

**Files:**
- Create: `WP16_HANDOFF.md`
- Create: `FINDINGS_WP16.md` only if deferred findings exist.

- [ ] Run focused tests with exact seed `16701` and record runs/assertions.
- [ ] Run main suite `env -u RAILS_MASTER_KEY bin/rails test test --seed 16702` and combined suite `env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 16703`; identify the known twelve engine failures by exact class/name and reject any new failure.
- [ ] Run `RAILS_ENV=test bin/rails zeitwerk:check`, relevant/full RuboCop, Brakeman, Bundler Audit, and `bin/importmap audit`; record Mermaid/DOMPurify only as confirmed baseline debt.
- [ ] Repeat query-count, concurrent promotion, browser, authorization, cache, and leakage commands with exact counts.
- [ ] Write handoff containing every commit/hash/purpose, migrations/invariants, credential-free promotion procedure, field-source mapping, query evidence, all commands/seeds/counts, risks/deferred commerce, and explicit no production/merge/push/deploy confirmation.
- [ ] Run focused handoff-related checks, inspect diff/check; commit `docs(wp16): record verification handoff`.
- [ ] Confirm `git status --short` is empty and do not begin WP-17.
