# PROMPT 31 — WP-40: the owner's panel — who joins, what they do, what they don't

**Package:** WP-40. **Base:** `main` (after the owner's `git merge --ff-only wp37-journey-map`,
so `7396de2f` or later). **Branch:** `wp40-owner-panel`. **Independent of WP-37b:** it touches
`app/controllers/admin/**`, `app/queries/admin/**`, `app/views/admin/**`, `app/assets/stylesheets/admin.css`,
`app/mailers`, `app/jobs`, `config/recurring.yml`, `config/locales/{en,es}.yml` (the `admin:` tree)
and `lib/tasks/wp40_*.rake` — none of WP-37b's files — so the two branches run in parallel.
**Method:** superpowers from the brainstorm (short: the owner's questions are fixed, the data is
what it is) → spec → plan → TDD → verification → review, with the owner's checkpoints in §8.
Code, commits and this work in English; product strings in both locales.

Read first: `app/controllers/admin/base_controller.rb`, the four query objects in
`app/queries/admin/`, their tests in `test/queries/admin/`, `test/controllers/admin/*`,
`app/views/admin/**`, `app/assets/stylesheets/admin.css`, `app/models/owner_audit_event.rb`,
`engines/ai_orchestrator/app/mailers/ai_orchestrator/admin_mailer.rb` (and its `cost_alert`),
`config/recurring.yml`, and `db/schema.rb` for the tables named in §3.

---

## 0. The owner's question, in his words

*"El panel de administrador tiene que ir ya: para ver quién se une, qué hace y qué no hace."*

Three questions. **Who joins** — how many, when, from where (Google or password), in which
language. **What they do** — how far each person gets: verified, onboarded, asked for a route,
got it generated, opened a lesson, finished a step, passed an exam, paid, came back. **What
they don't** — where they stop, and who is stuck right now, so he can write to them.

### What already exists (verified against the code on 8 October — do not rebuild it)
`/admin`, owner-only (`role: owner`, unique by index; `require_owner!`; `OwnerAuditEvent` row
per request; `Cache-Control: private, no-store`; `X-Robots-Tag: noindex`); a dashboard with four
figures (registered users, routes, actual AI cost, unpriced interactions); the users index
(search by name or email, `activity=active|inactive` at 30 days from `core_sessions.last_active_at`,
`route_state`, routes, completed/total steps, cost, purchase-ready; 25 per page); the user page
(role, verified, onboarding, routes with progress, modules, quotes, cost); the route page; the
studio API (WP-38). Ten tests. All of it stays, and this package **adds** to it.

### Before the first task: the owner's role
The seeded admin was neutralised. If no production account carries `role: owner`, the panel
opens for nobody. The owner checks it himself (`Core::User.find_by(role: :owner)` in a
`-r job` runner) and, if needed, promotes his own account **in his terminal, never from this
branch**. Do not write a rake task that grants the owner role: the model's unique-owner
validation and the console are enough, and a task would be a standing door.

---

## 1. What stays exactly as it is
`Admin::BaseController`'s four guards and the audit row; the query-object pattern (SQL in
`app/queries/admin/*`, `Data.define` results, one test file per query); the users index's
existing filters and columns; `admin.css` as the only stylesheet; no new gem; no JavaScript
chart library — a sparkline or a bar is inline SVG from a small helper; `strict_loading` as
configured (test raises on `:all`).

---

## 2. The three questions as screens

### 2.1 Dashboard (`admin/dashboard#show`) — the week at a glance
Keep the four figures. Add, in this order:
- **Signups, last 12 weeks**: a weekly bar sparkline (inline SVG, 12 bars, current week
  highlighted) with the number this week, last week, and the 12-week total; under it, two
  small splits for the same 12 weeks: Google vs password (`provider`), and locale.
- **Activation funnel, all time and last 30 days**: the ten stages of §3 as horizontal bars with
  count and % of registered; each bar links to the users index filtered to "reached this stage
  and not the next" (§2.2).
- **Needs attention**: the §4 segments as cards — count, the five most recent people (name,
  email, since when), a link to the full list.
- **Spend**: the existing cost figure gains "last 7 days" next to "all time".

### 2.2 Users index — segments and "last did"
- New filter `segment=<key>` for every §4 segment and `stage=<key>` for every §3 stage (reached
  it, not the next). The filter chips show the active one; combinable with the existing
  search and `activity`.
- New column **Last did**: the most recent event from §3's sources — its name and relative time
  ("completed a step · 3 d ago", "signed in · 2 h ago", "nothing yet · joined 6 d ago").
- New column **Stage**: the furthest §3 stage reached, as a short chip (`verified`, `route`,
  `lesson`, `step`, `exam`, `paid`).
- Default sort stays registration desc; `sort=last_did` sorts by the new column.

### 2.3 User page — the timeline and the gap
- **Timeline**: every event of §3 for this person, newest first, 50 per page: registration,
  verification, onboarding, each route request (with `status`, and `error_message` when
  failed), route generated, each session start (one row per `core_sessions` row, grouped per
  day beyond the first week), each step completed (title, route), each assessment result
  (score, passed), each purchase, reinforcement created, AI interactions as a daily subtotal
  of calls and cost — never one row per call.
- **Where they are**: a line above the timeline — "Reached: *first step completed* · Not yet:
  *exam passed* · Last did: … · Segments: *stuck 9 days on «Saludos formales…»*".
- **Copy email**: the address as a `mailto:` link, nothing else — no sending from the panel.

### 2.4 Weekly digest
`Admin::WeeklyDigestJob` on Solid Queue's `recurring.yml`, Mondays 07:10 UTC, production only:
one email to the owner (`AiOrchestrator::AdminMailer` gains `weekly_digest`; move both mailer
methods' owner lookup to one place) with the dashboard's numbers for the past 7 days and the
"needs attention" counts with the five most recent names per segment. No owner → no email,
and the job logs that at `warn`. The mail is text and HTML, both locales from the owner's
`locale`.

---

## 3. The funnel: ten stages, each with its evidence in the schema

Each stage is **a column that already exists**. The census in §5 proves which are written in
production before a bar is drawn from them. Per user, the stage's timestamp is the **earliest**
matching row.

| # | Stage | Evidence (table.column) | Notes |
|---|---|---|---|
| 1 | Registered | `core_users.created_at` | split by `provider` (`google` vs null) and `locale` |
| 2 | Verified | `core_users.email_verified_at` | a Google signup is verified at creation — confirm in `Core::User` and record it |
| 3 | Onboarded | `core_users.onboarding_completed` + `learning_routes_engine_learning_profiles.created_at` | the profile row is the timestamp; the flag is the truth |
| 4 | Route requested | `route_requests.created_at`, `status`, `error_message` | failed requests count here and are their own segment |
| 5 | Route generated | `learning_routes_engine_learning_routes.generated_at` or `generation_status = 'completed'` | the census says which of the two is reliable |
| 6 | Lesson opened | `analytics_study_sessions.started_at` (if `steps#show` writes it — census) else `route_steps.status = in_progress` with `updated_at` | name the chosen source in the handoff |
| 7 | Step completed | `learning_routes_engine_route_steps.completed_at` | and the step's title for the timeline |
| 8 | Exam passed | `assessments_assessment_results.passed = true`, `created_at` | attempts that failed show on the timeline, not in the funnel |
| 9 | Paid | `commerce_route_purchases.created_at` | |
| 10 | Came back | a `core_sessions` row created ≥ 24 h after the user's first | "returning", the one stage that is not a product step |

Stages are ordered for the bars, but a person's **furthest stage** is the highest number
reached, whatever the order they happened in.

---

## 4. "What they don't do": the segments

Each segment is a query with a `since` (when the condition began) so the index can sort by it,
and a threshold in one constant table (`Admin::Segments::THRESHOLDS`), tested at the boundary.

| Key | Who | Threshold |
|---|---|---|
| `no_route` | registered, onboarded or not, no route request | ≥ 24 h since registration |
| `request_failed` | last route request `status = failed` (or stale: `ReapStaleRouteRequestsJob`'s state) and no completed route since | immediate |
| `route_no_lesson` | a generated route, no lesson opened | ≥ 48 h since `generated_at` |
| `stuck` | last completed step (or route start) with no step completed since | ≥ 7 d; the step they are on, named |
| `exam_never_passed` | ≥ 2 failed results on one assessment, none passed | immediate |
| `gone` | had activity, none in | ≥ 14 d since last did |
| `preview_done_not_paid` | every step of the preview module completed, no purchase | ≥ 3 d since the last of them |

`gone` and `stuck` exclude the owner's own account and users with `role: teacher`.

---

## 5. Tasks, in order, each with its red test first

1. **Census** — `lib/tasks/wp40_funnel_census.rake`: read-only; prints, per stage of §3, the
   count of users with evidence and the count of nulls where a stage should have a timestamp
   (e.g. completed steps with `completed_at IS NULL`), plus the `analytics_study_sessions`
   writer check (does a lesson view create one? read `steps_controller#show`). Test: the task
   writes nothing (`assert_no_changes` over every table it reads). The owner runs it in
   production (`-r job`) and pastes the output; §3's sources are confirmed or switched from it.
2. **`Admin::FunnelQuery`** — all-time and windowed (`since:`), returns the ten counts and
   per-stage conversion. Fixtures: one user per stage boundary, both providers, both locales.
   Red: every stage count, the window, and "a user at stage 7 counts in 1–7 and not in 8".
3. **`Admin::SignupsQuery`** — 12 weekly buckets ending this week (the owner's timezone from
   `Core::User#timezone`, else UTC), split by provider and locale. Red: bucket edges (a signup
   at Sunday 23:59 and Monday 00:00 in that timezone), empty weeks present as zeros.
4. **`Admin::SegmentsQuery`** — every §4 segment with `since`, count and page; thresholds from
   the constant table. Red: each segment has a positive and a negative user **at the boundary**
   (24 h − 1 min vs 24 h), and the owner/teacher exclusions.
5. **`Admin::UserTimelineQuery`** and **"last did" / "stage"** for the index (`UserIndexQuery`
   gains the two columns and the `segment`/`stage` filters, keeping its tests). Red: the
   timeline's order, pagination, the AI daily subtotal, and that a locked module's content is
   not described beyond the step title the student already owns.
6. **Screens** — §2.1–2.3, controller tests (owner sees the figures; teacher gets 403; one audit
   row per request, unchanged), view tests for the SVG helper (12 bars; current week marked),
   both locales.
7. **Digest** — job + mailer + `recurring.yml`. Red: no owner → no mail + a warn; owner → one
   mail with the counts; the schedule entry exists in production only.
8. **Indexes** — `EXPLAIN` the new queries on a seeded database of 2,000 users; add a migration
   for any sequential scan on `route_steps.completed_at`, `core_sessions.(user_id, created_at)`,
   `learning_routes.generated_at`, `assessment_results.(user_id, passed)` if the plans need them.
   Record the before/after plans in the handoff.

---

## 6. Out of scope
Charts libraries; cohort retention curves beyond "came back"; exports (CSV is WP-40b if asked);
sending email to students from the panel; the teacher role; the `analytics_*` tables' own
design; anything that writes to a student's data.

---

## 7. Constraints that do not move
`env -u RAILS_MASTER_KEY bin/rails test` for every run; never commit `config/master.key`,
`config/credentials/*.key`, `.claude/`, `node_modules` (no `git add -A`); never print an email
address or any secret into a log line; the panel shows personal data to the owner only, and the
digest goes to the owner's address only; no API key is ever printed or pasted. Every change
ships with the test that catches its class, seen red first. Three suites green before each
checkpoint. The agent reports; the owner and I verify against the branch before believing it.

---

## 8. Checkpoints
1. **Census + queries** (tasks 1–5): the owner has run the census in production and pasted it;
   §3's sources are settled in the spec; every query has its tests. I run the queries against a
   seeded database myself.
2. **Screens + digest** (tasks 6–8): screenshots of the dashboard, the index with a segment
   filter, and a user timeline, light and dark, at 1440 and 390, in `tmp/wp40/renders/`; the
   digest's text and HTML rendered to files there too.
3. **Review**: a fresh reviewer over the branch, its fixes, `WP40_HANDOFF.md` (what each number
   means and where it comes from, the census output, the plans from task 8, what the tests do
   not catch).

Acceptance is the owner's, in production: he opens `/admin`, sees this week's signups, the
funnel, and the people who are stuck — and can say who he is going to write to today.
