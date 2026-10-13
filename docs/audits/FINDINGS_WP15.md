# WP-15 findings — out of scope, noted not built

Everything here was found while doing WP-15. None of it was built. Each entry says what
it is, why it was left, and what it would cost to do.

---

## 1. The answer key for `check` is in the DOM twice

`_check.html.erb` renders `data-correct="<%= opt[:correct] %>"` on **every** option, and the
wrapper carries `data-lesson-quiz-correct-value="<%= correct_index %>"`. A student who opens
devtools reads the answer off either one.

WP-15 §B removed the *positional* tell — the correct option is no longer likelier to be the
first row — but it deliberately did not touch this. `BlockGrader`'s own comment already
acknowledges it:

> This does not stop a student reading `data-correct="true"` out of the DOM. It stops our
> RECORDS being fiction, which is what FSRS and gap analysis consume.

**Why not now.** Withholding the key means `lesson_check_controller` can no longer paint the
correct option green synchronously; it has to wait for the server verdict, which changes the
feel of the interaction and needs a loading state, an offline story, and a decision about
what the block does when the POST fails. That is a package, not a line.

**Shape of the fix.** Drop both attributes. `submitBlock` already returns `correct` and
`score`; `announceResult` already dispatches it. `lesson_check#select` would render its
feedback from the response instead of from `btn.dataset.correct`, with an optimistic
"selected" state in between. Same for the `data-correct-def` on drag_drop terms, which is the
same leak in the match block: the server could return which pairs were right instead.

---

## 2. Three more callers for `BlockVariant`

The service is deliberately general — the seed is `(user, subject, index, attempt, salt)` and
nothing in it is specific to a lesson block. Three known callers:

| Caller | What it would permute | Note |
|---|---|---|
| Exam / step-quiz question order | `StepQuiz#questions.order(:created_at)` | Same seed shape; `attempt_number` from the existing quiz attempt count. |
| Flashcard order | `_flashcards.html.erb` renders `cards` in stored order | Cards are self-rated, so the "new after a failure" property matters less; "different per student" still does. |
| FSRS review order | `RouteProgressTracker` due-review list | Needs care: FSRS *order* is partly meaningful (due-first), so this would permute within a due bucket, not across buckets. |

None were built: each needs its own decision about what the attempt counter is, and two of
them do not have a `BlockAttempt` row to read it from.

---

## 3. The `PROGRESO` ring duplicates the HUD progress bar

`_sidebar.html.erb` renders an 88px SVG ring plus a linear bar plus "0/2 pasos"; the lesson
HUD at the top of the same page already renders a segmented progress bar and a counter. They
measure different things — the ring is route progress, the HUD is section progress within the
step — but they read as the same fact twice, and the ring is the tallest thing in the sidebar.

Not built because deciding which one survives is the owner's call, not a refactor.

---

## 4. `.lesson-nav-footer` is reserved for on every step page, including ones without it

`.step-page` now reserves `--lesson-footer-h + 1.5rem` at the bottom of the scroll. That
footer is rendered by `_lesson.html.erb` only — a `review` or `assessment` step has no fixed
footer and does not need the clearance. It costs 104px of empty space at the very bottom of
those pages, below the comments.

Fixing it means conditioning the padding on the step's content type, which the page does not
currently know at the wrapper level. Cheap, but it is a change to a template the measurement
was not taken against, so it is noted rather than done.

---

## 5. The keyboard path in `drag_drop` had never worked

Not out of scope — it was fixed — but worth recording because it is the kind of defect a
Rails test cannot see. The term element carried **two** `data-action` attributes:

```erb
data-action="dragstart->drag-drop#dragStart dragend->drag-drop#dragEnd"
...
data-action="keydown.enter->drag-drop#keySelect keydown.space->drag-drop#keySelect"
```

An HTML parser keeps the first and discards the second, so `keySelect` was never bound on a
term. The drop zones had no `keydown` binding at all. The block was therefore unusable
without a mouse, and `role="option"` / `tabindex="0"` advertised otherwise. Both fixed; the
browser proof in `WP15_HANDOFF.md` drives the block entirely through that keyboard path,
which is only possible because it now exists.

---

## 6. `lesson_check` and `lesson_quiz` derived the chosen option from DOM position

Also fixed rather than noted, for the same reason: `lesson_check_controller.js` preferred
`optionTargets.indexOf(btn)` over `data-option-index`, and `lesson_quiz_controller.js`
compared `optionTargets.indexOf(btn)` against `correctValue`, which is an index into the
*stored* options array. Correct while the two orders coincided; wrong the moment §B permuted
the board. Both now read `data-option-index` through one shared helper.

If a future package permutes anything else that is graded by index, that helper —
`originalIndexOf` in `block_submission.js` — is the thing to reuse.

---

## 7. `code_playground_controller` imports `submitBlock` but never submits

The controller imports `submitBlock` and `announceResult`, but no execution path calls either
one. Running code therefore does not persist the engagement event that WP-10's server tests
can accept. WP-15B left this alone because defining code-playground completion is separate
from making existing submissions distinguish whole answers from partial interactions.

---

## 8. Importmap audit has six pre-existing dependency findings

`bin/importmap audit` reports six findings: five moderate and one low. The exact pins are
Mermaid `11.16.0` in `config/importmap.rb:20` (four moderate, one low; fixed versions begin at
`11.16.1`) and DOMPurify `3.4.12` in `config/importmap.rb:23` (one moderate; the vulnerable
range includes `<=3.4.12`).

The owner explicitly classified these as pre-existing security debt outside WP-15B. This
branch does not modify `config/importmap.rb` or update either dependency.
