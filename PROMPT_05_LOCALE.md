# PROMPT 05 — WP-9: make the locale reach every prompt

> Run from `~/Documents/Learning-routes`, on `main` (HEAD = `96e8cce`).
> Reference: `AUDIT.md` §P1-5, and `WP6_HANDOFF.md` §C — which fixed half of this.

---

## The defect, already diagnosed — confirm it, don't re-derive it

A Spanish learner opens a lesson. The lesson is in Spanish. The quiz under it is in English.

It is not a missing translation. **The prompt explicitly asks for English.**

`StepQuizGenerationJob:19` calls `Orchestrate.call` with no `locale` variable. So in
`PromptBuilder#computed_language_directive`, `@variables["locale"]` is `nil`, and
`LanguageInstructions.language_name(nil)` walks its whole fallback chain:

```ruby
LANGUAGE_NAMES[""] || "".upcase.presence || "English"
#      nil               nil                  ← this
```

producing, verbatim, in the system prompt:

```
LANGUAGE MODE — MONOLINGUAL.
Write the ENTIRE lesson in English: concepts, examples, questions, ...
```

WP-6 §C guaranteed the `{{language_directive}}` **token** reaches all 17 templates. It did not
guarantee the **value** is right. On a Spanish-first product, "no locale supplied" defaulting to
English is backwards, and it fails silently — the directive is present, well-formed, and wrong.

## Blast radius — audited, use this list

Five call sites pass `locale`. Eight do not:

| File | task_type | student-facing? |
|---|---|---|
| `step_quiz_generation_job.rb:19` | `step_quiz` | yes — the reported symptom |
| `exercises_controller.rb:10` | `quick_grading` | yes |
| `exercises_controller.rb:44` | `exercise_hint` | yes |
| `answers_controller.rb:76` | `quick_grading` | yes |
| `assessment_generation_job.rb:21` | `exam_questions` | yes |
| `gap_analyzer.rb:54` | `gap_analysis` | indirect (feeds reinforcement) |
| `route_generator.rb:57` | `route_generation` | yes |
| `reinforcement_generator.rb:35` | `reinforcement_generation` | yes |

Already correct, use them as the reference implementation:
`content_pipeline_job.rb:98`, `curriculum_brain.rb:42`, `tutor_reply_job.rb:29`,
`audio_generator.rb:74`, `voice_evaluator.rb:70`.

`content_pipeline_job.rb:96-99` is the canonical resolution order:

```ruby
content_locale = @route.locale || @user&.locale || "en"
target_locale  = @route.target_locale
```

## Hard constraints

1. **Do not deploy.** A human deploys.
2. Scope: getting `locale` / `target_locale` to every `Orchestrate.call`, plus the guard in §C.
   Anything else → `FINDINGS_WP9.md`.
3. Do not touch `LanguageInstructions`' directive **text** — the bilingual block is good and WP-6
   proved it works. You are fixing its **inputs**.
4. Do not "fix" the 14 red engine tests. Report the count before and after; it must not grow.
5. Phases: read → change → prove.

---

## PHASE 1 — Read

- `engines/ai_orchestrator/app/services/ai_orchestrator/prompt_builder.rb` in full —
  `ensure_language_directive` (`:67`), `computed_language_directive` (`:77`), `interpolate` (`:87`)
- `engines/ai_orchestrator/app/services/ai_orchestrator/language_instructions.rb` in full —
  especially `language_name`'s fallback chain
- `engines/learning_routes_engine/app/jobs/learning_routes_engine/content_pipeline_job.rb:90-110`
  — the correct pattern
- All eight offending call sites
- `test/services/ai_orchestrator/language_directive_test.rb` — WP-6's test. Understand why it passes
  while production is broken: it calls `PromptBuilder` directly with an explicit locale, so it never
  exercises a caller that forgot one. **Your test must close that gap.**
- `db/schema.rb` around lines 392, 461, 553

## PHASE 2 — Changes

### §A · Pass the locale, everywhere

Add `locale:` and, where the route may be a language course, `target_locale:` to all eight sites.

Jobs and services that hold a route: use the `content_pipeline_job` resolution order.
Controllers (`exercises_controller`, `answers_controller`): resolve from the record in hand — the
route behind the exercise/answer — **not** from `I18n.locale`, which reflects the browser's UI
choice rather than the language the course is being taught in. If you conclude `I18n.locale` is
genuinely the better source for a given site, say why rather than defaulting to it.

`gap_analyzer` and `reinforcement_generator` may not have a single route in scope. Work out where
their locale legitimately comes from (the profile? the user?) and justify it in the handoff.

### §B · Localized titles in the quiz

`step_quiz_generation_job.rb:22,28` passes `step.title` and `route.topic`. `content_pipeline_job`
passes `step.localized_title` and `route.localized_topic`. The quiz is being generated from
untranslated titles even once §A lands. Align it — and check the other seven sites for the same
slip.

### §C · Stop "no locale" from meaning "English"

This is the part that stops the bug class, not just these eight instances.

`language_name(nil) # => "English"` is the silent failure. Decide and justify **one** of:

- resolve a missing locale to the application default (`I18n.default_locale`) instead of a hardcoded
  `"English"`, or
- treat a missing locale as a programming error — raise in dev/test, log loudly and fall back in
  production.

Do not do both, and do not add a config flag. Pick the one you can defend and write the reason in
the handoff. Consider that this app is Spanish-first while two `locale` columns default to `"en"`
and `route_requests.route_locale` defaults to `"es"` — that inconsistency is itself a finding; record
it, and do not silently "fix" the schema here.

### §D · Tests

The WP-6 test asserts the token is in every template. Add the assertion that actually catches this:

1. **A call-site test.** For each task type with a student-facing prompt, assert the prompt the
   *caller* produces carries the student's language — not the prompt `PromptBuilder` produces when
   handed a locale directly. Stub the model; assert on the outgoing system prompt.
   The cheapest honest version: run each job/service against a Spanish route with a stubbed client,
   capture the system prompt, and assert it does **not** contain `Write the ENTIRE lesson in English`.
2. A regression test for §C's chosen behaviour.
3. Keep the existing `language_directive_test.rb` green.

Report both suites, before and after:

```bash
bin/rails db:test:prepare test
bin/rails test test engines/*/test
```

## PHASE 3 — Prove it

Stubs are enough for the eight call sites; the failure is in variable plumbing, not model behaviour.
But prove the end-to-end once, for real, on the reported case:

1. Build the actual system prompt `StepQuizGenerationJob` would send for a Spanish route, and print
   the `LANGUAGE MODE` paragraph. It must say **Spanish**.
2. Generate one real quiz for a Spanish step and print the four question bodies. They must be in
   Spanish.

### The already-poisoned rows

Fixing the job does not retranslate quizzes already in the database — they are stored English text,
and `step_quiz_generation_job.rb:11` plus `steps_controller.rb:30` both short-circuit on existing
records and on `step.metadata["step_quiz_generated"]`.

Write an idempotent `bin/rails` task (do **not** run it against production — that is the human's
call) that, for a given route, deletes its `step_quiz` assessments and their questions and clears
the `step_quiz_generated` / `step_quiz_id` metadata keys, so they regenerate. State plainly in the
handoff how many rows it would touch for route `61b5f688-f491-4cfb-9949-0cc3500a71ce`.

Write `WP9_HANDOFF.md`: every call site changed and where its locale came from, the §C decision and
why, both test counts, the printed Spanish directive, the four Spanish questions, the row count the
cleanup task would touch, and anything that surprised you.

## Reporting back

Print only: the eight call sites one line each with their locale source, the §C decision in one
sentence, both test counts, the `LANGUAGE MODE` paragraph, and the four quiz questions. I will read
the handoff myself.
