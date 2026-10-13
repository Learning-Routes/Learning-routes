# WP-40 Owner's Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` answers who joins, how far each person gets, and who is stuck today. It adds
a funnel, segments, a per-user timeline and a weekly digest to the existing owner-only panel.

**Architecture:** Raw-SQL query objects under `app/queries/admin/` that return `Data.define`
results. One module, `Admin::Stages`, holds a correlated SQL expression per stage, shared by the
funnel, the index and the timeline. Screens are ERB, styled by `admin.css` only, with inline SVG
from one helper. The digest is a Solid Queue recurring job and an `AiOrchestrator::AdminMailer`
method.

**Tech Stack:** Rails 8.1, PostgreSQL (`db/structure.sql`), Minitest, Solid Queue.

**Spec:** `docs/superpowers/specs/2026-10-09-wp40-owner-panel-design.md` and the brief
`PROMPT_31_WP40_THE_OWNERS_PANEL_WHO_JOINS_WHAT_THEY_DO.md`.

## Global Constraints

- `env -u RAILS_MASTER_KEY bin/rails test` for every run, one suite at a time (app, then
  `bin/rails test engines/*/test`, then `bin/rails test:system`).
- Never commit `config/master.key`, `config/credentials/*.key`, `.claude/`, `node_modules`. No
  `git add -A`; add files by name.
- Never print an email address or a secret into a log line or a task's output.
- Personal data is shown to the owner only. The digest goes to the owner's address only.
- Every change ships with the test that catches its class, seen red first.
- No new gem, no JS chart library, `admin.css` is the only stylesheet, `strict_loading` as
  configured.
- The admin dashboard never says `purchase|revenue|profit|fee|quote|payment` (R8).
- Read-only: nothing in this package writes to a student's data.

## Review Focus

1. **A user with no profile row** (registered, never onboarded). Every stage subquery must
   return NULL, never raise or drop the user from the funnel. Covered by Task 2's
   "registered only" fixture.
2. **The owner's timezone near a DST change.** The week buckets must still have 7-day edges at
   local Monday 00:00. Covered by Task 3's bucket-edge test, run in `America/Mexico_City`
   (which no longer observes DST) and `America/New_York`.
3. **A user whose only route is a clone.** They are "generated" (R6), but the timeline says
   "cloned from a shared route". Covered by Task 5.
4. **A deleted user between the count and the page** (pagination over a moving set). The page
   must not raise. Covered by Task 4's paging test, which clamps to the last page.
5. **Spanish owner.** Every new label exists in `es`. Covered by Task 6's locale-parity test,
   which compares the key sets under `admin:` in `en` and `es`.

---

## Checkpoint 1: census and queries

### Task 1: Funnel census (read-only rake task)

**Files:**
- Create: `lib/tasks/wp40_funnel_census.rake`
- Test: `test/tasks/wp40_funnel_census_test.rb`

**Interfaces:**
- Produces: `bin/rails wp40:funnel_census`, which prints counts only (no ids, no emails, no
  names). The owner runs it with `bin/kamal app exec -r job "bin/rails wp40:funnel_census"`.

- [ ] **Step 1: Write the failing test.** It builds one user per stage through stage 10, a linked
  Google account, a clone, a refunded and a test-mode purchase, an open, a failed and a passed
  exam, and a step quiz. It then asserts:
  - (a) the printed counts per stage and per split;
  - (b) the task issues no `INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP` statement, by
    subscribing to `sql.active_record` around `invoke`;
  - (c) `assert_no_changes` on `COUNT(*)` and `MAX(updated_at)` of every table it reads;
  - (d) the output contains no `@` and no user's name.
- [ ] **Step 2: Run it and see it fail.** Expected: `Don't know how to build task 'wp40:funnel_census'`.
- [ ] **Step 3: Write the task.** It is `SELECT`s only, through
  `ActiveRecord::Base.connection.select_value` / `select_rows`. Sections:
  - owner and teacher account counts;
  - per stage: users with evidence, plus the nulls where a timestamp should exist (completed
    steps with `completed_at IS NULL`, completed routes with `generated_at IS NULL`, `paid` rows
    with `paid_at IS NULL`, flag without profile, profile without flag);
  - splits: provider, locale, linked accounts (R2), request status, `generation_status`, clones
    (R6), assessment type × passed/failed/open (R4), purchase state × `test_mode` (R3);
  - the study-session writer check: the oldest `started_at`, the number of steps
    `in_progress`/`completed` with no study session by that route's user, and the same count
    for steps first touched (`updated_at`) after the oldest `started_at`;
  - came back per source (R5), and the oldest `core_sessions.created_at` (shows the cleanup
    horizon).
- [ ] **Step 4: Run it and see it pass.** Run RuboCop on both files.
- [ ] **Step 5: Commit.** `git add lib/tasks/wp40_funnel_census.rake test/tasks/wp40_funnel_census_test.rb`

**Stop:** the owner runs it in production and pastes the output. Spec §3 is confirmed or amended
from it, and Tasks 2–5 below are expanded with code against the settled §3.

### Task 2: `Admin::Stages` and `Admin::FunnelQuery`

- Files: `app/queries/admin/stages.rb`, `app/queries/admin/funnel_query.rb`,
  `test/queries/admin/funnel_query_test.rb`.
- Red:
  - every stage's count with one user per stage boundary, both providers, both locales;
  - `since:` windows on registration;
  - "a user at stage 7 counts in 1–7 and not in 8";
  - out-of-order stages (paid before an exam);
  - the registered-only user (Review Focus 1);
  - a constant query count.

### Task 3: `Admin::SignupsQuery`

- Files: `app/queries/admin/signups_query.rb` and its test.
- Red:
  - Sunday 23:59 vs Monday 00:00 in the owner's zone (Review Focus 2);
  - 12 buckets, with empty weeks as zeros;
  - this week, last week and the total;
  - the provider and locale splits.

### Task 4: `Admin::Segments` and `Admin::SegmentsQuery`

- Files: `app/queries/admin/segments.rb`, `app/queries/admin/segments_query.rb` and its test.
- Red:
  - for each segment, a positive user at the threshold and a negative user at the threshold
    − 1 minute;
  - owner and teacher excluded from `gone` and `stuck`;
  - the `stuck` step's name;
  - five most recent, ordered by `since` desc;
  - paging (Review Focus 4).

### Task 5: `Admin::UserTimelineQuery`; index gains stage, last did, filters, sort

- Files: `app/queries/admin/user_timeline_query.rb` and its test;
  `app/queries/admin/user_index_query.rb` and its existing test, extended.
- Red:
  - newest-first order;
  - 50 per page;
  - the AI daily subtotal (one row per day);
  - sessions grouped per day after the first week;
  - a clone reads "cloned" (Review Focus 3);
  - a refund row;
  - a locked step's title not shown;
  - index `segment=`, `stage=`, `sort=last_did`;
  - the existing index tests unchanged and green.

## Checkpoint 2: screens, digest, indexes

### Task 6: Screens

- Dashboard sections from brief §2.1, the index chips and columns, the user page's "Where they
  are" line, the timeline and `mailto:`.
- `Admin::ChartsHelper#weekly_bars`: inline SVG with 12 `<rect>`s and the current week marked.
- Red:
  - the owner sees the figures;
  - a teacher gets 403;
  - one audit row per request;
  - R8's forbidden words;
  - `es` parity (Review Focus 5);
  - the SVG helper: 12 bars, one marked.

### Task 7: Weekly digest

- `AiOrchestrator::AdminMailer.owner` and `#weekly_digest` (text and HTML, owner's locale).
- `CostAlertJob` uses `.owner`, and its test stays green.
- `Admin::WeeklyDigestJob`.
- A `recurring.yml` production entry, `every monday at 7:10am UTC`.
- Red:
  - no owner: no mail, and a `warn`;
  - owner: one mail with the counts;
  - the entry is in `production` and not in `development`.

### Task 8: Indexes

- `EXPLAIN (ANALYZE, BUFFERS)` each new query on a seeded database of 2,000 users.
- A migration only for the sequential scans the brief names, if the plans show them.
- The before and after plans go into the handoff.

## Checkpoint 3: review

### Task 9: Review and handoff

- A fresh reviewer over `7396de2f..HEAD`, then the fixes, red first.
- `WP40_HANDOFF.md`:
  - each number's meaning and source;
  - the census output;
  - the plans from Task 8;
  - the R5 undercount caveat;
  - what the tests do not catch.
