# PROMPT 04 — WP-6: close the block contract

> Run from `~/Documents/Learning-routes`, on top of `wp5-real-curricula`.
> Reference: `AUDIT.md` §P1-2, §P1-5, §P1-8 and the capability matrix in §8.

---

## Why this is now urgent

WP-5 worked, and that is exactly what made this a fire. The curricula it produces now plan
subject-appropriate exercises. Of the 12 exercise types in the two verified curricula, **10 have no
partial, no parser branch, no renderer entry**. They will reach the student as literal `:::tap_pairs`.

Before WP-5 this was invisible: everyone got the same template of passive prose blocks.

## The two facts this package turns on

**Ten types the prompts request that the app cannot render:**
`tap_pairs`, `listen_and_type`, `word_bank`, `translate_sentence`, `speak_sentence`,
`terminal_exercise`, `output_prediction`, `bug_fix`, `code_completion`, `code_challenge`.

**Six types the app fully implements that the prompts never request** — verified: parser branch,
partial, and Stimulus controller all present for each:
`drag_drop`, `code_playground`, `simulation`, `scenario`, `visual`, `audio`.

So this is **not** "narrow the prompts and lose the product". It is a reallocation. Note also that
`audio` was previously broken by the unshared `storage/` (§P3-3) — WP-1 added the named volume, so
it should work now. Verify that rather than assuming it.

## Scope boundary — read carefully

This package makes sure **nothing reaches a student broken**. It does **not** add server-side
grading. `AUDIT.md` §P1-9 is real — none of the interactive blocks are graded server-side, so FSRS
and gap analysis stay starved — but that is WP-10, and mixing it in here will produce a change
nobody can review. Note anything you find; do not build it.

## Hard constraints

1. **Do not deploy.**
2. Scope: P1-2 (the contract), P1-5, P1-8. Anything else → `FINDINGS_WP6.md`.
3. **Do not build any of the 10 dead types.** That is WP-10, and it must come with grading.
4. Do not "fix" the 14 red engine tests from `FINDINGS_WP2.md §1`. Report the count before and
   after; it must not grow.
5. Do not touch `CurriculumBrain`'s validation or the WP-5 schema work beyond what the contract
   requires.
6. Phases: read → design → change → prove.

---

## PHASE 1 — Read

- `config/prompts/lesson_content.yml` (386 lines) and `curriculum_design.yml` (242) **in full**.
  `AUDIT.md` §7 rates these as the best asset in the repo — Bloom progression, prerequisite graphs,
  subject-family branching, explicit translation contracts. **The prompts are not the problem; the
  consumers are.** Change the vocabulary, preserve the pedagogy.
- `lesson_section_parser.rb` — every branch, and how unknown types degrade to `concept`
- `markdown_renderer.rb:65-71` (`INTERACTIVE_BLOCKS`) and `:119` (`next _match unless config`) —
  the line that leaks raw `:::` to the student
- All 13 partials under `steps/lesson_sections/`
- The 9 Stimulus controllers they bind. §7 verified every `data-action` resolves to a real method —
  confirm that still holds; it is the part that already works.
- `prompt_builder.rb:60-90` — especially the `gsub!` at `:71-77`
- `content_pipeline_job.rb:56` — where `content_error` is written and never read
- The `AiModelConfig::TASK_TYPES` / `SUPPORTED_MODELS` invariant tests from WP-5 — your contract
  test should follow that shape, and heed the lesson recorded in `WP5_HANDOFF.md`: **subset
  assertions are one-directional.** Assert both directions and well-formedness.

## PHASE 2 — Design the contract, then show me

Before writing it, decide and justify in `WP6_CONTRACT.md`:

1. **Where the single source of truth lives.** One declaration of the supported block vocabulary,
   consumed by prompts, parser, renderer, and partial lookup. Prompts are YAML — decide whether the
   vocabulary is injected into them at build time or validated against them by a test, and say why.
2. **What the contract test asserts.** At minimum, all four links, in both directions:
   - every type a prompt may request has a parser branch
   - every type the parser emits has a renderer entry
   - every renderer entry has a partial
   - every partial's `data-action`s resolve to real controller methods
   A drift in any link must fail, with a message that names the offending type and the missing link.
3. **The replacement map**, per subject family, with a one-line pedagogical rationale each. The
   language family loses the most on paper, so be concrete about what carries its weight —
   e.g. `audio` for listening, `scenario` for conversation, `drag_drop` for word order,
   `fill_blank` for cloze, `flashcards` for vocabulary. A language course must still be a language
   course when you are done. If you conclude some capability genuinely cannot be preserved, say so
   plainly rather than papering over it.

## PHASE 3 — Changes

### §A · The contract (P1-2)
Implement §2. The test is the deliverable — the vocabulary change is worthless without something
that stops it drifting again in three months.

Also fix `markdown_renderer.rb:119`: an unknown block must never render its raw `:::` marker to a
student. Decide the failure mode — drop it, render a neutral placeholder, or log and skip — and
justify it. Silent leakage is not an option.

### §B · Rebalance the vocabulary
Apply the replacement map to `lesson_content.yml` and `curriculum_design.yml`. Remove the 10 dead
types; introduce the 6 built ones with the same care the existing prompts show. Keep the Bloom
progression, the prerequisite logic and the subject-family branching intact.

### §C · P1-5 — the language directive
Only 3 of 17 templates carry `{{language_directive}}`, and `prompt_builder.rb:71-77` applies it with
`gsub!`, a no-op when the token is absent — so 14 templates get **no locale instruction at all**.
That is why Spanish learners get English quizzes. Append the directive when the token is missing
rather than only substituting it, and add the token to all 17. On a Spanish-first product this is
high user-visible value for very little work.

### §D · P1-8 — stop re-billing failures
`content_error` is written at `content_pipeline_job.rb:56` and never read. The student sees a
skeleton, then a timeout; refreshing re-enqueues the same failing pipeline and pays again. Read it
in the view, show a localized failure state, and gate re-enqueue behind a backoff/attempt counter.

### §E · Tests
The contract test from §A. A test that a Spanish request produces a prompt carrying the Spanish
directive, for a template that previously lacked the token. A test that a failed pipeline renders
the error state and does not re-enqueue immediately.

Report both suites, before and after:
```bash
bin/rails db:test:prepare test          # was 126 runs, 0F 0E
bin/rails test test engines/*/test      # was 419 runs, 5F 9E
```

## PHASE 4 — Prove it end to end

Mocks will not settle this either. Using the two curricula WP-5 already produced (Portuguese for
Spanish speakers; Recursion in Python):

1. Generate **real lesson content** for at least two steps of each — one language, one technical.
2. Run that content through the **real parser and the real renderer**.
3. Show the rendered output contains **zero literal `:::` markers**, and print the section types
   each lesson actually produced.
4. Confirm the Spanish lesson is in Spanish, including its quiz.
5. Confirm `audio` renders and its file is reachable — this is the first real test of WP-1's shared
   volume.

If any `:::` marker survives to the renderer, the contract is not closed. Say so.

Write `WP6_HANDOFF.md`: the contract design and where it lives, the replacement map with rationale,
both test counts, the rendered proof, what you left for WP-10, and anything that surprised you.

## Reporting back

Print only: the replacement map as a table, both test counts, the rendered section types for both
lessons, and confirmation that zero `:::` markers survived. I will read the handoff myself.
