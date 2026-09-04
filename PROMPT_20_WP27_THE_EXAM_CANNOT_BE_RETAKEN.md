# WP-27 — The exam records nothing, and can never be retaken

Branch: `wp27-exam-answers`, off `main` after `wp26-exam-and-voice` is merged.

WP-26 worked: the exam opens at `/take`, questions render, options select, and the console is
clean — three warnings, zero errors. The blocker moved one layer deeper.

Reported 4 September: answers do not save, submitting scores 0.0%, and the student is returned
to the intro. The intro shows `ÚLTIMO INTENTO — 0.0% — No aprobado`.

**That 0.0% is not a symptom. It is the cause.** Everything below follows from it.

---

## §1 — One scored attempt locks answering forever

`assessments/answers_controller.rb`:

```ruby
def create
  question = @assessment.questions.find(params[:question_id])
  return head(:unprocessable_entity) if submitted?
  ...
end

def submitted?
  AssessmentResult
    .where(user: current_user, assessment: @assessment)
    .where.not(score: nil)
    .exists?
end
```

`score: 0.0` is **not nil**. So once any attempt has been scored — including a 0.0 scored from
an attempt with no answers, which is exactly what the earlier broken flow produced — `submitted?`
is true for that user and that assessment **permanently**, and every `POST /answers` is refused
with 422 before anything is written.

The student sees none of it, because `question_nav_controller.js:96`:

```js
if (response.ok) {
  this.answeredSet.add(index)
  ...
  btn.textContent = this.savedTextValue
}
```

A 422 is a **resolved** promise with `ok: false`. The `if` is skipped, there is no `else`, and
`catch` never runs. Nothing is added, the button never says "Guardado", nothing is logged.
That is why the console is clean while every answer is being thrown away.

Then `results_controller#submit` counts `UserAnswer.where(correct: true)` → zero → 0.0% → a
second scored result. The loop is closed: the state that causes the refusal is re-created by
the refusal's own consequence.

**This is the fourth instance of one class in this project**: WP-24 §1 (timeout never POSTed),
WP-25 §2 (voice `catch` → silent idle), WP-26 §1 (Turbo discarded the response), and now this.
Every one of them is *the client not telling the student the server said no.*

---

## §2 — The deeper defect: an answer cannot belong to an attempt

Do not "fix" §1 by scoping `submitted?` to the current attempt and stopping. It will still not
work, and you need to know why before you design anything.

`db/structure.sql:362`:

```sql
CREATE TABLE public.assessments_user_answers (
    id uuid ..., answer text, correct boolean,
    created_at ..., feedback text,
    question_id uuid NOT NULL,
    updated_at ..., user_id uuid NOT NULL
);
CREATE UNIQUE INDEX idx_user_answers_on_user_and_question
  ON public.assessments_user_answers USING btree (user_id, question_id);
```

There is **no `assessment_result_id`**. An answer belongs to a *user* and a *question*, not to an
attempt. The unique index makes that permanent: one answer per user per question, for the life
of the account.

So `answers_controller#create`'s `existing = UserAnswer.find_by(user:, question:)` short-circuits
on every retake and returns the original row **without re-grading**, and `results#submit` counts
`UserAnswer.where(user: current_user, question: assessment.questions)` — the same rows for every
attempt. **A second attempt can never differ from the first.** Retakes are impossible by data
model, not by policy.

### The intent was right; the scope was wrong

The comment above that code is a deliberate anti-cheat decision, and it is correct:

> *Answers are FINAL once given. Previously an answer could be updated in place and re-graded
> unlimited times, so a student could click each option until it showed "correct" and guarantee
> 100%.*

That property must survive. What is wrong is that "final" was implemented as *final forever,
globally* instead of *final within this attempt*. Scope it to the attempt and the anti-cheat
guarantee is exactly as strong — a student still cannot re-grade an answer inside a run — while
a retake becomes a real new run.

### The change

1. **Migration**: add `assessment_result_id` (uuid, FK, indexed) to
   `assessments_user_answers`. Replace `idx_user_answers_on_user_and_question` with a unique
   index on `(assessment_result_id, question_id)`. Keep `user_id` — it is still how ownership is
   checked.
2. **Backfill** existing rows to that user's earliest `AssessmentResult` for the question's
   assessment. Decide and state what happens to rows with no matching result; a null that the
   code treats as legacy is acceptable if you say so.
3. `answers_controller#create` finds the caller's **in-progress** result (`score: nil`), refuses
   with a *legible* error if there is none, and creates the answer against it.
4. `submitted?` becomes "is **this attempt** scored?", not "has this user ever been scored".
5. `results_controller#submit` counts `@result.user_answers`, not
   `UserAnswer.where(user:, question:)`.
6. `assessments_controller#start` should not pile up scored results — it already reuses an
   in-progress one; confirm it does not create a second when one exists.

Do this as a migration on production data. `learning_routes_storage` is a named volume and the
DB is on the same box; **say in the handoff what the backfill will touch and how many rows**, and
do not run it — the owner deploys.

---

## §3 — The refusal must be visible

Whatever §1 and §2 settle, `saveAnswer` needs the `else` it never had:

```js
if (response.ok) { ... }
else { /* tell the student, with the reason */ }
```

422 with no in-progress attempt, 403, and network failure are three different things and the
student should be able to tell them apart. Spanish and English, like WP-25 §2's recorder — that
one is the pattern to copy, and it is the reason this defect could be diagnosed at all.

---

## The tests

Two classes, both real, and neither is "does the controller return 200".

**A. "An attempt is a real attempt."**

```ruby
# test/integration/assessments/retake_test.rb
```

Answer all questions wrong, submit, assert the score. Then start a **second** attempt, answer
them all correctly, submit, and assert the second result scores 100 while the first still reads
its original score. Today this fails at the first save of the second attempt. It is the whole
feature stated once.

**B. "The anti-cheat guard still holds."**

Within one attempt, answer a question, then POST a different answer to the same question and
assert the stored answer and its `correct` flag are unchanged. This is the property WP-?? added
deliberately; the migration must not weaken it. Write this test **before** the migration so you
can prove it passes on both sides.

Plus the §3 assertion: a refused save puts a visible message on the page.

---

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, intersection.
- Browser suite, same.
- All new tests demonstrated red first, output pasted.
- State the row counts the backfill would touch.
- **Owner verifies on the live site**: take the exam, answer correctly, see it scored correctly,
  then retake and see a different score. Nothing short of that closes this.
- Say what you did not do.

## Not in this package

WP-24 §2 (the scenario parser with no terminator) — still the highest-value bug after this one.
WP-23. WP-20, Task 8, Task 9. And the content-depth work the owner raised on 4 September, which
is a product decision and is recorded in the roadmap, not here.
