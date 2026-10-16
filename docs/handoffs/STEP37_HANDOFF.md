# STEP37_HANDOFF — the audit of 14 October, closed (STEP 39 PR 1)

Branch `every-known-bug`, from `main` at `49b0caf7`. STEP 39 §3 folds STEP 37 whole into PR 1,
with §0 rows 2, 3, 6–8b and the bugs found in Step 0 and the design critique. Every fix carries a
test seen red first; tests that pin behaviour already right say so in their commit.

## STEP 37, finding by finding

| # | Before | After | Tests |
|---|---|---|---|
| 1 Seed | `content_delivery_seed.rb` destroyed the first route's steps in any environment, and raised a strict-loading error on a fresh `db:prepare` (`profile.user`, then `route.route_steps`). | Runs only when `Rails.env.local?` **and** the route belongs to `student@learning-routes.com`; otherwise prints "skipped: production data". Loads by query; steps destroyed with `strict_loading(false)` so dependents still go. | `test/seeds/content_delivery_seed_test.rb` (3) |
| 4 Rescues | Seven rescues swallowed the error silently. | The sweep found eight (`user_engagement.rb:66` too). Each logs class, message and an id, and keeps its fallback; none re-raises. Five constant-returning rescues are allow-listed by file and exception class, each with its reason. The literal rule in §2 flags ~42 rescues that handle the error for real (retry, read the winner, mark failed), so the sweep flags an empty or bare-constant body. | `test/config/no_silent_rescue_test.rb` |
| 6 Icons | SVG strings through `html_safe` in two views. | `svg_icon(name)` over a frozen hash in `ApplicationHelper`, used by the landing. The wizard's "icons" were emoji entities, now plain Ruby strings. Seven redundant `.html_safe` on `MarkdownRenderer.render` (already a sanitized SafeBuffer) removed. Only `svg_icon` is allowed. | `test/config/no_raw_html_in_views_test.rb` (2) |
| 2 Community | 1,127 lines, zero tests. | 55 tests. Fixed, each red first: the feed and the floating thoughts showed **private and unlisted** shares (topic, description, comments); **clone never worked** (copied steps kept the original's module ids → 422; now into the copy's own modules, paid modules locked and outlined, one transaction); strict-loading violations in the sidebar, post destroy, comment create, like toggle, share create/show/clone; feed N+1 (latest comment per post: +13 queries for 6 rows → +2, batched in `StatePreloader`); post body opened with a blank line. | `engines/community_engine/test/` (8 files) |
| 3 Auth | No test for Google sign-in or sign-up. | Cases (a)–(d) and sign-up. Found: `config/environments/test.rb` had no host for Core's routes, so the verification mail raised (and was only logged) — no test could see it. Production was unaffected. `[OAUTH FAILURE]` lines carry no email (checked). | `test/controllers/core/omniauth_callbacks_controller_test.rb` (5), `registrations_controller_test.rb` (5) |
| 5 Jobs | No tests. | Pinned as they are. The streak job only clears `streak_freeze_used_today` (resets happen in `StreakService` on the next activity) — §5's description did not match the code, which is sound. Session cleanup: 31 days deleted, 29 kept. Background generation: bounded and idempotent. | `test/jobs/…` (4) |
| 8 Cable | `solid_cable` 3 → 4 with no test (test adapter). | One system test boots the real solid_cable adapter against the test cable DB and proves a tutor reply reaches the open page without a reload. Red when the stream name is broken; green five runs in a row. No app bug found. | `test/system/tutor_reply_over_solid_cable_test.rb` |
| 7 Deploy | — | Closed by STEP 38 §6 (manual-only, #67). §A is not done. | — |

## Also in PR 1

- **§0 row 2:** the landing named Claude; nothing routes to it. Removed in es and en. The test
  maps each named provider to its models and requires one that AiClient accepts and production
  code uses. `test/i18n/landing_integrations_test.rb`
- **Row 8, one-topic rule:** `on: :create`, so a request saved with two topics before STEP 38
  still takes its status updates. `test/models/route_request_test.rb`
- **Landing ETag (Step 0):** the key ignored the theme, so a switch got a 304 with the old one.
  Then the review found the page carries the session's CSRF token: a 304 to a new session
  replayed an old token (theme toggle → 422) and `public` let a shared cache serve it to others.
  Key = locale + theme + the session's CSRF secret; anonymous only; never public.
  `test/controllers/landing_cache_test.rb` (6)
- **Dead `DashboardController` (Step 0):** removed with its view; `/dashboard` still 301s to
  `/profile`. `test/controllers/dashboard_redirect_test.rb`
- **Docs:** STEP 37, 38, 39 under `docs/steps/`; `docs/runbooks/rotate-postgres-password.md`.

## Suites (clean tree, head `6e6bbbf8`)

`bin/rails db:test:prepare test` 1969 runs, 0 failures, 0 errors · `bin/rails test engines/*/test`
436 runs, 0 failures · `bin/rails test:system` 110 runs, 0 failures.

## What remains

- **Owner decision — clone and paid modules:** a clone's non-preview modules are locked and
  outlined, so a clone never inherits the sharer's purchase. Confirm.
- **Clone copies review state:** `step.dup` still copies `fsrs_*` and metadata keys such as
  `step_quiz_id` / `step_quiz_generated` / `audio_sections`, so the cloner can inherit the
  sharer's due reviews and a quiz flag pointing at the sharer's quiz. Not changed here.
- Deleting someone else's post redirects with an alert, not a 403/404 (it is not deleted).
- Two simultaneous Google callbacks for the same new user would raise `RecordNotUnique`.
- `lesson_section_parser.rb` logs a JSON parse message that can quote up to 200 characters of
  generated lesson text (no user data).
- The owner's live check of the tutor chat after the deploy (§7) is still required.
- §A (automatic deploy) stays off by ruling.
