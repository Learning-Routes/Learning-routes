# WP-17 Handoff

Branch: `wp17-route-commerce-foundation`, updated by merge commit `a9b95ff` from corrected WP-16 main (`a4e4cf6`) without rewriting WP-17 commits. No production access, live provider call, checkout/payment integration, push, or deployment occurred during WP-17 implementation.

## Delivered

- Persisted `LearningRoutesEngine::RouteModule` with arbitrary positive ordered module counts, deterministic positions, a permanent position-1 preview, separate access/generation states, and ordered step ownership.
- PostgreSQL partial uniqueness plus deferred constraint triggers enforce exactly one preview per route; composite keys prevent a step from referencing a module on another route. Concurrent creation is covered.
- Legacy `nv1/nv2/nv3` and irregular steps backfill deterministically without changing route/step IDs, order, status, progress, attempts, reviews, or URLs. First non-empty legacy group becomes preview; empty routes retain the initial preview. Rollback removes module ownership/tables while legacy `level` remains intact.
- Immutable integer `Commerce::RouteQuote` snapshots with PostgreSQL checks/triggers for USD, counts, non-negative money, ownership, constants, and immutable pricing fields. Replacement supersedes only an unattached active quote.
- Versioned full-route estimator snapshots outline, text, image quality, TTS, search/tool, module/step shape, and provider rate/version assumptions. Missing required provider or fee configuration returns `pricing_configuration_missing`; it never prices missing data as zero.
- Preview-first generation persists the complete outline and creates full lesson content only for preview steps. Every paid-content job rechecks preview access before creating or enqueueing work.
- Server locks cover step HTML/JSON/Turbo/Turbo Frame, completion, quizzes, blocks, tutor, reviews, audio, section audio/images, notes, lesson/exercise tools, and voice responses. Checks occur before target loading, cache reads, serialization, mutation, or job enqueue. Owners receive metadata access only through private `/admin`, never customer entitlement.
- Customer route pages show all module titles/descriptions, render steps only for the free preview, and hide paid step titles/bodies/answers. Legacy journey/review indexes are preview-filtered.
- Existing owner dashboard now reports persisted module count, paid count, preview identity/title, quote availability/blocking reason, and estimated full-route AI cost only from a real quote. Admin route drill-down paginates ordered module metadata at 100 maximum.

## Pricing math

All monetary truth uses integer, `Rational`, or exact ceiling operations. Markup is exactly 5000 basis points: `marked_up_cents = ceil(ai_microcents * 3 / (2 * 1_000_000))`. Fee gross-up is non-recursive: `gross = ceil((marked_up + fixed_cents) * 10_000 / (10_000 - percentage_bps))`; estimated fee is `ceil(gross * percentage_bps / 10_000) + fixed_cents`. Final price is `max(cost_based_price, paid_module_count * 299)` in USD cents. Actual AI ledger cost remains separate from estimates; actual provider fees remain WP-18.

## Query evidence

- `Admin::UserDetailQuery`: fixed 5 queries at zero and 30+ routes.
- `Admin::RouteDetailQuery`: fixed maximum 4 queries at 1 and 31+ modules; page size clamps to 100.
- Existing bounded user index remains pagination/search/filter based and retains its fixed query-count tests.

## Verification

- Final focused WP-17, migration, concurrency, authorization, and browser suite: seed `18481`, 137 runs, 777 assertions, 0 failures/errors.
- Main suite: seeds `18482`, `18483`, `18484`; each 409 runs, 1724 assertions, 0 failures/errors.
- Combined suite: seeds `18491`, `18492`, `18493`; each 738 runs, 2685 assertions, exactly the same 3 failures/1 error:
  - `LearningRoutesEngine::GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`
  - `LearningRoutesEngine::ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`
  - `LearningRoutesEngine::RouteGenerationJobTest#test_generates_route_and_creates_steps`
  - `LearningRoutesEngine::RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`
- Browser seeds `18471` through `18480`: each 3 runs, 27 assertions, green; covers admin navigation/search/pagination, user/route drill-down, responsive layout, light/dark themes, and hard non-owner denial. The complete focused suite also covers preview/locked presentation and direct denial.
- No pending test migrations; Zeitwerk eager load passed. RuboCop: 501 files, no offenses. Bundler Audit: no vulnerabilities. Brakeman: one existing medium `permit!` warning in `BlockAttemptsController`. Importmap: six known out-of-scope Mermaid/DOMPurify advisories.

## Deferred to WP-18

Checkout, Lemon Squeezy/PayPal calls, purchases, payment entitlements, webhooks, refunds, actual provider fees, revenue/profit, and paid-module generation remain absent. Configuration must be supplied and verified before quoting is available. No backfill was applied outside the test database.
