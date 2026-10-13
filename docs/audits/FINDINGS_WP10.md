# Findings deferred out of WP-10

---

## 1. 🔴 The `I18n.locale` leak — root cause of the "drifting" red count

You asked me to identify the five newly-red tests. There were **six**, they were **not**
the new files, and they are **flaky rather than red** — and I can now name the mechanism.

`Core::ApplicationController#set_locale:43` assigns `I18n.locale` **globally**:

```ruby
I18n.locale = I18n.available_locales.include?(locale) ? locale : I18n.default_locale
```

Not `I18n.with_locale`, not an `around_action` — a bare process-wide assignment with no
reset. In production that is harmless: every request sets it at the start. **In tests it
persists for the rest of the worker process.**

So any integration test that signs in a Spanish user leaves the process in `:es`, and any
later model test in the same parallel worker gets Spanish validation messages:

```
AiOrchestrator::AiInteractionTest#test_requires_model
Expected ["no puede estar en blanco", "no está incluido en la lista"] to include "can't be blank"
```

Every affected test is a `test_requires_*` presence assertion. Which ones surface depends
on the seed and which worker they land in, which is why the count "drifted" — it is not
drift, it is a race.

**Measured, 3 runs each:**

| | Stable red | Flaky |
|---|---|---|
| Before WP-10 | 12 | 6 |
| WP-10 mid-build (my Spanish tests added) | **13** | 9 |
| WP-10 final (teardown added to my 2 files) | **12** | 2 |

I added `teardown { I18n.locale = I18n.default_locale }` to my two new test files only —
cleaning up my own contribution, not fixing their tests. The stable 12 is untouched.

**The general fix, for WP-4** — one of:

```ruby
# test/test_helper.rb — cheapest, fixes the whole class
teardown { I18n.locale = I18n.default_locale }
```
or, better, make the app not leak in the first place:
```ruby
# core/application_controller.rb
around_action :with_locale
def with_locale(&) = I18n.with_locale(resolved_locale, &)
```
The second is the real fix and is arguably a latent production bug too: `set_locale`
runs as a `before_action`, so any code that runs *before* it in a request — or any
background job sharing the thread — sees the previous request's locale.

---

## 2. Out of scope per the brief, confirmed present

Listed in the prompt, and I did not touch them:

- **i18n of the block partials.** `Terms`, `Definitions`, `Hard`, `Normal`, `Easy`,
  `Reset`, `Output` hardcoded English; `Continuar` / `Reintentar` hardcoded Spanish.
- **Flashcards UI redesign.**
- **Row-1 AI buttons not passing `section_index`.**
- **The visual block printing its own image prompt as body text.**

## 3. Also noted, as requested

- **`drag_drop_controller.js:76` and `fill_blank_controller.js:28`** hardcode English
  feedback: `"All matched correctly!"`, `"All blanks filled correctly!"`. Same i18n
  sweep. I left both strings exactly as they were and added the submit call beside them;
  the server response now carries a localized verdict the sweep can render instead.
- **`RouteProgressTracker#unlock_next_steps!` is dead.** Its own comment says the logic
  was inlined into `complete_step!`; nothing calls it. Deletion candidate for the
  dead-code package.

## 4. New, found while building

- **`_lesson.html.erb` renders every section but only the first is visible** (`display:none`
  on `i > 0`, driven by `interactive_lesson_controller`). Gating therefore requires the
  student to page through to reach a block. That is the intended stepper behaviour, but
  it means an outstanding-block message must scroll them back — I pass the section
  indices to the view for exactly that, and the scroll itself is not wired up. Small, and
  it belongs with the flashcards/UI package rather than here.
- **`code_playground` `expected_output` is frequently `nil`** and, when present, is free
  prose captured after the code fence rather than a literal expected value. Even if
  execution moved server-side, the stored contract is not yet strong enough to grade
  against. Worth tightening in the prompt before anyone attempts Pyodide/Judge0 grading.
- **`Assessments::Assessment#passing_score`** has no default in the schema and is
  validated `> 0`, so a step quiz created without one raises. Not hit by this package,
  but adjacent to the gate.

## 5. Still open from earlier packages

| Ref | Item |
|---|---|
| `FINDINGS_WP6.md` §1 | ElevenLabs credential was an invalid key ID — you have since rotated it; TTS worth re-verifying end to end |
| `AUDIT.md` §P1-6 | ElevenLabs priced `flat: 0` in CostTracker |
| `AUDIT.md` §P2-3..P2-6 | password reset `forget!`, `/cable` auth, tutor XSS, XP replay |
| `AUDIT.md` §P3-1 | CI runs 201 of 494 tests and auto-deploys on green |
| `FINDINGS_WP2.md` §1 | the 12 stable engine failures — WP-4 |
