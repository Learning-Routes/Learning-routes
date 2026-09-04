# WP-29 — No exam has ever been passable, and every failure floods the route

Branch: `wp29-exam-grading-and-gating`, off `main` after `wp28-submit-side-effects` is merged.

**This brief replaces the earlier WP-29.** That one was written from the code. This one was
written after driving the live site in a real browser as the owner's test user, on
4 September, with the network panel open. Two of its four findings are not in the earlier
version, and one of them changes the diagnosis of everything the owner has reported this week.

Evidence is in `wp29_evidence/` beside this file: three screenshots, and a 30-frame recording
the owner has in their Downloads (`wp29_examen_respuestas_perdidas_y_refuerzo.gif`).

---

## What was done in the browser

Logged in as the test user. Opened
`/assessments/assessments/3cdb3a6c-8e01-4284-9ccc-cce06f296b27`. Pressed "Iniciar examen".

**Run 1 — select every correct answer, never press "Guardar respuesta", press "Enviar
evaluación".**

Before submitting, the DOM had four checked radios:

```
"A) Subject + Verb + Object"
"B) He is happy."
"C) A sentence using the verb 'to be'"
"C) A nosotros nos gusta la música."
```

and the sidebar read **"0 de 4 respondidas"**. Network from that moment on:

```
POST /assessments/results/0ce112ab-…/submit   200
GET  /assessments/results/0ce112ab-…
```

**Zero requests to `/answers`.** Result page: 0% — 0 Correctas, 0 Incorrectas, **4 Sin
responder**. Then on the route page: the step has a **green check** and the next step is
unlocked. (`01_…jpg`, `02_…jpg`)

**Run 2 — select the correct answer to question 1 and press "Guardar respuesta".**

```
POST /assessments/assessments/3cdb3a6c-…/answers   200
```

Feedback rendered under the question:

> ✕ **Incorrecto**
> Incorrecto. A simple English sentence usually follows the order Subject + Verb + Object, as
> explained in the lesson.

The answer chosen was `A) Subject + Verb + Object`. The explanation says the correct answer is
Subject + Verb + Object. **The server graded the correct answer as wrong.** And the sidebar
still read "0 de 4 respondidas" after a 200.

Stopped there. Each further submit inserts three reinforcement steps and enqueues a paid job
(§4), so more runs would have made the problem worse to prove a point already proven.

---

## §1 — The grader has never marked a multiple-choice answer correct

`assessments/answers_controller.rb:76`:

```ruby
is_correct = params[:answer].to_s.strip.downcase == question.correct_answer.to_s.strip.downcase
```

What arrives in `params[:answer]` is the radio's `value`, which
`_question_multiple_choice.html.erb:4` sets to the option text verbatim:

```erb
<input type="radio" name="answers[<%= question.id %>]" value="<%= option %>"
```

What the generator stores is defined in `assessment_questions.yml:28-29`:

```yaml
"options": ["A) ...", "B) ...", "C) ...", "D) ..."],
"correct_answer": "A",
```

So the comparison, for a correct answer, is:

```ruby
"a) subject + verb + object" == "a"    # => false. Always.
```

**No multiple-choice answer has ever graded correct on an assessment.** Every 0% the owner has
seen this week — including the ones that drove WP-27 and WP-28 — had this underneath it. Those
packages were real and necessary; this is the reason the exam still could not be passed after
them.

The project already knows how to do this. `step_quizzes_controller.rb:119-127`:

```ruby
def normalize_answer(value)
  cleaned = value.to_s.strip.downcase
  # Extract just the letter if the answer starts with A), B), etc.
  if cleaned.match?(/\A[a-d]\)/)
    cleaned[0]
  else
    cleaned.gsub(/\A"(.+)"\z/, '\1')
  end
end
```

Someone hit exactly this bug on the step-quiz path, fixed it there, and never fixed the other
grader. Two graders for one answer vocabulary; one normalizes, one does not. Sixth instance of
the two-copies class in this codebase.

### The fix

One normalizer, in one place both graders call. Move `normalize_answer` out of
`StepQuizzesController` into a shared object (`Assessments::AnswerNormalizer`, or on
`BlockGrader` next to `answerable?` — pick one and justify), and make `grade_answer!` use it.
Delete the private copy. Do not add a second normalizer to `AnswersController`; that is a
third copy with extra steps.

Then think about the data: `correct_answer` is sometimes `"A"` (assessment_questions.yml) and
sometimes `"The correct answer"` in full (exam_questions.yml:29). The normalizer has to grade
both correctly against a letter-prefixed option. Write down which formats exist in production
and test each.

### The test that prevents the class

```ruby
# test/services/assessments/answer_normalizer_test.rb
```

Grade the exact pair from production — option `"A) Subject + Verb + Object"`, stored
`"A"` — and assert correct. Then the class test: a sweep asserting that **every** grading site
(`AnswersController#grade_answer!`, `StepQuizzesController`, and anything else that compares an
answer to `correct_answer`) goes through the shared normalizer. `grep -rn "correct_answer" | grep
"=="` must return only the normalizer itself.

---

## §2 — Selecting an answer saves nothing; submitting does not gather

Confirmed live: four checked radios, zero POSTs to `/answers`, four "sin responder".

`take.html.erb` has one binding to the save path — `click->question-nav#saveAnswer` on the
"Guardar respuesta" button. The radios carry `change->question-nav#markAnswered`, which marks
the nav client-side and **does not save**. "Enviar evaluación" is a plain `form_with` that posts
the result and nothing else.

### The fix — decided by the owner

**Submit gathers what is selected, saves it through the same `saveAnswer` path, waits, then
scores.** "Guardar respuesta" stays as incremental saving.

This is the option that fits WP-27's anti-cheat rule: answers are final once *handed in for
grading*, which is what a student already believes. Do **not** auto-save on `change` — it makes
the first click final and locks out a change of mind, and relaxing the rule to allow it reopens
the click-every-option hole WP-27 closed.

- One submitter. The gather calls the existing path, not a copy.
- If any save fails, **do not submit** — say which and let them retry. Submitting after a partial
  save scores a full exam at 50%.
- The button is not pressable twice while the gather is in flight.

### Observed and not investigated

The sidebar counter read "0 de 4 respondidas" **after** a successful save returned 200. Whatever
`markAnswered` and `updateDisplay` do, they did not do it. Find out why while you are in the
file; it is the same "screen says one thing, server has another" shape.

### The test

In a real browser: select every option without pressing "Guardar respuesta", press "Enviar
evaluación", assert **four `UserAnswer` rows on this result and a score of 100**. Rows, not DOM.
Fails today with zero rows — exactly what run 1 produced. (With §1 unfixed it would fail at the
score instead; that is why §1 ships first.)

---

## §3 — Failing the exam completes the step

Confirmed live: the exam scored 0%, the route page shows the step with a green check, and the
next step is unlocked.

`results_controller.rb:117`:

```ruby
results << isolate("complete step") do
  LearningRoutesEngine::RouteProgressTracker.new(route).complete_step!(step)
end
```

Unconditional. Meanwhile `assessment_result.rb:24` computes `passed = score >= passing_score`
and `results/show.html.erb:16` prints *"Necesitas 80.0% para aprobar"*. The app knows the
student failed, tells them, and advances them.

### The decision — made by the owner

**Passing is required to advance.** `complete_step!` runs only when `@result.passed?`.

### The escape valve ships in the same package

Gating on a score can strand a student behind a badly generated exam — and this week the
codebase shipped an unanswerable check (WP-24 §3) *and* a grader that failed every answer (§1
above). Do not gate without a way out. Two rules, same principle `BlockGrader` already states
(*"Fail OPEN on data quality"*):

- After **N** failed attempts (`RELEASE_AFTER = 3` is the house precedent) the step completes and
  the result records **released**, not passed — the distinction `BlockAttempt#released_at`
  already draws, and the one the spaced-repetition scheduler needs to see.
- An assessment with no questions, or with a question whose `correct_answer` matches none of its
  options after normalization, is **unanswerable** and does not gate. The second condition is new
  and it is §1's twin: it would have caught this.

### What must change on screen

If failing blocks, the student is told: what happens next, attempts left before release, where
the retry is. Spanish and English.

### The tests

Failed result → step not completed; passed → completed (assert `route_step.status`). N failures
→ released, not passed (assert both). Unanswerable → does not gate.

---

## §4 — Every failed submit inserts three reinforcement steps, and nothing caps it

On the route page, one JS pass over the DOM:

```
total_pasos:            "2 de 43 pasos"
reinforcement_titles:   36
distinct:               ["Reinforcement: Review Key Concepts",
                         "Reinforcement: Guided Practice",
                         "Reinforcement: Re-Assessment"]
```

The route had **7 steps**. It has **43**. The extra 36 are twelve identical triplets —
`03_…jpg` shows the wall of them — one triplet per failed submit, all today, all under the
heading **VISTA PREVIA GRATUITA**, and all titled in English on a Spanish route.

`adaptive_difficulty.rb`:

```ruby
REINFORCE_THRESHOLD = 60 # Score < 60% → insert reinforcement          # :4
elsif @score < REINFORCE_THRESHOLD                                     # :92
# … this path runs on every submission with score < 60 …               # :145
{ title: "Reinforcement: Review Key Concepts",                          # :241
  description: "Review the concepts that need strengthening",           # :242
{ title: "Reinforcement: Guided Practice",                              # :244
{ title: "Reinforcement: Re-Assessment",                                # :247
```

`MAX_SKIP_RATIO` caps skipping. **Nothing caps insertion.** WP-19 §1b flagged this — *"sin
tope"* — and left the cap as a decision. It was never made.

Now put §1 next to it: **every** assessment ever submitted scored below 60, because the grader
could not mark anything correct. So every exam ever taken has inserted three reinforcement
steps. The free preview module — the one WP-20 prices the whole funnel on — has been growing by
three steps per attempt, and each of those steps generates paid content (lesson, audio, image;
~12¢ measured) the moment a student opens it.

### The fix — three parts, all in this package

1. **Cap it.** At most one unfinished reinforcement triplet per assessment per route. If one
   exists and the student has not completed it, insert nothing. Write the cap where the
   insertion happens, not in the controller.
2. **Localize it.** The titles and descriptions at `:241-247` go to locale keys, rendered in the
   route's language. Same rule WP-9 applied everywhere else.
3. **Clean up production.** Thirty-six junk steps on this route, and unknown counts on every
   other route where anyone submitted an exam. This is a data migration with a census first:

   - How many routes have reinforcement steps, how many each, how many of those steps a student
     has actually started. **Report the numbers before touching anything.**
   - Remove reinforcement steps that are `locked`/`available` and untouched. **Do not remove any a
     student has opened** — that is their work.
   - The migration's `down` refuses, as WP-27's does; there is no undo for a delete.

   The owner deploys. `kamal pg-shell` has the DB; the handoff carries the exact SQL.

### The tests

A failed submit on a route that already has an unfinished reinforcement triplet inserts nothing.
Reinforcement step titles come from `I18n` in the route's locale. The cleanup migration is
covered by a test that seeds twelve triplets plus one the student started, runs it, and asserts
one triplet remains.

---

## Order

1. **§1** — the grader. It is why every exam this week failed, and why §4 exists at all.
2. **§4 cap + localize** — stop the bleeding before another submit lands.
3. **§2** — gather on submit.
4. **§3** — gate with valve.
5. **§4 cleanup** — last, deployed by the owner after the census.

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, intersection.
- Browser suite, same.
- All new tests demonstrated red first, output pasted.
- **Then the owner, on the live site**, on the same assessment:
  answer everything correctly without pressing "Guardar respuesta" → a real score → the step
  completes → the route did **not** grow. Then fail one on purpose → the step does not complete →
  the screen says why → the route grew by exactly one triplet, in Spanish.
- Report the census numbers from §4 before running the cleanup.
- Say what you did not do.

## Not in this package

WP-24 §2 — the scenario parser with no terminator — is now the *only* lesson-content bug left,
and it is next. WP-23 (the inline handlers still filling the console). WP-20 — and note that
its cost model assumed a free module of fixed size; §4 shows it was not. Task 8, Task 9.
