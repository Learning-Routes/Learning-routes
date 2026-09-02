# WP-17 Route Commerce Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every production change starts with a failing test and every task ends with focused verification, diff review, and a narrow commit.

**Goal:** Persist arbitrary ordered route modules, migrate existing routes without losing learning state, produce immutable and explainable USD route quotes, generate only the permanent free preview before purchase, and enforce paid-module locks on every server boundary.

**Architecture:** Keep route structure and access state in `LearningRoutesEngine`, and place pricing snapshots and calculators in a host-level `Commerce` namespace so WP-18 can add checkout and purchase records without changing route ownership rules. A partial unique index prevents multiple preview modules while a deferred PostgreSQL constraint trigger on both routes and modules requires exactly one preview at transaction commit. Existing `RouteStep#level` remains as a compatibility/rollback field while every step gains a required module foreign key after deterministic backfill. Quotes use integer microcents/cents, immutable snapshot columns, JSON assumption snapshots, and explicit unavailable results when any required provider or fee rate is unknown. One-module routes are valid and entirely free, so quoting reports `no_paid_modules` instead of inventing a sale.

**Tech Stack:** Rails 8.1, PostgreSQL, Minitest, Active Job/Solid Queue, ERB/I18n, Capybara/Selenium, WP-7 exact microcent pricing.

**Approved spec:** `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`

## Baseline and global constraints

- Base: clean `wp16-owner-dashboard` at `847978f`; required ancestors `39247f5`, `5484369`, `f98d74d`, and `db06f3f` verified.
- Fresh seed `17101`: focused route/AI surface, 231 runs and 757 assertions; only the documented three failures and one error in `RouteGenerationJobTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`, and `RouteGeneratorTest`.
- Fresh seed `17102`: main suite, 329 runs and 1,295 assertions, green.
- Fresh seed `17103`: combined suite, 651 runs and 2,225 assertions, with exactly the documented 3 failures and 9 errors: four `ContentEngine::AudioControllerTest`, four `ContentEngine::SectionAudioControllerTest`, and the four Learning Routes names above.
- Preserve route, step, progress, quiz, attempt, review, note, content, and URL identifiers. Retain `RouteStep#level` throughout WP-17.
- Do not create checkout, purchase, entitlement, webhook, refund, revenue, actual provider-fee, or profit records. Do not call Lemon Squeezy or any live AI/payment provider.
- Never persist monetary truth in binary floats. Convert display values only at the view boundary from integer values.
- Normal users own routes through `LearningProfile#user_id`; owner dashboard access is metadata inspection only and never changes module access.
- All list reads are deterministically ordered and bounded. All authorization happens before content or quote serialization.
- Every task follows red-green-refactor. Before every commit: run its focused command, inspect `git diff`, run `git diff --check`, and review requirements/security for the block.
- Do not amend, squash, rebase, merge, push, deploy, access production, apply a production backfill, change dependencies, fix baseline engine failures, or begin WP-18.

---

### Task 1: First-class module schema and exactly-one-preview invariant

**Files:**
- Create: `engines/learning_routes_engine/db/migrate/20260901000003_create_route_modules.rb`
- Create: `engines/learning_routes_engine/app/models/learning_routes_engine/route_module.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb`
- Create: `engines/learning_routes_engine/test/models/learning_routes_engine/route_module_test.rb`
- Create: `test/models/learning_routes_engine/route_module_database_test.rb`
- Create: `test/models/learning_routes_engine/route_module_concurrency_test.rb`
- Modify: `db/schema.rb`

**Interfaces and invariants:**
- `LearningRoute#route_modules` ordered by `(position, id)`.
- `RouteModule` has `learning_route_id`, positive one-based `position`, localized `title`/`description`, `access_state` (`preview`, `locked`, `purchased`), and `generation_state` (`outlined`, `generating`, `ready`, `failed`).
- PostgreSQL unique `(learning_route_id, position)` and partial unique `learning_route_id WHERE access_state = 0`.
- A deferrable constraint trigger checks exactly one preview at position 1 after route/module insert, update, delete, or route reassignment. A second trigger prevents changing or deleting the persisted preview identity except as part of deleting its route, making the free preview permanent. Route and its preview must therefore be created within one transaction. Concurrent module creation is serialized by locking the authoritative route row; the database constraints remain final authority.

- [ ] Write model/database tests for state separation, localized fallbacks, arbitrary positive module counts, positive positions, deterministic ordering, duplicate positions, zero/two previews, preview at position 1, direct SQL bypass, deletion/reassignment, and transactionally creating route plus preview.
- [ ] Write synchronized PostgreSQL coverage with separate connections proving competing preview inserts block on the same route row or resolve at the unique/constraint boundary and leave exactly one preview.
- [ ] Run seed `17201`; retain the intended missing-table/model failures.
- [ ] Implement the schema, partial unique index, deferred trigger functions, route association, model enums/validations, and explicit transactional module builder. Make `down` remove triggers/functions/index/table safely.
- [ ] Migrate the isolated test database and rerun seed `17201` green.
- [ ] Inspect schema SQL and concurrent behavior; commit `feat(routes): add first-class route modules`.

### Task 2: Associate steps with modules while preserving compatibility

**Files:**
- Create: `engines/learning_routes_engine/db/migrate/20260901000004_add_route_module_to_route_steps.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/route_module.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/route_step.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb`
- Modify: `engines/learning_routes_engine/test/models/learning_routes_engine/route_step_test.rb`
- Create: `test/models/learning_routes_engine/route_step_module_test.rb`
- Modify: `db/schema.rb`

**Interfaces and invariants:**
- `RouteModule#route_steps` uses the existing global route-step position ordering.
- `RouteStep#route_module` is required after backfill and must belong to the same route; PostgreSQL enforces this with a composite `(route_module_id, learning_route_id)` foreign key to a unique module pair.
- Existing global `learning_route_id`, `position`, `level`, prerequisites, statuses, timestamps, and all dependent IDs remain unchanged.

- [ ] Write failing tests for module traversal, same-route ownership, cross-route forged association, deterministic step order, and unchanged progress/attempt/quiz/review/content URLs.
- [ ] Add the nullable column/index/composite constraint in an expansion-safe migration; do not make it non-null until Task 3 has backfilled all rows.
- [ ] Add associations and validation without removing the legacy level scopes.
- [ ] Run seed `17202` green, inspect diff/check; commit `feat(routes): associate steps with modules`.

### Task 3: Deterministic and rollback-safe existing-route migration

**Files:**
- Create: `engines/learning_routes_engine/app/services/learning_routes_engine/legacy_module_backfill.rb`
- Create: `engines/learning_routes_engine/db/migrate/20260901000005_backfill_route_modules.rb`
- Create: `test/migrations/learning_routes_engine/route_module_backfill_test.rb`
- Create: `engines/learning_routes_engine/test/services/learning_routes_engine/legacy_module_backfill_test.rb`
- Modify: `db/schema.rb`

**Mapping:**
- Lock one route at a time and operate idempotently.
- Group existing steps by raw legacy level in first-step order; known `nv1`, `nv2`, `nv3` names receive localized legacy titles, and any non-enum/raw unknown group receives an explicit localized legacy title.
- Omit empty implicit level groups. An empty route receives one empty preview module at position 1.
- Re-number module positions deterministically without changing step positions. The first non-empty module becomes position 1 and preview; later non-empty groups are locked. Existing content remains in place but access policy is enforced later.
- Derive generation state conservatively: ready only when every content-bearing step in the module already has real content-ready data (assessment/review readiness handled by their authoritative records); generating/failed follows actual route/step state; otherwise outlined.
- Persist a mapping version/source in module metadata, retain `RouteStep#level`, and make reruns no-ops. Rollback drops only the module FK/records introduced by WP-17 and restores legacy traversal because level data is retained.

- [ ] Build realistic pre-migration records for nv1/nv2/nv3, empty, partial, failed/generating, unknown raw level, duplicate/irregular ordering, completed progress, prerequisites, quizzes, attempts, reviews, content, and route requests.
- [ ] Capture all route/step/dependent IDs and state, run backfill, and assert exact preservation plus exactly one first preview.
- [ ] Add idempotent retry and concurrent-backfill tests using PostgreSQL row locks.
- [ ] Run seed `17301`; retain intended failures before the backfill exists.
- [ ] Implement service and migration, backfill all existing routes in bounded batches, validate zero null module IDs, then set `route_module_id` non-null.
- [ ] Exercise `up`, compatibility rollback, and re-`up` in isolated migration tests; run seed `17301` green.
- [ ] Inspect row counts/diff/check; commit `feat(routes): migrate existing route structure`.

### Task 4: Immutable route quote snapshots

**Files:**
- Create: `db/migrate/20260901000006_create_commerce_route_quotes.rb`
- Create: `app/models/commerce/route_quote.rb`
- Create: `test/models/commerce/route_quote_test.rb`
- Create: `test/models/commerce/route_quote_database_test.rb`
- Modify: `engines/core/app/models/core/user.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb`
- Modify: `db/schema.rb`

**Snapshot columns:** user, route, `usd`, module counts, full-route AI microcents, estimated fee cents, markup `5000`, minimum-per-paid-module `299`, cost-based/minimum/final cents, estimator/rate/fee versions, image quality, route-shape/provider-rate/fee assumption JSON, `expires_at`, `superseded_at`, and future attachment state defaulting unattached.

- [ ] Write failing model and direct-SQL tests for ownership, USD-only, exact constants, total >= 1, paid = total - 1, non-negative amounts, final=max(cost-based, minimum), expiration, cross-user isolation, and snapshot immutability.
- [ ] Add a PostgreSQL ownership trigger that verifies quote user matches route profile owner. Add checks for counts/currency/money/constants/formulas and a trigger rejecting updates to every pricing/ownership snapshot column while allowing only lifecycle supersession/attachment fields.
- [ ] Make replacement quote creation transactional: lock route, create a new snapshot, mark only the prior unattached active quote superseded; never mutate a future attached quote.
- [ ] Run seed `17401` green, inspect trigger behavior/diff/check; commit `feat(commerce): add immutable route quotes`.

### Task 5: Versioned complete-route AI cost estimator

**Files:**
- Create: `app/services/commerce/provider_rate_catalog.rb`
- Create: `app/services/commerce/route_shape.rb`
- Create: `app/services/commerce/route_cost_estimator.rb`
- Create: `test/services/commerce/provider_rate_catalog_test.rb`
- Create: `test/services/commerce/route_cost_estimator_test.rb`
- Modify: `config/initializers/ai_costs.rb` or create `config/initializers/commerce.rb`

**Interfaces:**
- `Commerce::RouteCostEstimator.call(route:, configuration:)` returns `Available(cost_microcents:, estimator_version:, provider_rate_versions:, route_shape_assumptions:, image_quality:)` or `Unavailable(reason:, missing:)` and never substitutes zero for missing configuration.
- Route shape is explicit per module/step: outline call; expected lesson text calls; assessment/quiz calls; configured image calls with explicit quality and token assumptions; TTS characters/model; Tavily credits; and every paid content-agent/tool call enabled by configuration.

- [ ] Write failing arithmetic tests against WP-7 rates for text tokens, GPT Image text/image/output tokens, ElevenLabs characters, Scribe time if included, Tavily provider credits, cached/non-billable separation, and exact integer/Rational rounding.
- [ ] Cover arbitrary modules, multiple steps per preview, one module/zero paid, several paid counts, changed rate versions, and snapshots sufficient to reproduce historical estimates.
- [ ] Cover every missing model/rate/version/usage assumption, especially Tavily, as explicit unavailable results naming only configuration keys—not secrets.
- [ ] Implement a versioned catalog that consumes WP-7 canonical pricing and configured Tavily rate/version. Do not use historical `AiInteraction` actuals as estimates and do not rewrite quotes when configuration changes.
- [ ] Run seed `17501` green, inspect arithmetic and no-Float paths; commit `feat(commerce): estimate complete route AI cost`.

### Task 6: Configurable Lemon Squeezy fee gross-up and quote creation

**Files:**
- Create: `app/services/commerce/fee_configuration.rb`
- Create: `app/services/commerce/lemon_squeezy_fee_estimator.rb`
- Create: `app/services/commerce/route_quote_builder.rb`
- Create: `test/services/commerce/lemon_squeezy_fee_estimator_test.rb`
- Create: `test/services/commerce/route_quote_builder_test.rb`
- Modify: `config/initializers/commerce.rb`

**Formula:** Let marked-up cost in cents be `ceil(ai_cost_microcents * 1.5 / 10_000)`. For configured percentage `p` basis points and fixed fee `f` cents, the single closed-form cost-based gross charge is `ceil((marked_up_cost + f) * 10_000 / (10_000 - p))`. Final quote is `max(cost_based_gross, 299 * paid_modules)`. The snapshotted estimated provider fee is then calculated once from that final charge as `ceil(final * p / 10_000) + f`, so a minimum-winning quote does not retain the smaller cost-based fee. Assert that `final - estimated_fee >= marked_up_cost` whenever the cost-based branch wins. Reject `p < 0`, `p >= 10_000`, negative fixed fee, blank fee version, or missing configuration.

- [ ] Write failing exact-boundary tests where the minimum wins, cost-based wins, values meet exactly, rounding changes one cent, fixed and percentage fees combine, and repeated calls never recursively approximate.
- [ ] Test missing percentage/fixed/version and unavailable provider estimates prevent quote persistence. Test one-module routes return `no_paid_modules` and create no paid quote.
- [ ] Configure only credentials/runtime-backed fee inputs with no Costa Rica/account schedule default. Snapshot bps, fixed cents, currency assumptions, and version.
- [ ] Build quotes in one transaction from current module/shape/rate snapshots and supersede only eligible prior quotes.
- [ ] Run seed `17601` green, inspect formulas/diff/check; commit `feat(commerce): gross up configurable provider fees`.

### Task 7: Module-native outline creation and preview-first generation

**Files:**
- Modify: `engines/ai_orchestrator/app/services/ai_orchestrator/curriculum_brain.rb`
- Modify: `engines/ai_orchestrator/app/services/ai_orchestrator/schemas/curriculum_design_schema.rb`
- Modify: `config/prompts/curriculum_design.yml`
- Modify: `app/jobs/wizard_route_generation_job.rb`
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/route_generator.rb`
- Modify: `engines/learning_routes_engine/app/jobs/learning_routes_engine/route_generation_job.rb`
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/content_prefetcher.rb`
- Modify: `engines/learning_routes_engine/app/jobs/learning_routes_engine/background_content_generation_job.rb`
- Modify: `engines/learning_routes_engine/app/jobs/learning_routes_engine/content_pipeline_job.rb`
- Create: `test/jobs/learning_routes_engine/preview_first_generation_test.rb`
- Modify: relevant existing unit/job tests and fixtures.

**Flow:** The outline returns a non-empty arbitrary `modules[]`, each with localized title/description and multiple outlined steps. Route, all modules, and all outlined steps are persisted transactionally; module 1 is preview and later modules locked. Quote estimation runs from the complete outline. Only preview content is claimable before WP-18; no background traversal crosses the preview boundary.

- [ ] Write failing tests that a multi-step preview is completely generated, all later modules remain outline-only, assessment/media/quiz jobs are never enqueued for paid modules, fallback outlines are module-native, and arbitrary module counts work.
- [ ] Add retry/idempotency tests for duplicate wizard jobs, already-ready preview steps, failed preview retry, stale background jobs, and direct invocation of every generation job with a locked-module step.
- [ ] Preserve already-generated migrated content without deleting it, but ensure new jobs refuse to create or enrich locked paid content.
- [ ] Update structured output and normalization to modules without assuming three. Create quote only when estimator and fee configuration are available; otherwise retain recoverable route/preview with explicit quote-block reason.
- [ ] Run seed `17701` green; inspect enqueued job sets and paid-call negative controls; commit `feat(routes): generate preview module first`.

### Task 8: Server-enforced paid-module authorization and cache isolation

**Files:**
- Create: `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb`
- Modify: `engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb`
- Modify: `engines/learning_routes_engine/app/controllers/learning_routes_engine/steps_controller.rb`
- Modify: content/audio/section/tutor/quiz/block/review controllers and jobs that accept route-step IDs.
- Modify: cache-key builders touching route or step content.
- Create: `test/controllers/learning_routes_engine/module_lock_authorization_test.rb`
- Create: `test/controllers/learning_routes_engine/module_lock_isolation_test.rb`
- Create: `test/services/learning_routes_engine/module_access_policy_test.rb`

**Boundary:** Before purchases exist, normal users may read/act on preview steps only. Owners can inspect module/quote metadata only through `/admin`; owner role does not grant customer step access. Denials expose no body, answer, prompt, cache entry, or existence distinction.

- [ ] Write failing direct-request tests for locked route/module/step IDs across HTML, JSON, Turbo Stream, Turbo Frame, audio, section audio/images, quizzes, block attempts, tutor, completion, reviews, exports/search routes that exist, and alternate extensions.
- [ ] Cover cross-user IDs, mismatched route/module/step tuples, owner attempts, forged IDs, cached preview/paid bodies, and ready paid content preserved by migration.
- [ ] Centralize route ownership plus module access checks before record serialization or job enqueue. Use hard forbidden/not-found behavior consistently with existing customer UX without redirects leaking target data to JSON/Turbo callers.
- [ ] Include user ID, route ID, module ID, and effective access state/version in every relevant fragment/data/content cache key. Add alternating-user/access-state tests.
- [ ] Run seed `17801` green, inspect controller/job inventory and leakage scans; commit `feat(routes): enforce paid-module locks`.

### Task 9: Extend the existing owner dashboard with bounded module/quote facts

**Files:**
- Modify: `app/queries/admin/dashboard_summary_query.rb`
- Modify: `app/queries/admin/user_index_query.rb`
- Modify: `app/queries/admin/user_detail_query.rb`
- Modify: `app/controllers/admin/users_controller.rb`
- Modify: `app/views/admin/dashboard/show.html.erb`
- Modify: `app/views/admin/users/index.html.erb`
- Modify: `app/views/admin/users/show.html.erb`
- Modify: `config/locales/en.yml`
- Modify: `config/locales/es.yml`
- Modify: `test/queries/admin/*_test.rb`
- Modify: `test/controllers/admin/dashboard_test.rb`
- Modify: `test/controllers/admin/users_test.rb`

**Fields:** module count, paid-module count, preview module title/ID, each bounded module's access/generation state, active quote availability or explicit safe blocking reason, and estimated full-route cost only from a real persisted quote. Do not render purchase, payment, revenue, actual provider fee, refund, or profit claims.

- [ ] Write failing tests for routes with 1, 2, and many modules; paginated module drill-down; active/superseded quotes; unavailable reasons; no secret configuration/internal assumptions/customer cost exposure; and English/Spanish copy.
- [ ] Extend existing SQL/result objects rather than create a competing dashboard. Add module pagination capped at 100 and stable ordering.
- [ ] Prove fixed query counts at small and large user/route/module/quote volumes and inspect indexed query plans.
- [ ] Render with existing admin CSS variables in light/dark themes and maintain responsive table/card behavior.
- [ ] Run seed `17901` green, inspect field sources/diff/check; commit `feat(admin): expose module and quote readiness`.

### Task 10: Real-browser, isolation, and end-to-end compatibility coverage

**Files:**
- Create: `test/system/route_module_locks_test.rb`
- Modify: `test/system/owner_dashboard_test.rb`
- Create: `test/integration/route_module_compatibility_test.rb`
- Modify only production files implicated by an acceptance failure.

- [ ] First run the new system/integration tests red: journey/show displays one permanent free module with multiple real steps and visible locked module outlines, direct locked navigation cannot expose content, search/pagination/drill-down work, and existing preview progress/attempt URLs remain valid.
- [ ] Exercise desktop/mobile responsive behavior, English/Spanish, light/dark where practical, route refresh, back navigation, Turbo polling, and two browser sessions for cross-user/cache isolation.
- [ ] Verify owner dashboard module/quote navigation without granting owner customer access.
- [ ] Apply only acceptance-driven fixes, rerun seed `18001` green, inspect screenshots/DOM overflow and diff/check; commit `test(routes): add browser and isolation coverage`.

### Task 11: Requirements, migration, security, and code-quality review

**Files:** only files implicated by findings.

- [ ] Review every WP-17 invariant line-by-line: arbitrary modules; exactly one first permanent preview; multiple preview steps; paid modules visible/locked/sold together; one-time USD pricing; exact 299/5000 constants; full-route estimate; immutable quote; missing-price failure; no internal customer cost; safe migration; preview-only generation; every content boundary; honest admin data.
- [ ] Review PostgreSQL race behavior, deferred-trigger coverage, migration lock duration/batching/rollback, quote triggers, ownership joins, integer rounding, stale jobs, retries, ID forgery, alternate formats, answer/prompt leakage, cache variance, and N+1/query bounds.
- [ ] Run targeted RuboCop, Brakeman, Bundler Audit, and manual SQL trigger inspection.
- [ ] For each Critical or Important finding, add a failing regression test, implement the smallest correction, and commit it separately as `fix(routes): ...`, `fix(commerce): ...`, or `fix(admin): ...`. Do not fold review fixes into prior commits.

### Task 12: Full verification and WP-17 handoff

**Files:**
- Create: `WP17_HANDOFF.md`
- Create: `FINDINGS_WP17.md`

- [ ] Run the complete WP-17 focused suite with fresh seed `18101`, migration suite `18102`, browser suite `18103`, and record exact runs/assertions/skips.
- [ ] Run main suites with fresh seeds `18111`, `18112`, `18113`; require green and record exact counts.
- [ ] Run combined suites with fresh seeds `18121`, `18122`, `18123`; compare failures by exact class/test name with the twelve-name baseline and reject any addition or mutation caused by WP-17.
- [ ] Run `env -u RAILS_MASTER_KEY RAILS_ENV=test bin/rails zeitwerk:check`, full RuboCop, Brakeman, Bundler Audit, and importmap audit. Record only confirmed baseline dependency/security debt without changing pins.
- [ ] Repeat synchronized preview concurrency, migration preservation/idempotency, estimator boundary, missing configuration, quote immutability, authorization/cache isolation, generation negative controls, dashboard query counts, and real-browser commands with exact seeds/counts.
- [ ] Write handoff with every commit/hash/purpose; schema constraints/triggers and rollback strategy; old/new mapping evidence; estimator inputs/formulas/versions/rounding; fee formula/config; authorization/cache inventory; dashboard field sources/query counts; all verification; risks/manual checks; deferred WP-18 fields; and explicit no checkout/payment/production/merge/push/deploy confirmation.
- [ ] Inspect documentation diff, run `git diff --check`, commit `docs(wp17): record verification handoff`, and confirm `git status --short` is empty.
- [ ] Stop. Do not proceed to WP-18.

## Self-review checklist

- [ ] Every required WP-17 product invariant maps to a task and automated negative control.
- [ ] PostgreSQL enforces both at-most-one and at-least-one preview at transaction commit, and concurrency is explicitly tested.
- [ ] Migration preserves IDs/state, handles irregular/empty/partial routes, is idempotent, and retains a compatibility rollback via `level`.
- [ ] Quote snapshots contain every requested field, use integer money, enforce ownership/immutability in PostgreSQL, and distinguish lifecycle fields.
- [ ] Estimator covers outline, preview, paid modules, text, images with quality, TTS, Tavily, and configured paid tools; missing rates are unavailable.
- [ ] Fee schedule is configured/versioned/snapshotted, closed-form gross-up is exact, and no unverified account-specific rate is committed.
- [ ] No job or endpoint can generate or disclose locked paid content; owner status is not entitlement.
- [ ] Existing WP-16 queries/views are extended with bounded real records only and no WP-18 fiction.
- [ ] TDD, narrow commit, review checkpoint, three-seed suite, browser, and no-deployment rules are explicit.
