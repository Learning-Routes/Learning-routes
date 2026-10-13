# WP-32 — The gate has a side door

Branch: `wp32-gate-side-door`, off `main` at `0b72e98` or later.

WP-29 §3 made failing an exam stop completing the step — through `results#submit`. The audit of
7 September (`AUDIT_2026-09-07.md`, §2) found that the same step completes through a different
door, that a student who fails once cannot try again, and two smaller holes in the same class.
This package closes the class: **a step advances only through a decision that read the gate.**

House rules: bugs before features; every fix ships with the test that prevents its whole class,
shown red first; every claim in your handoff is something you ran. English throughout. Do not
touch `AdvancementPolicy`'s three outcomes — they are right; the problem is who else can complete
a step without asking it.

---

## §1 — The header's "Completar paso" completes an assessment step without passing

`app/views/layouts/learning.html.erb:83-89` renders the button for every `@step && !@step.completed?`.
`Assessments::AssessmentsController` and `Assessments::ResultsController` use `layout "learning"`
(`:3`) and set `@step = @assessment.route_step` (`assessments_controller.rb:12,52`,
`results_controller.rb:11`), so the button is on the exam page and the results page.

`LearningRoutesEngine::StepsController#complete` (`steps_controller.rb:27-73`) gates on two
things an assessment step never has: `outstanding_blocks_for` is empty because
`SectionResolver#lesson_content` finds no `AiContent` for it (`section_resolver.rb:63-67`), and
`requires_quiz?` is `content_type_lesson? || content_type_exercise?` (`route_step.rb:110-112`).
Then `tracker.complete_step!(@step, …)` at `:73`, unconditionally.

Score 0% → policy says `blocked` → header offers "Completar paso" → one click → completed, next
step unlocked, no `advanced_without_passing` on the step.

### What to do

In `steps#complete`, before the tracker: if `@step.content_type_assessment?`, look up the latest
**scored** result for this user and assessment (`where.not(score: nil).order(:created_at).last`)
and ask `Assessments::AdvancementPolicy.new(result:).decide`. No result, or `blocked?` → refuse
with the same three formats the block gate uses (`:json` 422 with a reason, `:turbo_stream`,
`:html` redirect with a notice), naming what is missing. `advance?` → complete, and record
`advanced_without_passing`/`advanced_reason` exactly as `results_controller.rb:144-150` does when
the reason is not `passed` — one helper, called from both places, so the two cannot drift.

In the layout, do not render the button for assessment steps at all: the exam page has its own
verbs. Do not "fix" this by hiding the button alone — the POST is the hole, the button is how a
student finds it.

Check `review` steps while you are there: `requires_quiz?` is false for them too. If a review step
is meant to complete freely, say so in a comment on `requires_quiz?`; if not, gate it.

## §2 — After one failed attempt there is no way to retake

`steps_controller.rb:343-345`:

```ruby
@existing_result = Assessments::AssessmentResult.find_by(user: current_user, assessment: @assessment) if @assessment
```

No `score` filter, no order: an arbitrary row. `steps/_assessment.html.erb:17-76` shows the score
ring and "Ver resultados" when `@existing_result&.score.present?`; the only Start button is in the
`else` branch (`:72`). `results/show.html.erb:67-72` links only to the route or the next step. So
once a scored result exists and is the one `find_by` returns, there is no Start anywhere:
`failed_attempts` can never reach `RELEASE_AFTER`, and the valve WP-29 built is unreachable. The
4 September live test could start only because `find_by` happened to return an open attempt.

### What to do

Resolve the result deterministically: an open attempt (`score: nil`, latest) if there is one,
else the latest scored one. Render the score card **and** a Start button labelled as a retake
whenever `!@step.completed?`; when the step is completed, no Start. On the results page, when the
decision was `blocked`, offer the retake there too, with the attempts left
(`decision.attempts_left`) — the flash already says it; the page should not contradict it. The
results page's `keep_going`/`need_score` copy must not appear when the decision was `released` or
`unanswerable` (the flash says the student advanced; the page must agree).

## §3 — Replaying `POST complete` awards lesson XP again, from numbers the client sends

`steps_controller.rb:73-78`: `complete_step!` returns early for a completed step
(`route_progress_tracker.rb:17`) but `award_lesson_xp!` (`:401-413`) still runs, and `all_correct`
is computed from `params[:quiz_results]`. `XpService.award` (`xp_service.rb:16-30`) has no dedupe
on `source_id`.

### What to do

Skip the lesson award when the step was already completed (have `complete_step!` say whether it
completed anything, or check `completed?` before). Derive `all_correct` from the persisted
step-quiz result, not from params, and drop `quiz_results` from the accepted parameters.

## §4 — Two races in the same class, one of them a 500

- `assessments_controller.rb:26-27` (`start`): `find_by(…, score: nil)` then `create!`; `take`
  (`:48`) picks an unordered `find_by` while `answers#create` picks `.order(:created_at).last`.
  Two concurrent starts → two open attempts → answers on one, submit scores the other → 0 % and
  a failed attempt recorded. Add a partial unique index
  (`(user_id, assessment_id) WHERE score IS NULL`), use `create_or_find_by!`, and give `take`,
  `answers#create` and `results#submit` one shared "current open attempt" method.
- `block_attempt_recorder.rb:21` `BlockAttempt.find_or_create_by!(identity)` under
  `validates :section_index, uniqueness: …` (`block_attempt.rb:29`). The validation raises
  `RecordInvalid` before the unique index can raise `RecordNotUnique`, and nothing rescues either:
  the second of two fast drops on a drag-drop board is a 500 — WP-28's snapshot trap, again.
  `create_or_find_by!` plus `rescue ActiveRecord::RecordInvalid` → `find_by!`.

---

## The test that prevents the class

The class is **"a step advances without the gate being consulted."** Write
`test/integration/learning_routes_engine/step_completion_gate_test.rb`: for **each**
`content_type` (`lesson`, `exercise`, `assessment`, `review`), build a step whose gate is not
satisfied — outstanding block, unpassed quiz, failed-only result, whatever that type gates on —
`POST complete` in all three formats, and assert the step is still `in_progress`, no
`XpTransaction` was written, and the response says why. Then satisfy the gate and assert it
completes exactly once, with `advanced_without_passing` only when the reason is not `passed`.
The assessment case must fail today with the step completed. Paste that red run in the handoff.

Also:

- A view test: an assessment step with a scored-failed result and `!completed?` renders a form to
  `start_assessment_path`; a completed one does not.
- A results-page test: `released`/`unanswerable` decisions render no "you need N %" copy.
- `POST complete` twice on a lesson → one `XpTransaction`.
- Two threads on `start` → one open result (the WP-19 concurrency harness pattern).
- Two concurrent block attempts for one identity → 2xx, one row.
- The layout test: no `complete_route_step_path` form on an assessment step's page.

## Order

1. §1 with the class test red first.
2. §2 (it is what the student sees once §1 closes the door).
3. §3, §4.

## Verification

Before and after, three runs each: main, browser, combined with engines — the table as in
`WP24S2_HANDOFF.md`, with the **before** column taken from your own run, not copied. RuboCop
clean. In a browser against dev: fail an exam, see the retake, fail twice more, see the release
notice and the step advance with `advanced_reason: released`; confirm the header shows no
"Completar paso" on exam and results pages.

Write `WP32_HANDOFF.md`: what changed, the red-then-green output of every new test, the
production check the owner should make (does any completed assessment step in production lack a
passing result? — a read-only SQL, run against `structure.sql`), and what you did not do.

## Not in this package

The assessment generation claim and the `difficulty` string (WP-34). Answer-key integrity
(WP-31). Anything in `AdvancementPolicy`. The reparse task (WP-33).
