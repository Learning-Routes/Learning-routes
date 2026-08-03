# Findings deferred out of WP-2

Things found while doing WP-2 that were **deliberately not fixed** to keep the PR
reviewable. Nothing here is a regression introduced by WP-2's application changes —
items 1–3 are pre-existing lazy-loading defects that WP-2's test-environment guard
newly *reveals*, and items 4+ are unrelated.

---

## 1. Engine suite: 14 strict-loading failures (5 failures, 9 errors)

**Status: the full suite is RED. CI is green because CI does not run these tests.**

`bin/rails db:test:prepare test` (what CI runs) → **101 runs, 0 failures, 0 errors**.
`bin/rails test test engines/*/test` (everything) → **389 runs, 5 failures, 9 errors**.

Turning on `strict_loading_by_default` in `config/environments/test.rb` made the test
environment enforce what production has always had switched on. These 14 are genuine
lazy traversals in engine code that were previously invisible everywhere.

**They are not new production breakage.** Production now runs `:log`, so each of these
logs a `[StrictLoading]` warning instead of raising — strictly better than the `:raise`
that was live before. But they must be fixed before WP-4 makes CI run the engine suite,
or CI will go red and block the auto-deploy.

### 1a. Errors — `ActiveRecord::StrictLoadingViolationError` (9)

| Test | Association |
|---|---|
| `ContentEngine::AudioControllerTest` ×4 | `RouteStep#learning_route` |
| `ContentEngine::SectionAudioControllerTest` ×4 | `RouteStep#learning_route` |
| `LearningRoutesEngine::RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam` | `LearningRoute#route_steps` |

The eight audio-controller cases are the **same** call: an ownership check that walks
`step.learning_route` to verify the signed-in user owns the step. That is a security
check on a hot path, so it is worth fixing properly rather than exempting.

Fix shape — identical to the one already applied in `MediaPrefetchJob`:
```ruby
step = LearningRoutesEngine::RouteStep
         .includes(learning_route: :learning_profile)
         .find(params[:step_id])
```

### 1b. Failures — jobs that swallow the violation (5)

| Test | Symptom |
|---|---|
| `LearningRoutesEngine::GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found` | assertion false |
| `LearningRoutesEngine::RouteGenerationJobTest#test_generates_route_and_creates_steps` | `Expected false to be truthy` |
| `LearningRoutesEngine::AssessmentGenerationJobTest#test_creates_assessment_with_questions_on_success` | `Expected nil to be truthy` |
| `LearningRoutesEngine::ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps` | `Expected false to be truthy` |
| `LearningRoutesEngine::ContentGenerationJobTest#test_marks_step_as_content_generated_on_success` | assertion false |

Confirmed caused by the guard flip: these pass on the pre-change tree
(`engines/learning_routes_engine/test/jobs` → 10 runs, 0 failures before; failing after).

These are **worse than the errors**, because the jobs `rescue => e` broadly and turn the
violation into a silently failed run rather than a crash. Under the old production config
(`:raise`) that means these jobs have been failing in production and reporting success.
Worth confirming against production logs before assuming they work today.

**Recommended:** fold into WP-4, before CI is widened to run the engine suite.

---

## 2. `db/seeds.rb` runs on every boot via `db:prepare`

Out of scope here, but interacts with A5. `bin/docker-entrypoint` now fails hard when
`db:prepare` fails; `db:prepare` also seeds on database creation. HEAD's seeds are
correctly gated behind `Rails.env.local?`, so this is safe now — noting it only because
the entrypoint change makes seed failures deploy-blocking rather than silent.

---

## 3. `RouteRequest::STALE_AFTER` is env-tunable but undocumented

`ROUTE_REQUEST_STALE_AFTER_MINUTES` (default 30) is read in `app/models/route_request.rb`
but is not set in `config/deploy.yml`, so production uses the default. Fine as-is; add it
to `deploy.yml` under `env.clear` if the 30-minute window turns out to be wrong once real
generation timings are visible.

---

## 4. Deferred from AUDIT.md, unchanged by this PR

Listed so they are not lost; all were explicitly out of WP-2 scope.

| Ref | Item |
|---|---|
| P1-1 | `curriculum_design` missing from `AiModelConfig::TASK_TYPES` → 100% of routes are the fallback template |
| P1-2 | Prompts order 11 block types the parser/renderer cannot render → literal `:::` text reaches students |
| P1-3 | `ai_client.rb:39` strips `response_format`; `with_schema` available but unused |
| P1-5 | 14 of 17 prompt templates receive no `{{language_directive}}` |
| P1-6 | ElevenLabs priced `flat: 0` — the largest per-route cost is invisible to every cap |
| P2-2 | Deployed image seeds a `password123` admin (fixed at HEAD, ships with this deploy) |
| P2-3 | Password reset does not call `forget!` |
| P2-4 | No `ApplicationCable::Connection` — `/cable` accepts unauthenticated connections |
| P2-6 | XP replayable — no unique index on `xp_transactions` |
| P3-1 | CI runs 101 of 389 tests and auto-deploys on green |
