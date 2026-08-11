# WP-10 design — server-side grading for interactive blocks

**Status: awaiting approval. No implementation code written.**
Baseline before any change: path 1 = 178 runs 0F 0E · path 2 = 471 runs 8F 9E (17).

---

## 0. Premise, re-confirmed

```
flashcards       0 server calls / 58 lines      scenario          0 / 56
drag_drop        0 / 93                         simulation        0 / 87
fill_blank       0 / 49                         code_playground   0 / 207
lesson_check     0 / 127
```

677 lines of interaction, nothing leaves the browser. Confirmed independently before designing.

And the answer key is already in the DOM — `data-correct="true"` on check options,
`data-correct-def` on drag_drop terms, `answersValue` on fill_blank. So today the client both
holds the answers and decides the outcome.

---

## 1. Where results live

**A new table, `learning_routes_engine_block_attempts`.** One row per (user, step, section).

```
id            uuid pk
user_id       uuid  not null   -> core_users
route_step_id uuid  not null   -> learning_routes_engine_route_steps
section_index integer not null          # position in step.metadata["parsed_sections"]
block_type    string  not null          # from ContentEngine::LessonBlocks — see §6
payload       jsonb   default {}        # what the student submitted
correct       boolean                   # NULL for types that are not gradable
score         decimal(5,2)              # NULL for non-scored
attempts      integer default 1
completed_at  datetime
timestamps

unique index (user_id, route_step_id, section_index)
index (route_step_id)
index (user_id, completed_at)
```

### Why not `assessments_user_answers`

It is keyed to `question_id` with `unique (user_id, question_id)`, and there is no
`Assessments::Question` for a lesson block. Using it would mean synthesising a Question row per
block, which (a) puts lesson content into the assessments domain where it does not belong,
(b) needs a reconciliation story every time `parsed_sections` is regenerated, and (c) buys nothing —
the assessments tables exist to back `Assessment`/`AssessmentResult`, which blocks do not have.

### Why not `route_steps.metadata`

Two reasons, the second decisive:

1. It is unqueryable in practice. "Which block do students fail most?" becomes a jsonb scan.
2. **`parsed_sections` is rewritten after the fact.** `ContentEngine::MediaPrefetchJob#apply_results!`
   mutates `metadata["parsed_sections"]` to attach `image_url` and audio state, and
   `ContentPipelineJob` rewrites the whole key on regeneration. Storing attempts there puts student
   results in a structure the pipeline overwrites.

### Section-index stability

`MediaPrefetchJob` mutates entries **in place by index**, so indices are stable for the life of the
content. They are *not* stable across a content regeneration. `block_type` is therefore stored on
the attempt and re-checked on read: if the type at that index no longer matches, the attempt is
treated as stale and ignored rather than mis-attributed.

---

## 2. The grading table

| Type | Student submits | Server checks against | "Passed" means | Gradable? |
|---|---|---|---|---|
| `check` | chosen option index | `options[i]["correct"]` in the stored section | the chosen option is the correct one | ✅ **objective** |
| `drag_drop` | map of term index → definition index | the `pairs` array (index *i* pairs with *i*) | every pair matched | ✅ **objective** |
| `fill_blank` | array of typed strings | `blanks` array, normalised (case/accent/whitespace) | every blank matches | ✅ **objective** |
| `flashcards` | per-card self rating hard/normal/easy | nothing — it is self-report | every card rated | ⚠️ **self-reported** → feeds FSRS |
| `scenario` | chosen option index | **no correct answer exists** — parser emits `{label, consequence}` only | an option was chosen | ❌ **engagement only** |
| `simulation` | variable values explored | **no correct answer exists** — parser emits `{variables, formula}`, there is no question | the student moved a variable | ❌ **engagement only** |
| `code_playground` | that they ran the code | `expected_output`, which is frequently `nil` and is free prose when present; **execution happens in the browser sandbox**, the server never sees it | the code was run at least once | ❌ **engagement only** |

Being blunt about the bottom three, as asked: inventing a score for them would be worse than not
having one. `scenario` and `simulation` have no correct answer *in the data model* — that is not an
oversight in the controllers, the parser genuinely emits no correctness flag. `code_playground`
could in principle be graded, but only by running untrusted code server-side (a package of its own,
and `AUDIT.md` §9 already scopes Pyodide/Judge0 for that). All three still record **engagement**,
which §3 uses.

---

## 3. Gating policy — **this is the decision to approve**

Goal quoted by the owner: steps *"se despliegan hacia abajo y se van desbloqueando 1 por 1"*.
Today only the step quiz gates; every block is skippable.

**Proposed policy — one line per block type, amend any line:**

| # | Block | Must be done before the step can be completed? | On a wrong answer |
|---|---|---|---|
| 1 | `check` | **Yes — answered correctly** | retry freely |
| 2 | `drag_drop` | **Yes — all pairs matched** | retry freely |
| 3 | `fill_blank` | **Yes — all blanks correct** | retry freely |
| 4 | `flashcards` | **Yes — every card rated** (no correctness bar) | n/a |
| 5 | `scenario` | **Yes — an option chosen** | n/a, all options valid |
| 6 | `simulation` | No — recorded, never blocks | n/a |
| 7 | `code_playground` | No — recorded, never blocks | n/a |
| 8 | step quiz | **Yes — unchanged**, the existing final gate | existing retry flow |

**Retry freely, deliberately.** A limit would be security theatre: the answers are in the DOM, so a
retry cap punishes the honest student and inconveniences nobody else. The value of grading here is
the *signal* — FSRS input and gap analysis — not gatekeeping. Say the word if you want a cap and
I will add one, but I would not.

**Ungradable blocks 6 and 7 do not block.** Requiring a student to "interact with a simulation"
before advancing means a student who read it and understood it is stuck behind a slider. Blocks 5
does block, but only on *choosing*, which is the entire interaction.

**The trade-off you are approving,** stated plainly: with 1–3 gating on correctness, a step becomes
un-completable if the AI generated a malformed block — a `fill_blank` whose answer cannot be typed,
a `drag_drop` with one pair. That is a real risk on AI-generated content.

**Mitigation, built in:** the server fails *open on data quality* and *closed on student effort*. If
the stored section cannot be graded (missing `options`, empty `pairs`, no `blanks`), the block is
downgraded to engagement-only automatically and logged. A student is never trapped by our
generation bugs; they are only held by questions that actually work.

---

## 4. The FSRS feed

Verified against the real signature, not assumed:

```ruby
LearningRoutesEngine::SpacedRepetition#review(step, rating) -> Hash   # of fsrs_* attributes
AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4
# caller does: step.update!(spaced_repetition.review(step, rating))
```

`RouteProgressTracker#complete_step!` already calls this, **hardcoded to `GOOD`**.

**What each block contributes:**

| Source | FSRS rating passed |
|---|---|
| `flashcards` self-rating | `hard → HARD(2)`, `normal → GOOD(3)`, `easy → EASY(4)` |
| flashcards session → step | the **worst** rating across the cards |
| objective blocks (1–3) correct first attempt | `GOOD(3)` |
| objective blocks correct after ≥1 wrong attempt | `HARD(2)` |
| any objective block never answered correctly | `AGAIN(1)` — cannot happen under §3, kept for the ungated path |

**Change to existing machinery, kept surgical:** `complete_step!(step)` gains an optional
`rating:` keyword defaulting to `SpacedRepetition::GOOD`, so today's callers are untouched and the
block-aware path can pass the derived rating. Worst-rating rather than average is deliberate: a step
containing one card you found Hard is not a step you know Easily, and FSRS scheduling should be
conservative.

---

## 5. Anti-cheat, proportionate

**The server re-grades every submission against `step.metadata["parsed_sections"][section_index]`,
which it already holds.** The client's claim about correctness is discarded, not trusted; only the
raw submission (which option, which pairing, which strings) is read from the request.

| Prevents | Does not prevent |
|---|---|
| Forging `correct: true` in the request | Reading `data-correct="true"` from the DOM before answering |
| Editing a stored result afterwards | Using devtools to see the answer key |
| Submitting for another user's step (ownership is checked) | — |
| Replaying a stale section index (type is re-checked) | — |

Withholding the answer key from the DOM is a rewrite of all seven partials plus the parser contract,
and it is not worth it here: this is a personal learning tool, and the student cheating themselves
costs them the FSRS accuracy they came for. What matters is that **our records are honest**, so gap
analysis and scheduling run on real data. That is what re-grading buys.

---

## 6. Shape of the implementation (for the approval to be informed)

- **1 migration + 1 model** — `BlockAttempt` as above.
- **1 endpoint** — `POST /routes/:route_id/steps/:id/blocks/:section_index`, nested inside the
  existing steps resource, mirroring `step_quizzes#submit`: authenticate, `authorize_route_owner!`,
  re-grade, persist, respond with a turbo_stream result state.
- **1 grader** — `BlockGrader`, dispatching on `block_type`. It reads the vocabulary from
  `ContentEngine::LessonBlocks`, **not** a new list. A block type with no grader entry is
  engagement-only by default, so adding a block type to `LessonBlocks` can never silently become
  "gates progression with no way to pass".
- **7 Stimulus controllers** gain a submit + a rendered result state; `flashcards_controller.js`
  additionally gets the end-of-session summary its `nextCard()` currently no-ops
  (`// All cards done - could restart or show summary` at 4/4).
- **`StepsController#complete`** gains the block gate alongside the existing `requires_quiz?` gate.
- Every new query eager-loads: `RouteStep.includes(learning_route: { learning_profile: :user })`.

---

## 7. Noted, not built (each its own package)

Seen while reading; explicitly out of scope per the brief:

- **i18n of the partials.** Hardcoded English `Terms`, `Definitions`, `Hard`, `Normal`, `Easy`,
  `Reset`, `Output`, and hardcoded **Spanish** `Continuar` / `Reintentar` — both languages wrong for
  half the users, in the same files.
- **Flashcards UI redesign.**
- **Row-1 AI buttons not passing `section_index`.**
- **The visual block printing its own image prompt as body text.**
- New, found during this read: `drag_drop_controller.js:76` and `fill_blank_controller.js:28`
  hardcode English feedback strings (`"All matched correctly!"`, `"All blanks filled correctly!"`)
  — same i18n sweep.
- New: `RouteProgressTracker#unlock_next_steps!` is dead (superseded by the inlined loop in
  `complete_step!`, per its own comment). Deletion candidate for the dead-code package.

---

## Approve, amend, or reject

The parts I most expect you to want to change:

1. **§3 rows 5 and 6–7** — whether `scenario` should gate, and whether `simulation` /
   `code_playground` should gate on engagement.
2. **§3 retry policy** — I propose unlimited; a cap is a one-line change if you disagree.
3. **§4 worst-rating** — versus average, for the flashcard → FSRS mapping.
