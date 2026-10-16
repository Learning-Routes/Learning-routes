# WP-28 — The exam scores, then throws the answer away — and every retry costs money

Branch: `wp28-submit-side-effects`, off `main` (`02ff9c6`, WP-27 merged).

WP-27 worked. Answers save, the attempt is scored, the retake produces its own row. The console
now shows **one** error instead of a wall of them, and it is the last step of the flow.

The owner captured it and pulled the production log. No hypothesis needed — the server names it.

---

## §1 — The confirmed cause

```
POST /assessments/results/830eca21-…/submit
  controller: Assessments::ResultsController, action: submit, status: 422

ActiveRecord::RecordInvalid (La validación falló: Snapshot date ya está en uso):
  activerecord (8.1.3.1) lib/active_record/validations.rb:87:in `raise_validation_error'
  …
  activerecord (8.1.3.1) lib/active_record/relation.rb:297:in `block (2 levels) in create_or_find_by!'
```

`Analytics::ProgressSnapshot.take_snapshot!` calls `create_or_find_by!`. That method works by
attempting `create!` and rescuing **`ActiveRecord::RecordNotUnique`** — the *database's* error,
raised by the unique index. `idx_progress_snapshots_unique` on
`(user_id, learning_route_id, snapshot_date)` exists, so the intent was right.

But `progress_snapshot.rb:8` also declares:

```ruby
validates :snapshot_date, uniqueness: { scope: [:user_id, :learning_route_id] }
```

A model validation runs **before** the INSERT. So `create!` fails validation, raises
`RecordInvalid` — which `create_or_find_by!` does **not** rescue — and the request 422s. The
validation defeats the exact mechanism the method depends on.

**The second submit of the day on the same route always fails.** Every one, for every student.

### The fix

Remove the model-level uniqueness validation and keep the database index. That is what
`create_or_find_by!` is documented to require, and the index is the only guard that is actually
race-safe anyway — a model validation cannot prevent two concurrent inserts.

If you would rather keep a validation for form-level friendliness, then `take_snapshot!` must
stop using `create_or_find_by!` and handle the collision itself. Pick one and say which; do not
leave a validation and a method that cancel each other out.

---

## §2 — The severity the console could not show: every failed submit spends money

This is why §1 is not a one-line fix and stop.

The log line immediately above the 422, in both captured requests:

```
[ActiveJob] Enqueued LearningRoutesEngine::GapAnalysisJob … {:assessment_result_id=>"…"}
```

Read `submit` in order. The score commits inside `@result.with_lock`, and **the transaction ends
there**. Everything after runs outside it, with no transaction and no idempotency guard:

1. `StudySession … find_each(&:finish!)`
2. `Analytics::LearningMetric.record!` — a `create!`, no uniqueness scope
3. `LearningRoutesEngine::AdaptiveDifficulty#adjust!` — on a low score this **inserts
   reinforcement steps** (`adaptive_difficulty.rb:176`, `route_steps.create!`)
4. `GapAnalysisJob.perform_later` — **paid**. GapAnalyzer and, through it,
   ReinforcementGenerator both make `Orchestrate` calls
5. `tracker.complete_step!`
6. `ProgressSnapshot.take_snapshot!` ← **raises here**
7. `redirect_to` — never reached

So each failed submit has already recorded a metric, adjusted difficulty, possibly inserted
reinforcement steps, enqueued a paid AI job, and completed the step. Then it throws away the
response and shows the student nothing, so they start the exam again — and all of it fires
again. The two requests in the captured log are **four seconds apart**.

The owner has been retrying this all day.

### What to fix, beyond §1

`submit` performs seven side effects, none of them idempotent, after a state change that has
already committed. Fixing the snapshot stops today's bleeding; it does not make this action
safe to fail.

Two things it needs, and they are separate:

- **Order by cost.** The paid job is step 4 of 6. Anything that spends money, or that writes
  rows a retry will duplicate, belongs **after** everything that can fail cheaply. Move
  `take_snapshot!` and the other bookkeeping ahead of `GapAnalysisJob.perform_later`.
- **Guard the spend on the claim, not on the request.** The score commit is already the
  idempotency claim — `score.present?` is what makes a second submit return `:already_scored`.
  The paid job must be enqueued only by the request that actually **set** the score, and only
  once. Enqueue it from inside the same claim, or record on the result that it has been
  enqueued and check that.

Note the interaction with `already_scored`: if the failure had happened *before*
`complete_step!` instead of after it, the retry would return `:already_scored` and redirect —
and the step would stay incomplete forever, with no way to re-run the skipped work. Today's
ordering hides that; it is luck, not design. Say in the handoff whether you fixed that or only
the ordering.

---

## §3 — The student still sees nothing

A 422 with an exception body is not feedback. Whatever §1 and §2 settle, a submit that fails
must tell the student their answers were saved and scored, and offer them the result — because
by that point **they were**. Right now the one thing the app is certain about, it never says.

This is the fifth package in a row whose defect is the client not telling the student what the
server did. Copy the pattern from WP-25 §2 and WP-27 §3: distinct messages, both locales.

---

## The tests

**A. "The second submit of the day works."**

```ruby
# test/integration/assessments/submit_twice_in_one_day_test.rb
```

Submit an assessment, then submit a **second** assessment on the same route on the same day,
and assert both return a redirect and both results carry a score. This fails today with
`RecordInvalid`. It is §1 stated once.

**B. "A failed submit does not spend twice."** — the class test, and the one that matters.

Stub `ProgressSnapshot.take_snapshot!` to raise. Submit. Assert what was enqueued and what was
written. Then submit again and assert the paid job was **not** enqueued a second time and no
duplicate `LearningMetric` row exists. Today the first assertion fails.

The class is **"a non-idempotent side effect after a committed state change"**. If you can
sweep for other actions with the same shape — a commit followed by unguarded `perform_later` or
`create!` — report what you find, but only if the sweep is trustworthy. WP-26's lesson stands: a
sweep that cries wolf is worse than none.

---

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, report the intersection.
- Browser suite, same.
- Both new tests demonstrated red first, failure output pasted.
- **Count the damage before you fix it.** In `kamal console`, count `GapAnalysisJob` runs and
  `LearningMetric` rows for user `3d43fad7-6ec6-4faa-ac53-885d35f31aec` on this route today, and
  report the numbers. That is the bill this defect ran up, and the owner should see it.
- Then the owner submits an exam twice in one day on the live site. Nothing short of that
  closes it.
- Say what you did not do.

## Not in this package

WP-24 §2 (the scenario parser with no terminator) — still the highest-value bug after this.
WP-23. WP-20, Task 8, Task 9. The content-depth expansion is a product decision and waits on
`wp7-true-costs`.
