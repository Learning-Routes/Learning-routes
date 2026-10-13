# WP-32 — The gate has a side door

**Written:** 2026-09-07 · **Branch:** `wp32-gate-side-door`, base `main` @ `0b72e98`
**Tree clean. Not deployed. Nothing run against production.**

Seven commits. Five for the brief's four sections, in the order it asked, with one deliberate
departure noted in §1/§3 below; two more from a verification pass that drove every path against a
running server and a browser rather than trusting the suite. `AdvancementPolicy`'s three outcomes
are untouched.

**That pass found two things the suite could not, and they are the most useful part of this
document — see "What running it found" below.**

---

## The class

**A step advances only through a decision that read the gate.**

WP-29 §3 closed `results#submit`. `steps#complete` is a different door into the same room, and it
gated on two things an assessment step never has: `outstanding_blocks_for` (empty, because
`SectionResolver` finds no `AiContent` for an exam step) and `requires_quiz?` (lesson/exercise
only). Then `tracker.complete_step!` ran unconditionally. The header's "Completar paso" is
rendered by `layouts/learning`, which `AssessmentsController` and `ResultsController` both use and
both set `@step` in — so the button sat on the exam page and on the results page, one click from a
0%.

`test/integration/learning_routes_engine/step_completion_gate_test.rb` is the class test. For
**each** content type it builds a step whose gate is not satisfied, posts `complete` in all three
formats, and asserts the step is still `in_progress`, that no `XpTransaction` was written, and
that the response says why. Then it satisfies the gate and asserts the step completes exactly
once, with `advanced_without_passing` only when the reason is not `passed`.

| type | what its gate is | how the test leaves it unsatisfied |
|---|---|---|
| `lesson` | interactive blocks **and** the step quiz | an unanswered gating `check` |
| `exercise` | the step quiz | a quiz with no passing result |
| `assessment` | the exam, via `AdvancementPolicy` | a scored result that did not pass |
| `review` | interactive blocks only | an unanswered gating `check` |

### Red, before anything was fixed

```
13 runs, 92 assertions, 7 failures, 0 errors

test_an_assessment_failed_once_refuses_in_all_three_formats
  assessment/json: the gate was not consulted — the step completed.
  --- expected: "in_progress"   +++ actual: "completed"

test_an_assessment_never_attempted_refuses_in_all_three_formats
  assessment/json: the gate was not consulted — the step completed.
  --- expected: "in_progress"   +++ actual: "completed"

test_a_released_assessment_completes_and_records_advanced_without_passing
  Expected: true   Actual: nil

test_an_unanswerable_assessment_completes_and_records_advanced_without_passing
  Expected: true   Actual: nil

test_posting_complete_twice_on_a_lesson_writes_one_lesson_XP_transaction
  replaying complete re-awarded lesson XP on an already-completed step.
  Expected: 1   Actual: 2

test_a_lesson_completes_once_its_gating_block_is_answered_and_its_quiz_is_passed
  a replayed completion awarded XP a second time.
  Expected: 1   Actual: 2

test_lesson_XP_is_not_decided_by_numbers_the_client_sends
  the client claimed a perfect quiz and was paid for it; there is no such persisted result.
  Expected: "lesson_complete"   Actual: "lesson_perfect"
```

Green after: **13 runs, 128 assertions, 0F 0E.**

**§1 and §3 ship in one commit, and that is not laziness.** They both live in `steps#complete`,
and the class test's "completes exactly once" clause *is* §3's defect — I tried landing §1 alone
and the file went red (`a replayed completion awarded XP a second time. Expected: 1, Actual: 2`).
Splitting them would have meant committing a red tree.

---

## §1 — the side door

`steps#complete` now asks `Assessments::StepAdvancement.decide_for` for assessment steps, which
resolves the latest **scored** result (`where.not(score: nil).order(:created_at).last`) and hands
it to `AdvancementPolicy`. No result, or `blocked?`, refuses in the same three formats as the two
gates above it — `:json` 422 with a reason, `:turbo_stream` (`show_assessment_gate`), `:html`
redirect with a notice — and names which of the two things is missing:

```
learning_engine.assessment.gate.assessment_required    no scored attempt at all
learning_engine.assessment.gate.assessment_not_passed  an attempt that did not earn a pass
```

`advance?` completes it and records `advanced_without_passing` / `advanced_reason` /
`advanced_at` through `StepAdvancement.record!`. **`results#submit` calls the same helper** —
those three keys used to be written inline in `record_bookkeeping`, and two copies would have
drifted the first time one of them learned a fourth key.

The layout no longer renders the button for `content_type_assessment?` at all. That is not the
fix — the POST was the hole — but an exam step's verbs are Start, Submit and Retake, and a header
button saying "mark this done" is not one of them.

### `review` steps

`requires_quiz?` now carries the answer the brief asked for: **a review step completes freely, by
design.** It has no answer key — a memory-strength ring, a concept map, and a self-reported "how
well do you remember this?" that feeds FSRS. There is nothing a student can get wrong, and
inventing a pass mark for a self-report would make FSRS worse. The interactive-block gate still
applies to review steps, which is why `review` has a real unsatisfied gate in the class test
rather than an exemption.

## §2 — the retake

`steps#show` used `find_by(user:, assessment:)` — no score filter, no order, so an arbitrary row.
`steps/_assessment.html.erb` showed the score ring and "Ver resultados" whenever that row had a
score, and the only Start button was in the `else` branch. `results/show.html.erb` linked to the
route or the next step and nothing else. So once a scored result was the row `find_by` returned,
there was no Start anywhere, `failed_attempts` could never reach `RELEASE_AFTER`, and the valve
WP-29 built was unreachable. Closing §1's door without opening this one would have trapped the
student for good.

Three lookups now live on `AssessmentResult`, because three callers had three different answers to
"which attempt are we talking about":

```ruby
open_attempt_for    the attempt still open, or nil
latest_scored_for   the last attempt that was actually scored
current_for         open_attempt_for || latest_scored_for   # what to SHOW
```

The step page and the exam intro page both use `current_for`, so they cannot show a student
different histories. The step page renders the score card **and** a retake whenever the step is
not completed, with the attempts left when the decision is still blocking; a completed step offers
nothing.

The results page asks the policy once in `show` and says what the flash said. `keep_going` /
`need_score` is now reached only for `blocked`; `released` and `unanswerable` get their own copy
in both locales, and the retake sits next to the blocked copy.

### Red

```
9 runs, 20 assertions, 7 failures

a student who failed once had no Start button anywhere and could never reach RELEASE_AFTER
the page picked an arbitrary row instead of the attempt in progress
the latest scored attempt is not the one shown when nothing is open
the score card is not shown next to the retake
the flash said try again and the page offered no way to
the flash said the student may continue and the page contradicted it
the exam cannot be passed by anyone and the page still demanded a pass mark
```

Green after: **9 runs, 26 assertions, 0F 0E.**

The layout test is separate (`complete_step_button_absent_test.rb`) and was red on four pages —
the step page, the exam intro, the exam itself and the results page — with `Expected: 0, Actual: 1`
on each.

## §3 — the replay that paid twice, from the client's numbers

`complete_step!` returns early for a completed step, but `award_lesson_xp!` ran anyway and
`XpService.award` has no dedupe on `source_id`. The award is now skipped when the step was already
completed. And `all_correct` came from `params[:quiz_results]` — a `correct` and a `total` the
browser supplied, compared to each other — so anyone could post `{correct: 1, total: 1}` and be
paid the perfect-lesson rate. It reads the persisted step-quiz result instead, and
`interactive_lesson_controller.js` no longer sends numbers nothing uses. (Its own counters stay:
they drive the celebration screen, which is the client's business.)

## §4 — the two races

**One open attempt per exam.** `assessments#start` did `find_by(score: nil)` then `create!` with
nothing in the database to stop the second insert; `take` used an unordered `find_by` while
`answers#create` ordered by `created_at`. Two open attempts meant answers on one row and `submit`
scoring the other. A partial unique index on `(user_id, assessment_id) WHERE score IS NULL` is the
invariant; scored attempts stay outside it so retakes keep working. `start` goes through
`open_attempt_for!` (`create_or_find_by!`), and `take` and `answers#create` share
`open_attempt_for`.

`db/migrate/20260907000001_one_open_assessment_attempt.rb` merges rows the race already made
rather than dropping them: keeper is the open attempt with the most answers, every answer on a
losing attempt moves across unless the keeper already answered that question, and what is left
(unscored, unsubmitted rows nobody was told about) is deleted. **Preview it before deploying:**

```sql
SELECT user_id, assessment_id, COUNT(*)
FROM assessments_assessment_results
WHERE score IS NULL
GROUP BY 1, 2 HAVING COUNT(*) > 1;
```

Red: `the database refuses a second open attempt — ActiveRecord::RecordNotUnique expected but
nothing was raised` (4 runs, 9 assertions, 1 failure).

**The duplicate block drop.** `BlockAttemptRecorder` used `find_or_create_by!`, now
`create_or_find_by!` with an explicit `rescue ActiveRecord::RecordInvalid` → `find_by!`.

### Two corrections to AUDIT_2026-09-07 §2.7, both run rather than read

- **It was not a 500.** Rails maps `ActiveRecord::RecordInvalid` to 422, and `RecordNotUnique`
  never surfaced at all: Rails 7.1 taught `find_or_create_by` to retry its `find_by` on it, and
  this app is on 8.1. I proved the DB path by holding a recorder lock-blocked on the unique index
  with an uncommitted insert and then committing — it returned the existing row cleanly on `main`.
  **So this part of §4 is hardening, not a fix for an observed live failure**, and the handoff
  should not be read as claiming otherwise. What remains real is the `RecordInvalid` window (the
  caller's `find_by` misses, the other caller commits, the uniqueness validation raises), and a
  422 there is still a submission silently lost, because `block_submission.js` returns `null` on
  every non-ok response.
- **The remaining window cannot be scheduled.** It is microseconds wide. `create_or_find_by!`
  always attempts the insert, which turns it into *every repeat submission* — so the guarantee is
  now pinned by a plain integration test rather than by a race nobody can reproduce. I showed that
  guard load-bearing by deleting the rescue: `two drops on the same block answer 2xx and leave one
  row → Expected response to be a <2XX: success>, but was a <422>`.

This is the one place I did not simply follow the brief's letter and then stopped: the brief
prescribed `create_or_find_by!` + `rescue RecordInvalid`, which is exactly what shipped. I
questioned it (it costs an exception on every repeat drop, where `find_or_create_by!` costs one
SELECT) and concluded the brief was right — the exception is microseconds on an interactive path,
and it buys a guarantee that does not depend on Rails internals.

---

## One existing test changed, setup only

`engines/assessments/test/models/assessments/user_answer_test.rb#test_a_different_attempt_may_answer_the_same_question`
opened its retake while the first attempt was still open. The index makes that state impossible,
so the test errored with `RecordNotUnique`. **I changed its setup to score the first attempt
first, which is what `results#submit` does in production. The assertion is untouched** — an answer
belongs to an ATTEMPT, so a second attempt may answer the same question. This was the only place
in the codebase that built two open attempts; `step_quizzes#submit`, the only other creator of an
`AssessmentResult`, always writes a score.

I caught this because the combined suite went from 3F 1E to **3F 2E**, not because I looked for
it. The first "after" table I nearly wrote had that extra error in it.

---

## What running it found

Two defects that the suite passes over. Both were found by driving the app, not by reading it.

### 1. Every lesson and exercise completion was a 500 in development

`steps#complete` line 51 asks `@step.quiz_passed_by?`, which walks the `step_quiz` has_one.
`set_route_and_step` loaded the step with no `includes`, so that traversal is a lazy load on a
strict_loading record. Pre-existing — `git diff 0b72e98..HEAD` touches neither line — and found
only because I POSTed `complete` at a real server.

**Why the suite cannot see it, which is the part worth keeping.** `config/environments/test.rb`
sets `strict_loading_mode = :all` and its comment says that is the stricter choice, kept
deliberately so the suite gates this class of bug. For this association it is the **looser** one.
Same code, both ways:

```
development / n_plus_one_only  ->  RAISED
test        / all              ->  NO violation
```

Development and production both run `:n_plus_one_only`. Production sets the violation to `:log`,
so there it was never a crash — it was a silent N+1 on the busiest write path in the app, which
is why nobody saw it. `StepQuizEagerLoadingTest` therefore pins `:n_plus_one_only` for the
duration of the request instead of trusting the suite's mode. **The `:all` assumption in
`test.rb` is worth revisiting on its own; I did not change it.**

### 2. The migration's merge had never run on anything

`up` adds an index and merges the rows the race already made. Running the migration proved only
the first half: development had no duplicates, and production may have none either — in which
case the merge still runs unattended, on real answers, the one time it matters.
`test/migrations/one_open_assessment_attempt_test.rb` now covers it, and I also drove it by hand:
rolled back, seeded two open attempts with overlapping and unique answers plus a third exam with
three answerless duplicates and one scored attempt, migrated, and got one open attempt holding
all three questions with the scored attempt untouched. `db/structure.sql` is byte-identical after
`down` then `up`.

## Verification

| Suite | Before (`0b72e98`) | After |
|---|---|---|
| Main (`bin/rails test`) | 638 runs, 2504 assertions, 0F 0E | **679 runs, 2698 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 50 runs, 370 assertions, 0F 0E | **50 runs, 370 assertions, 0F 0E** |
| Combined (`bin/rails test test engines/*/test`) | 1032 runs, 4095 assertions, **3F 1E** | **1073 runs, 4289 assertions, 3F 1E** |
| RuboCop | clean, 563 files | **clean, 572 files** |

Three runs of each, identical, one suite at a time. The **before** column is my own run against
`0b72e98`, not copied from `WP24S2_HANDOFF.md` — and my first attempt at it was contaminated
(combined runs 2 and 3 picked up test files I had written while the runs were in flight, reporting
1045 and 1059 runs). I moved the new files aside and re-ran all three cleanly; the numbers above
are those.

The four combined failures are the known engine ones, the same four as the baseline, in all three
runs: `GapAnalysisJobTest`, `ReinforcementJobTest`, `RouteGenerationJobTest`, `RouteGeneratorTest`.
**I did not touch them.**

New tests: **41.**

| file | tests |
|---|---|
| `test/integration/learning_routes_engine/step_completion_gate_test.rb` | 13 |
| `test/integration/assessments/retake_is_reachable_test.rb` | 9 |
| `test/integration/assessments/complete_step_button_absent_test.rb` | 5 |
| `test/controllers/assessments/open_attempt_race_test.rb` | 4 |
| `test/controllers/learning_routes_engine/block_attempt_identity_race_test.rb` | 2 |
| `test/migrations/one_open_assessment_attempt_test.rb` | 5 |
| `test/controllers/learning_routes_engine/step_quiz_eager_loading_test.rb` | 3 |

### Against a running server, over HTTP

Signed in with a cookie jar and a real CSRF token, then POSTed `complete` at the exam step that
had one scored, failed attempt — the exact state the side door used to walk past:

```
JSON          422  {"assessment_required":true,"reason":"assessment_not_passed",
                    "message":"Todavía no has superado esta evaluación, …"}
turbo_stream  200  a real <turbo-stream> whose <template> holds an element, not escaped markup
HTML          302  -> back to the step, flash rendered on the page
```

Five refused POSTs across the two runs: step stayed `in_progress`, follower stayed `locked`, and
`xp_transactions` stayed empty. Then three scored failures, and the same POST returned 200 and
completed the step with `advanced_reason: released`.

§3 over HTTP on a lesson whose block was answered and whose step quiz was passed **at 80, not
100**, with the request claiming `{"quiz_results":{"correct":9,"total":9}}` three times:

```
complete 1: 200   complete 2: 200   complete 3: 200
xp: daily_first_lesson x1, lesson_complete x1, step_complete x1
```

`lesson_complete` once, not three times, and `lesson_complete` rather than `lesson_perfect` —
the client's numbers were ignored in favour of the persisted score.

### In a browser, against the development server

Seeded a user, route, exam step and follower step in the **development** database, and **deleted
them at the end** (user, profile, route, steps, results, answers, knowledge gaps, reinforcement
routes, XP — verified to zero).

- The header shows **no "Completar paso"** on the exam step page, the exam page, or the results
  page. It is still there on a lesson step (`form[action$="/complete"]` count: 0 on the exam
  step, 1 on the lesson).
- Fired the POST the button used to make, from the page's own JS with its CSRF token — what a
  stale tab or a curious student does now that the button is gone. 422 with a reason;
  `Turbo.renderStreamMessage` on the turbo_stream body produced a **visible** element reading the
  refusal, and `document.body.innerText` contained no `&lt;` and no raw `<p `. (Worth noting
  because that escaped-markup failure is exactly what WP-35 §2 reports for `LessonsController`.)
- Replayed `complete` on a lesson three times from the browser: `xp_gained` 60, then 0, then 0.
- Console clean on the assessment step page: no errors, no warnings, no failed requests.
- Failed the exam (0%). Step stayed `in_progress`, the follower stayed `locked`. The results page
  offered **"Intentarlo otra vez"** with *"2 intentos más y te dejaremos seguir de todos modos."*
- Back on the step page: the score card (0.0%, "No aprobado (mínimo: 70.0%)"), "Ver resultados
  detallados", **and** "Volver a intentar el examen" with the attempts left. Before this package
  that page had the ring and nothing else.
- Failed twice more. Copy went singular at the second (*"1 intento más…"*), and the third gave the
  release: the flash said the student may continue, and **the page agreed** — "Puedes continuar",
  no "Necesitas 70%", no retake button.
- Database after: step `status: completed`, `advanced_without_passing: true`,
  `advanced_reason: "released"`, `advanced_at` set; three scored results, all `passed: false`;
  follower step unlocked.

(`AdaptiveDifficulty` inserted three reinforcement steps on the first failure, one of them
immediately available — that is audit §2.9, not in this package.)

---

## The production check for the owner

**Read-only. Built against `db/structure.sql` and run against a real database as a positive
control** — it returned exactly the released step above, and nothing once that was deleted.

```sql
-- Every completed assessment step whose owner has no passing result.
SELECT s.id                                      AS step_id,
       s.title,
       lr.id                                     AS route_id,
       lp.user_id,
       s.completed_at,
       s.metadata ->> 'advanced_reason'          AS advanced_reason,
       s.metadata ->> 'advanced_without_passing' AS advanced_without_passing,
       COUNT(r.id) FILTER (WHERE r.passed)             AS passing_attempts,
       COUNT(r.id) FILTER (WHERE r.score IS NOT NULL)  AS scored_attempts
FROM learning_routes_engine_route_steps s
JOIN learning_routes_engine_learning_routes lr   ON lr.id = s.learning_route_id
JOIN learning_routes_engine_learning_profiles lp ON lp.id = lr.learning_profile_id
JOIN assessments_assessments a
  ON a.route_step_id = s.id
 AND a.assessment_type <> 4                       -- 4 = step_quiz, not an exam
LEFT JOIN assessments_assessment_results r
  ON r.assessment_id = a.id
 AND r.user_id = lp.user_id
WHERE s.content_type = 2                          -- assessment
  AND s.status = 3                                -- completed
GROUP BY s.id, s.title, lr.id, lp.user_id, s.completed_at, s.metadata
HAVING COUNT(r.id) FILTER (WHERE r.passed) = 0
ORDER BY s.completed_at DESC NULLS LAST;
```

**How to read it.** A row with `advanced_reason` = `released` or `unanswerable` is legitimate: the
valve did its job and said so. A row with `advanced_reason` **NULL** is a step that completed
without any decision having been made — the side door. Those are the ones worth counting, and each
one is a student who was moved past an exam they never passed and whose record does not say so.

```
kamal app exec 'bin/rails runner "..."'   # or psql, read-only either way
```

I have no production access from this environment, so **the number is unknown to me.** I did not
guess it and did not write a repair task: what to do about those rows (leave them, or reset the
step) is the owner's call, and it needs the count first.

---

## What I did not do

- **Nothing was run against production**, and nothing was deployed. The migration has not run
  anywhere but development. Run the duplicate-preview query in §4 before deploying it.
- **I did not count anything in production**, including the check above.
- **I did not touch `AdvancementPolicy`.** Its three outcomes are the contract this package gates
  on.
- **Not in this package, as instructed:** the assessment-generation claim and the `difficulty`
  string (WP-34), answer-key integrity (WP-31), the reparse task (WP-33).
- **`results#submit` was not given the shared open-attempt lookup**, unlike `take` and
  `answers#create`. It is addressed by result id from the form and never looks an attempt up; the
  partial unique index is what now guarantees it and the other two mean the same row. Forcing a
  call there would have been ceremony.
- **I did not fix the `need_score` formatting.** The flash says "Necesitas 70%" and the results
  page says "Necesitas 70.0%", because the page interpolates `passing_score` raw while
  `advancement_notice` trims the decimal. Cosmetic, pre-existing, and touching the copy while
  rewriting which copy appears would have muddied the diff.
- **I did not touch audit §2.9** (reinforcement steps 2 and 3 with empty `prerequisites`), which I
  watched happen in the browser: one failure inserted three reinforcement steps and made one
  immediately available. It is real and it is not in this package.
- **I did not narrow the client's swallowing of refusals.** `block_submission.js` still returns
  `null` on every non-ok response, which is why the 422 in §4 would be invisible. That is audit
  §4.2 and belongs to the WP-23 extension.
- **I did not change `config/environments/test.rb`.** Its `strict_loading_mode = :all` is looser
  than the `:n_plus_one_only` that development and production run, at least for a scoped
  `has_one`, and its comment claims the opposite. Changing it would light up unrelated call sites
  across the suite and belongs in its own package; `StepQuizEagerLoadingTest` pins the deployed
  mode for the two actions this package touches, and nothing else.
- **I did not give the turbo_stream refusals a non-2xx status.** All three gates in
  `steps#complete` answer turbo_stream with 200, which is what the block gate already did and what
  the brief asked me to match. WP-35 §2's class is "failure responses carry the right status in
  every format" — that sweep should take all three at once rather than this package leaving them
  inconsistent with each other.
- **CI is still red** since WP-17 from `scan_ruby` (brakeman exits 5 on the known `permit!`
  warning) and `scan_js` (6 DOMPurify/Mermaid warnings). While it stays red the auto-deploy does
  not fire.
- **I still owe the prompt investigation** from several packages ago.
