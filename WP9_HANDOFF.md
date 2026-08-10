# WP-9 handoff — the locale reaches every prompt

**Branch:** `wp9-locale-everywhere` · **Base:** `96e8cce` · **Commits:** `887e253`, + docs
**Nothing was deployed, and nothing was pushed.** Deferred: `FINDINGS_WP9.md`.

> 🔴 **Read `FINDINGS_WP9.md` §1 before you push anything.** The live production OpenAI
> key is committed in plaintext in `config/initializers/ai_services.rb:5` at `96e8cce`.
> The commit is not on any remote yet, but the GitHub repo is public. Rotate first, then
> strip it from history, then push.

---

## 1. The eight call sites, and where each locale comes from

| # | Site | task_type | Locale source |
|---|---|---|---|
| 1 | `step_quiz_generation_job.rb:24` | `step_quiz` | `LocaleResolver.for_route(route, user: profile.user)` — the route behind the step. **The reported symptom.** |
| 2 | `assessment_generation_job.rb:21` | `exam_questions` | same — route behind the step |
| 3 | `exercises_controller.rb:14` | `quick_grading` | `@step.learning_route`, **not** `I18n.locale` |
| 4 | `exercises_controller.rb:52` | `exercise_hint` | same |
| 5 | `answers_controller.rb:79` | `quick_grading` | `@assessment.route_step.learning_route` |
| 6 | `gap_analyzer.rb:55` | `gap_analysis` | `@route` — set in the constructor, always present |
| 7 | `reinforcement_generator.rb:37` | `reinforcement_generation` | `@route` — set in the constructor |
| 8 | `route_generator.rb:63` | `route_generation` | `LocaleResolver.for_user(@user)` — **no route exists yet** |

On the two the brief flagged as uncertain: `gap_analyzer` and `reinforcement_generator`
both take `route:` in their constructors and store it, so both resolve exactly like the
content pipeline. `route_generator` is the genuine exception — `call_ai` runs before the
route has a locale, so the student's own locale is the only signal, which is what
`for_user` uses.

**Why not `I18n.locale` in the controllers.** It is the browser's UI preference. A
student can read the interface in English while taking a course taught in Spanish, and
grading feedback and hints belong to the course, not the chrome. In a job it is worse
still — the process default, `:en`, with nothing to do with the student.

**Three more sites fixed beyond the eight**, found by sweeping every `Orchestrate.call`:
`content_pipeline_job` and `tutor_reply_job` passed a locale but then took their titles
from `localized_title` with no argument, and `content_generation_job` did both. All 13
call sites now pass locale; the two apparent misses in the sweep were
`curriculum_brain` (passes it via `prompt_variables`) and a docstring example.

## 2. §B — the titles

`localized_title` / `localized_topic` / `localized_description` default to `I18n.locale`,
which inside a job is `:en`. So even `content_pipeline_job`, the brief's reference
implementation, was feeding **English titles into a Spanish route's prompt** whenever an
`en` translation existed. Every prompt-feeding site now passes the resolved locale
explicitly. Four non-prompt sites still use the implicit default — assessed individually
in `FINDINGS_WP9.md` §3.

## 3. §C — the decision, in one sentence

**A missing `locale` is treated as a programming error: `ArgumentError` in dev/test,
logged and reported to `Rails.error` in production with a fallback to
`I18n.default_locale`.**

Why that rather than "resolve to the application default":

- On this product the two options are not equally strong. `I18n.default_locale` is `:en`,
  so quietly resolving to it changes nothing a Spanish learner would notice — it makes
  the existing wrong answer *tidier* rather than louder. It would have left this exact
  bug in place for the next eight call sites.
- The failure mode being fixed is silence. The directive was never malformed or missing;
  it was confident, well-formed, and wrong. Only something that fails noisily catches
  that class.
- It matches how this codebase already separates misconfiguration from bad runtime
  input — strict loading (WP-2) and `Orchestrate::ConfigurationError` (WP-5) both raise
  where a developer is watching and degrade where a user is.

The production branch still needs *a* language, and it uses `I18n.default_locale` rather
than a hardcoded `"English"` — so it tracks the app's own setting rather than a literal
buried in `LanguageInstructions`. That is the fallback for the loud-failure policy, not a
second policy.

**A bug this found in my own change:** `PromptBuilder` computed the directive **twice**
from the same inputs — once to substitute `{{language_directive}}`, once for WP-6's
append fallback. Guarding only `computed_language_directive` produced a prompt carrying
an English directive at the top (token path, still `nil`-means-English) *and* a Spanish
one at the bottom. Caught by the new call-site test. They are now one computation, and
`{{content_locale}}` and `{{bilingual_instructions}}` were fed from the raw variable too.

## 4. Test counts

| Path | Before (`96e8cce`) | After |
|---|---|---|
| `bin/rails db:test:prepare test` | 159 runs, 0F 0E | **173 runs, 482 assertions, 0F 0E** |
| `bin/rails test test engines/*/test` | 466 runs, **5F 9E** (14) | **466 runs, 1307 assertions, 3F 9E (12)** |

**The engine failures went 14 → 12, not up.** Eager-loading the route chain in the quiz,
assessment and content jobs — needed for the new tests to run at all under the test
environment's strict loading — fixed `AssessmentGenerationJobTest` and
`ContentGenerationJobTest`. The remaining 12 are the same `FINDINGS_WP2.md` §1 set.
(One run in five reported 4F 9E with an identical list of failing test names, so
something in that set is mildly flaky; two consecutive clean runs both gave 3F 9E.)

`bin/rubocop`: 337 files, no offenses.

**Two legacy tests needed updating**, both because they called the builder in a way the
guard now rejects: `prompt_builder_test.rb` (8 cases, none about language) and one
`curriculum_brain_wiring_test.rb` case that passed `variables: {}`. Both now pass a
locale; neither's intent changed.

### The test that closes WP-6's gap

`language_directive_test.rb` stayed green throughout the outage because it calls
`PromptBuilder` directly **with** a locale — it could never see a caller that forgot one.
`call_site_locale_test.rb` drives the real jobs and services against a Spanish route with
a stubbed `AiClient`, captures the outgoing system prompt, and asserts it does not
contain `Write the ENTIRE lesson in English`.

Verified it actually catches the bug: reverting the `step_quiz` locale makes it fail with

```
ArgumentError: [PromptBuilder] task_type=step_quiz was called without a `locale`
variable. The language directive would silently instruct the model to write in English.
```

— the §C guard firing before the assertion, which is the better failure because it names
the cause.

## 5. Proof

### The `LANGUAGE MODE` paragraph `StepQuizGenerationJob` now sends

```
LANGUAGE MODE — BILINGUAL LANGUAGE-LEARNING LESSON.
The student's native language is Spanish. They are learning Portuguese.

resolved locale="es" target_locale="pt"
contains 'in English'? false
```

Better than the brief asked for: because `target_locale` is now carried too, a language
course gets the **bilingual** directive rather than the monolingual one.

### A real quiz, generated for a Spanish step

`gpt-4.1-mini`, 1¢, 7.0s — all four questions in Spanish, testing Portuguese:

```
1. ¿Qué significa 'Bom dia' en español?
   A) Buenos días   B) Buenas noches   C) Buenas tardes   D) Gracias
   ✓ A — 'Bom dia' es un saludo utilizado para decir 'buenos días' en portugués.

2. ¿Cómo se dice 'buenas tardes' en portugués?
   A) Obrigado   B) Boa tarde   C) Bom dia   D) Boa noite
   ✓ B — 'Boa tarde' es la forma correcta de saludar por la tarde en portugués.

3. ¿Cuál es el significado de 'Obrigado' en español?
   A) Buenos días   B) Buenas tardes   C) Gracias   D) Por favor
   ✓ C — 'Obrigado' significa 'gracias' y se usa para expresar agradecimiento.

4. Selecciona el saludo portugués que se usa para la mañana.
   A) Boa noite   B) Bom dia   C) Obrigado   D) Boa tarde
   ✓ B — 'Bom dia' es la expresión que se utiliza para saludar en la mañana.
```

## 6. The already-poisoned rows

`lib/tasks/step_quizzes.rake` — two tasks, both taking a route id:

- `bin/rails 'step_quizzes:report[ROUTE_ID]'` — **read-only**, prints what would go.
- `bin/rails 'step_quizzes:reset[ROUTE_ID]'` — deletes the route's `step_quiz`
  assessments (cascading to questions, user answers and results) and clears the
  `step_quiz_generated` / `step_quiz_id` metadata keys, so the job rebuilds them.

Idempotent: a second run reports and deletes nothing. Verified locally end to end —
`report` → 1 quiz / 4 questions / 1 flagged step, `reset` → `assessments=1 questions=4
steps_cleared=1`, `report` → all zeros, `reset` again → all zeros, no error.

**I cannot give you the row count for route `61b5f688-f491-4cfb-9949-0cc3500a71ce`.**
It is not in the development database, and I did not query production. Run this first —
it writes nothing:

```
kamal app exec --reuse "bin/rails 'step_quizzes:report[61b5f688-f491-4cfb-9949-0cc3500a71ce]'"
```

Two things to weigh before running `reset` on it: it destroys any `UserAnswer` and
`AssessmentResult` rows attached to those quizzes, so a student who already took a quiz
loses that record; and regeneration costs ~1¢ and one AI call per step.

## 7. What surprised me

1. **A live production key committed at HEAD, in a public repo, unpushed.** Details in
   `FINDINGS_WP9.md` §1. It is the same key I have been using for the real generations
   in WP-5, WP-6 and this session.
2. **My own fix was half-applied and the new test caught it.** `PromptBuilder` had two
   independent computations of the same directive; guarding one produced a prompt with
   an English directive *and* a Spanish one. If I had only run WP-6's test — which is
   what "the tests pass" would have meant yesterday — it would have shipped.
3. **`learning_routes.locale` is NOT NULL.** So the resolution chain's later branches are
   effectively dead for persisted routes: whatever is on the route wins, always. Combined
   with its `"en"` default against `route_requests.route_locale`'s `"es"` default
   (`FINDINGS_WP9.md` §2), the schema is the remaining Spanish-first hazard — and it is a
   migration, not a code change.
4. **The reference implementation was also wrong.** `content_pipeline_job` was cited as
   the correct pattern and it is, for the directive — but its `localized_title` calls take
   `I18n.locale`, so it was sending English titles into Spanish prompts. §B turned out to
   apply to the exemplar too.
