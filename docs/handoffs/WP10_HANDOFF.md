# WP-10 handoff — the interactive blocks are real

**Branch:** `wp10-block-grading` · **Base:** `dd6676c` · **Not deployed.**
Design as approved: `WP10_DESIGN.md`. Deferred: `FINDINGS_WP10.md`.

Premise re-confirmed before designing: seven controllers, 677 lines, **0 server calls**.

---

## 1. The five newly-red tests — answered first, since it gated the build

**They were six, not five, and they are not the new files.** `content_pipeline_ordering_test`
and `section_images_fallback_test` never appear in any failing set.

They are engine **model validation** tests (`test_requires_model`, `test_requires_title`,
`test_requires_position`, `test_requires_started_at`, …) and they are **flaky, not red** —
present in 1 run of 3. The mechanism:

```
Expected ["no puede estar en blanco", "no está incluido en la lista"]
      to include "can't be blank"
```

`Core::ApplicationController#set_locale:43` assigns `I18n.locale` **globally** with no
reset. An integration test that signs in a Spanish user leaves the whole worker process
in `:es`, and later model tests get Spanish validation messages. Which ones surface
depends on seed and worker — that is the "drift".

**It is mine in the sense that matters:** WP-9 added Spanish-locale integration tests, and
WP-10 added more, which is why it went from occasional to frequent. Mid-build my tests
pushed stable red 12 → 13. I added a locale `teardown` to my two new files only and it
returned to 12. Full analysis and the two candidate general fixes in `FINDINGS_WP10.md` §1.

---

## 2. What was built

| Piece | File | Note |
|---|---|---|
| Table | `…/db/migrate/20260811000001_create_block_attempts.rb` | one row per (user, step, section); `released_at` separate from `correct` |
| Model | `…/models/…/block_attempt.rb` | `passed?` / `released?` / `engaged?` / `satisfied?`, and `fsrs_rating` |
| Grader | `…/services/…/block_grader.rb` | re-grades against the stored section |
| Endpoint | `…/controllers/…/block_attempts_controller.rb` | `POST …/steps/:id/blocks/:section_index` |
| Gate | `RouteStep#outstanding_blocks_for` + `StepsController#complete` | runs **before** the quiz gate |
| FSRS | `RouteProgressTracker#complete_step!(step, rating:)` | defaults to `GOOD`; existing callers untouched |
| Client | `block_submission.js` + 7 controllers | submit raw input, render the server's verdict |
| Flashcards | `flashcards_controller.js` | last-card no-op fixed; session summary + persisted result |

**Vocabulary comes from `ContentEngine::LessonBlocks`.** A type not listed in
`BlockGrader::GRADABLE_TYPES` is engagement-only by default, so adding a block type can
never silently become "gates progression with no way to pass".

**Every new query eager-loads:** `RouteStep.includes(learning_route: { learning_profile: :user })`.

---

## 3. The approved amendment — the escape valve

For `check`, `drag_drop`, `fill_blank` only. After **3** failed submissions the block
stops gating, and:

```
WARN [BlockAttempt] RELEASED after 3 failures — the answer key is probably wrong.
     route=<id> step=<id> section_index=1 block_type=check
```

**`released_at` is a separate column from `correct`, and nothing conflates them:**

| | `correct` | `satisfied?` | `passed?` | `fsrs_rating` |
|---|---|---|---|---|
| Right answer | `true` | ✅ | ✅ | GOOD / HARD |
| Wrong, still gating | `false` | ❌ | ❌ | AGAIN |
| **Released after 3** | **`false`** | ✅ | **❌** | **`nil`** |
| Engagement-only | `nil` | ✅ | ❌ | `nil` |

**What a released block feeds: nothing.** `fsrs_rating` returns `nil` for it, and the
step's derived rating skips it. The reasoning, since you asked it to be justified: the
student failed three times, so `GOOD` would tell the scheduler they know the material —
false. But we believe the answer key is wrong, so `AGAIN` would punish them for our bug —
also false. **We genuinely learned nothing about their knowledge, so we record nothing.**
The row itself is the signal, and it is queryable (`scope :released`, partial index).

Retry stays unlimited after release; a later correct answer records normally.

---

## 4. Test counts

| Path | Before | After |
|---|---|---|
| `env -u RAILS_MASTER_KEY bin/rails db:test:prepare test` | 178 runs, 0F 0E | **201 runs, 568 assertions, 0F 0E** |
| `env -u RAILS_MASTER_KEY bin/rails test test engines/*/test` | 471 runs, **12 stable red** | **494 runs, 1393 assertions, 12 stable red** |

**The 12 did not grow.** Measured as the intersection of 3 consecutive runs, because a
single run is not a reliable measurement of this suite (see §1). Two consecutive final
runs both gave 3F 9E. `bin/rubocop`: 344 files, no offenses.

23 new tests: 15 grading/anti-cheat, 8 gating/FSRS. Including the ones you asked for —
per-type grading persisted, a falsified submission re-graded and rejected, a gated step
that cannot complete then unlocks the next through the existing tracker, and a flashcard
rating reaching `SpacedRepetition`.

---

## 5. Proof — real route, real endpoint, real HTTP

```
BEFORE — nothing attempted
  step 'Saludos básicos'  status=available  fsrs_state=fsrs_new  reps=0 stability=0.0 due=nil
  next 'Conversación básica'  status=locked
  block_attempts: (none)
  outstanding gating: 1:drag_drop, 2:flashcards

=== complete the step with the match block untouched ===
  HTTP 422  {"blocks_required":true,"sections":[1,2]}          <-- the gate holds

=== submit the match block INCORRECTLY (pairs swapped) ===
  {"correct":false,"score":0.0,"attempts":1,"released":false,"satisfied":false,"attempts_remaining":2}

=== submit it CORRECTLY ===
  {"correct":true,"score":100.0,"attempts":2,"released":false,"satisfied":true,"attempts_remaining":0}

=== rate the flashcard 'hard' ===
  {"correct":null,"score":null,"attempts":1,"released":false,"satisfied":true,"gradable":false}

AFTER the blocks, BEFORE completing
  step  status=available  fsrs_state=fsrs_relearning reps=3 stability=0.4 due="2026-08-12"
  next  status=locked
    idx=1 drag_drop   correct=true  score=100.0  attempts=2 satisfied=true  fsrs=2
    idx=2 flashcards  correct=nil   score=nil    attempts=1 satisfied=true  fsrs=2
  outstanding gating: none

=== complete the step now ===  HTTP 200

AFTER completing
  step 'Saludos básicos'      status=completed   reps=4 stability=0.4 due="2026-08-12"
  next 'Conversación básica'  status=available          <-- unlocked via RouteProgressTracker
```

Reading the FSRS line: the match block was right but only on the second attempt (HARD),
and the flashcard was self-rated hard (HARD). Worst-of is HARD, so the step is due
**tomorrow** rather than in several days. That is the behaviour you approved in §4 — one
still-hard card pulls the whole step forward.

---

## 6. Left for the other packages

Per the brief, untouched: **i18n of the partials** (`Terms`/`Definitions`/`Hard`/`Normal`/
`Easy`/`Reset`/`Output` in English, `Continuar`/`Reintentar` in Spanish), the **flashcards
UI redesign**, the **row-1 AI buttons missing `section_index`**, and the **visual block
printing its image prompt as body text**.

Noted as asked, not fixed: `drag_drop_controller.js:76` and `fill_blank_controller.js:28`
hardcode English feedback strings — I left both exactly as they were and added the submit
call alongside, so the sweep can replace them with the localized verdict the server now
returns. And `RouteProgressTracker#unlock_next_steps!` is dead per its own comment.

---

## 7. What surprised me

1. **`scenario` has no correct answer in the data model.** I expected the ungradable
   verdict to be a judgement call; it is not. `parse_heading_scenario` emits
   `{label, consequence}` with no correctness flag anywhere, so there is nothing to grade
   even in principle. Same for `simulation`. That made §2 of the design a reading
   exercise rather than a decision.
2. **`RouteProgressTracker#complete_step!` already hardcoded `GOOD`.** The FSRS feed did
   not need building — it needed *un-hardcoding*. One optional keyword replaced what I had
   budgeted as a parallel path.
3. **The gate belonged before the quiz, not after.** I initially wrote it after, matching
   the existing order, and it reads wrong: you get sent to the quiz having skipped half
   the lesson. The blocks are the lesson; the quiz is the check on it.
4. **My own tests made the suite flakier before they made it better** — 12 → 13 stable —
   by adding Spanish-locale integration requests to a suite with a pre-existing global
   `I18n.locale` leak. Worth knowing that "add a test that signs in a Spanish user" is
   currently a destabilising act in this codebase until `FINDINGS_WP10.md` §1 is fixed.
5. **A second `post "/sign_in"` in an integration test does not swap the user.** My
   ownership test passed for the wrong reason until I switched to `open_session` — the
   original session survived and the request ran as the owner, returning 200. Anywhere
   else in this suite doing multi-user testing that way is asserting nothing.
