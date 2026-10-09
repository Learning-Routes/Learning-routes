# WP-40 — The owner's panel: who joins, what they do, what they don't

**Source of truth:** `PROMPT_31_WP40_THE_OWNERS_PANEL_WHO_JOINS_WHAT_THEY_DO.md` (the brief). This
document does not restate it. It records the rulings made on 9 October against the code, the
interfaces the plan builds to, and (§3, after the census) which column each stage reads.
Section numbers like "brief §3" refer to the brief.

## 1. Base and scope

- Branch `wp40-owner-panel` from `main` at `7396de2f` (WP-37 merged). Worktree
  `Learning-routes-wp40`. Independent of WP-37b; no shared files.
- **`db/structure.sql` is the schema.** The app uses `schema_format = :sql`. `db/schema.rb`
  stops at `2026_09_01` and has neither `route_modules` nor `commerce_route_purchases`; it is
  left alone (a separate cleanup item).
- The owner role: `owner:promote` (an earlier package, password-authenticated) is the existing
  way to promote an account. This branch adds no task that grants a role.

## 2. Rulings (9 October, approved by the owner)

| # | Question | Ruling |
|---|---|---|
| R1 | Schema source | `db/structure.sql`. |
| R2 | Google vs password | `provider = 'google_oauth2'`. `omniauth_callbacks#find_or_create_user` also writes `provider` onto an existing password account the first time it signs in with Google, so the split is labelled **"Signs in with Google / password"**, not "signed up with". The census counts linked accounts: `provider` set and `email_verified_at` NULL or more than 1 minute after `created_at`. A Google signup is verified at creation only when Google asserts the email. |
| R3 | Paid | `commerce_route_purchases.paid_at` where `state IN ('paid','refunded') AND test_mode = false`. **Refunds** (`refunded_at`, same filter) are their own number next to Paid on the dashboard and their own row on the timeline. A refund never removes the conversion. |
| R4 | Exams | Every `assessment_type` except `step_quiz` (4) and `diagnostic` (0): `level_up`, `final`, `reinforcement`. `score IS NULL` is an open attempt: neither passed nor failed, and it does not count toward `exam_never_passed`. A failed attempt is `score IS NOT NULL AND passed = false`. |
| R5 | Came back | The earliest of: a `core_sessions` row, an `analytics_study_sessions` row, a completed step (`completed_at`), an assessment result, or a purchase, created ≥ 24 h after `core_users.created_at`. `Core::SessionCleanupJob` deletes sessions idle > 30 days and stays as it is; the undercount caveat goes in the handoff. |
| R6 | Generated | `generation_status = 'completed'`; timestamp `GREATEST(r.created_at, COALESCE(r.generated_at, r.created_at))`. A route cloned by `CommunityEngine::RouteSharer` carries the original's `generated_at`; the timeline shows it as **"cloned from a shared route"**, not "route generated". Detection: `r.generated_at < r.created_at`. `clone!` writes no link to the new route (`shared_routes.cloned_from_id` is never set by it), but `dup` resets `created_at` and keeps the original's `generated_at`, while both generators set `generated_at` after the row exists. The census counts these rows. |
| R7 | Lesson opened | `analytics_study_sessions.started_at` (earliest). `steps#show` → `find_or_start_study_session` creates the row on every view. The census confirms it in production data. |
| R8 | Forbidden words | `AdminDashboardTest` keeps asserting the dashboard never says `purchase|revenue|profit|fee|quote|payment`. The stage is **"Paid" / "Pagó"**; refunds are **"Refunded" / "Reembolsado"**. No admin label uses the forbidden words. |

## 3. The ten stages (settled after the census)

Each stage is one correlated SQL expression in `Admin::Stages`, keyed by stage, evaluated for a
user `u`. It returns the stage's earliest timestamp, or NULL. The funnel, the users index and the
timeline all use these expressions, so a stage cannot mean two things in two places.

| # | Key | Expression (timestamp; NULL = not reached) |
|---|---|---|
| 1 | `registered` | `u.created_at` |
| 2 | `verified` | `u.email_verified_at` |
| 3 | `onboarded` | `CASE WHEN u.onboarding_completed THEN COALESCE((SELECT created_at FROM learning_routes_engine_learning_profiles WHERE user_id = u.id), u.updated_at) END` |
| 4 | `route_requested` | `MIN(route_requests.created_at)` |
| 5 | `route_generated` | R6, `MIN` over the user's routes through their profile |
| 6 | `lesson_opened` | `MIN(analytics_study_sessions.started_at)` |
| 7 | `step_completed` | `MIN(route_steps.completed_at)` over the user's routes, `status = 3` |
| 8 | `exam_passed` | `MIN(assessment_results.created_at)` where `passed`, R4 types |
| 9 | `paid` | R3, `MIN(paid_at)` |
| 10 | `came_back` | R5, `LEAST(...)` of the five sources |

**Furthest stage** is the highest number whose expression is not NULL, whatever the order.
**"Reached it, not the next"** (`stage=<key>` filter and the funnel's bar links) means stage *n*
reached and stage *n+1* not reached. For `came_back` (10) it means reached.

*This section is confirmed or amended from the census output before Task 2 starts. Any stage
the census switches is recorded here with the numbers that switched it.*

## 4. Segments

`Admin::Segments::THRESHOLDS` is one frozen hash. Each segment is a SQL condition plus a `since`
expression (when the condition began). The threshold applies to `since`.

| Key | Condition | `since` | Threshold |
|---|---|---|---|
| `no_route` | no `route_requests` row | `u.created_at` | 24 h |
| `request_failed` | latest request `status = 'failed'` (the reaper writes `failed` too), and no `generation_status = 'completed'` route created after it | that request's `updated_at` | 0 |
| `route_no_lesson` | a generated route (R6), no study session | earliest generated timestamp | 48 h |
| `stuck` | has a generated route; no step completed since `since` | latest of (last `completed_at`, earliest generated timestamp) | 7 d |
| `exam_never_passed` | ≥ 2 failed attempts (R4) on one assessment, none passed on it | the second failure's `created_at` | 0 |
| `gone` | has any activity beyond registration (R5 sources, any time) | the latest activity ("last did") | 14 d |
| `preview_done_not_paid` | every step of a route's preview module (`access_state = 0`) completed, no paid (R3) for that route | `MAX(completed_at)` of those steps | 3 d |

`stuck` names the step: the lowest-position step of that route with `status <> 3`. `gone` and
`stuck` exclude `role IN (owner, teacher)`. Boundary tests: threshold − 1 minute is out,
threshold is in.

## 5. "Last did"

The single most recent event across: sign-in (`core_sessions.created_at`), route request,
generated route, lesson opened, step completed, assessment result, paid, refunded. It is shown as
the event's name plus its relative time. With no event it reads "nothing yet · joined N ago".
`sort=last_did` orders by it (NULLs last, then registration desc).

## 6. Interfaces

```ruby
Admin::Stages::KEYS                 # 10 symbols, in order
Admin::Stages.sql(key)              # correlated SQL for user alias `u`, returns timestamp or NULL
Admin::FunnelQuery.call(since: nil) # => Result(stages: [Stage(key, count, pct_of_registered, conversion_from_previous)], registered:)
Admin::SignupsQuery.call(now: Time.current, zone: owner_zone)
                                    # => Result(weeks: [Week(starts_on, count)] x12, this_week:, last_week:, total:, by_provider: {google:, password:}, by_locale: {"en"=>, "es"=>})
Admin::Segments::THRESHOLDS         # { no_route: 24.hours, ... }
Admin::SegmentsQuery.call(now:, limit: 5)          # => { key => Segment(key, count, recent: [Person(id, name, email, since, detail)]) }
Admin::SegmentsQuery.page(key, now:, page:)        # one segment, 25 per page, since desc
Admin::UserTimelineQuery.call(user_id:, page: 1)   # => Result(events: [Event(at, kind, detail)], page:, per_page: 50, total_count:, reached:, next_stage:, segments:)
Admin::UserIndexQuery.new(..., segment:, stage:, sort:)  # Row gains :stage, :last_did_kind, :last_did_at
AiOrchestrator::AdminMailer.owner   # the single owner lookup; CostAlertJob and weekly_digest use it
```

The timeline names a step only by its title, and only for steps the student has reached
(`status <> 0`). It never shows lesson content, prompts or responses. AI interactions appear as
one row per day: number of calls and priced cost.

## 7. Non-goals

These are taken from brief §6: chart libraries, retention curves, exports, sending mail to
students, the teacher role, the design of the `analytics_*` tables, and any write to a student's
data. The census and every query are read-only.
