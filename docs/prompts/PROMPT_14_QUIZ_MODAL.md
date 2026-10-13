# PROMPT 14 — WP-21: the quiz modal renders nothing, so no lesson can be finished

> Run from `~/Documents/Learning-routes`, on `main` (already carries the WP-18 + WP-19 merges).
> Branch as `wp21-quiz-modal`.
> **This is a production blocker.** Every lesson with a `check` block past section 0 is
> impossible to complete. Fix it before anything else in the roadmap.

---

## The defect, diagnosed from the live DOM

Reported symptom: the student completes every block, presses Continuar, and the footer stays on
"Responde para continuar" forever.

Read from the deployed page, on the step that blocks:

```
contador: "15/18"                    → controller advanced to section index 14
visible:  13                         → the DOM still shows section 13
modales:  ["flex", "none"]           → the section-14 quiz modal IS open
```

and, on that open modal:

```
display: flex   opacity: 1   visibility: visible   z-index: 9990   position: fixed
rect:    [0, 0, 0, 0]                ← zero width, zero height
window:  [852, 835]
opciones: 5
texto:   "DESAFÍO RÁPIDO ¿Cuál significa \"por favor\"? … A thank you B help C please D sorry …"
```

The modal has its full content — question, four options, explanation, XP bonus — and occupies no
pixels.

**Cause.** `interactive_lesson_controller.js` has a dedicated path for `check` sections:

```js
// Mark the check section as current (for progress tracking)
// but don't visually transition — modal overlays the current content section
modal.style.display = "flex"
```

The intent is right: on reaching a quiz, don't swap sections — leave the lesson content in place
and overlay the modal. That is why the counter advances to 15/18 while section 13 stays on screen.

But the modal is rendered **inside** its own `.lesson-section`, by `_check.html.erb` within the
section loop of `_lesson.html.erb`, and that loop renders every section after the first with

```erb
style="<%= i > 0 ? 'display:none;' : '' %>"
```

So the check's section is `display:none` — by design, since nothing ever transitions to it — and
the modal is a descendant of a `display:none` ancestor. The browser renders no part of that
subtree, whatever the descendant's own styles say. `getComputedStyle` still reports the modal's
own declared values (`display:flex`, `opacity:1`, `visibility:visible`), which is why this looks
healthy from every angle except the one that matters: `getBoundingClientRect()`.

Confirm all of the above yourself before changing anything.

## Why no test caught it

Everything server-side is correct and was verified: `BlockGrader`, `BlockAttemptRecorder` (the
attempt is recorded, `completed_at` set), the `satisfied` field in the JSON, the `block:graded`
listener, and the `data-gating` / `data-block-satisfied` contract. The student's own DOM shows six
of eight gating blocks satisfied. **The only thing wrong is that one element has no size**, and a
Rails test does not compute layout.

This is the concrete argument for the browser test WP-4 keeps deferring. Treat that as part of
this package, not a follow-up — see Tests below.

## What to build

Decide between these two and defend the choice; do not do both:

1. **Render the check modals outside the sections.** `_lesson.html.erb` emits them after the
   section loop, still inside the `interactive-lesson` controller element so
   `data-interactive-lesson-target="quizModal"` still resolves. Declarative, no runtime DOM
   surgery, and it cannot regress when someone changes the stepper.
2. **Portal the modal to `document.body` on open** and restore it on close. Smaller diff, but it
   adds runtime DOM movement and a cleanup path that can leak a modal into `body` if an exception
   lands between open and close.

Prefer 1 unless you find a reason it breaks the quiz controller's wiring — `lesson-check` and
`lesson-quiz` are instantiated on elements inside the modal, and Stimulus does not care where in
the controller's subtree they sit. Verify that rather than assuming it.

Whichever you pick, handle:

- **The progress bar and counter.** `_updateProgressForQuizModal` already advances the counter
  without a transition; make sure it still agrees with what the student sees.
- **Closing.** `_closeQuizModal` sets `display:none` after a 300ms exit. That must still work, and
  the modal must not be left orphaned outside its section if you chose 2.
- **More than one check.** This lesson has two adjacent check sections (14 and 15). Reaching the
  second immediately after the first must open the right modal, not the stale one.
- **`_activeQuizModal`** bookkeeping, which decides which modal `_closeQuizModal` acts on.

## The students already stuck

Attempts are recorded per `(user, route_step, section_index)`. Anyone who reached a check block
before this fix has an unsatisfiable gate and cannot finish that step. Report how many
`BlockAttempt`-less `check` sections sit behind a completed-but-blocked step in production, and
say whether anything needs to be done for them beyond the fix. Do **not** mass-mutate production
data; state the option and let the owner decide.

## Hard constraints

1. **Do not deploy.** A human deploys.
2. Do not change the WP-10 gating policy, `BlockGrader`, or `BlockAttemptRecorder`. They are
   correct; the bug is purely in where the modal lives in the DOM.
3. Do not "fix" the four known engine failures. Report the count before and after, intersection of
   3 runs.
4. `env -u RAILS_MASTER_KEY` before every `bin/rails test`, one suite per process.
5. Every new string through I18n in both locales; theme variables, not hex.

## Tests

The unit test is not the point here — a passing unit test is what let this ship. Build the net:

- **A real browser test** that loads a lesson containing a `check` past section 0, advances to it,
  and asserts the quiz modal has a non-zero `getBoundingClientRect()` and that its options are
  clickable. Capybara with a headless driver is already in the Gemfile — `Capybara starting Puma`
  appears in the current suite output, so the harness exists.
- **A generalized version of that assertion**: for every block type in
  `ContentEngine::LessonBlocks`, render a lesson containing it and assert the block's own
  container has non-zero width and height once it is the current section. That is the class of
  defect — "present in the DOM, zero pixels on screen" — and it is invisible to every other test
  in this codebase.
- A test that answering the quiz satisfies the gate and the footer unlocks.

## Reporting back

Print only: your confirmation of the cause from the DOM, which of the two fixes you chose and
why, what the generalized zero-size assertion covers, the production count of stuck steps, and
both test counts. Everything else to `WP21_HANDOFF.md`.

**Verify your report against the code before printing it.**
