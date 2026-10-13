# PROMPT 15 — WP-22: a lesson still cannot be finished, plus six defects seen in production

> Run from `~/Documents/Learning-routes`, on `main` (carries WP-18, WP-19, WP-21).
> Branch as `wp22-lesson-completion`.
> **Still a production blocker.** WP-21 gave the quiz modal a size; the lesson still cannot be
> completed. Everything below was observed on the deployed site this morning, with the network
> log and response bodies quoted.

---

## §A — The refusal mounts a second, empty copy of the lesson controller

**Evidence.** The server's 422 body, captured verbatim from the live site:

```html
<turbo-stream action="replace" target="step-complete-feedback"><template>
  <div id="step-complete-feedback" data-controller="interactive-lesson"
       data-outstanding-sections="[14,15]" style="...">
    Completa los 2 ejercicios de arriba para terminar esta lección.
  </div>
</template></turbo-stream>
```

`data-controller="interactive-lesson"` on the feedback div. Stimulus mounts a **second**
`interactive-lesson` controller on an element with no sections, no
`total-sections-value`, no targets.

Observed consequence, from the console on the deployed site:

```
seccionesEnElDOM: 0
POST .../complete 422
  completeLesson @ interactive_lesson_controller.js:987
  nextSection    @ interactive_lesson_controller.js:220
```

`nextSection` on that phantom computes `currentSection + 1 (=1) >= totalSections (=0)` and calls
`completeLesson()` immediately. That POSTs `complete`, gets another 422, and the response mounts
another phantom. After the first refusal every Continuar click only re-fires the refusal.

From the student's side the page simply stops responding — which is what the owner has been
reporting as "no matter what I complete, it blocks".

**Fix:** the feedback div is a message. Establish what that `data-controller` was meant to do
(read `show_outstanding_blocks.turbo_stream.erb` and the commit that introduced it) and either
remove it or replace it with a controller that only highlights the outstanding sections. Then make
the phantom impossible rather than merely absent: `interactive-lesson` must refuse to act when it
has no sections — an early return in `connect()` when `sectionTargets.length === 0`, or a required
value with no sane default. Defend which.

## §B — Sections 14 and 15 never receive a submission

**Evidence.** A full instrumented play-through on the deployed site. Every `fetch` to
`/blocks/` and `/complete` was logged:

```
POST …/blocks/4  → 200 {"correct":true, "satisfied":true,  "gradable":true}
POST …/blocks/7  → 200 {"correct":null, "satisfied":true,  "gradable":false}
POST …/blocks/8  → 200 {"correct":true, "satisfied":true,  "gradable":true}
POST …/blocks/10 → 200 {"correct":true, "satisfied":true,  "gradable":true}
POST …/blocks/11 → 200 {"correct":null, "satisfied":true,  "gradable":false}   (×3)
POST …/blocks/13 → 200 {"correct":null, "satisfied":true,  "gradable":false}
POST …/complete  → 422 {"blocks_required":true,"sections":[14,15]}
```

Six blocks recorded correctly. **Sections 14 and 15 — both `check` — produced no request at all.**
Not a failed one: none. The student traversed the lesson and those two quizzes were never answered.

The server is right to refuse. The question is why the student never got to answer.

**Reproduce it in the harness WP-21 just built** — `test/system/lesson_block_visibility_test.rb`
already drives a lesson to a `check` section. Extend that path: build a lesson whose sections
mirror the failing one (index 13 `flashcards`, 14 `check`, 15 `check`, 16 `tip`, 17 `summary`),
complete the flashcards, press Continuar, and assert:

1. the quiz modal for section 14 becomes visible with non-zero size,
2. answering it POSTs to `/blocks/14` and the response is `satisfied: true`,
3. the student cannot advance past 14 until that happens,
4. the same for 15,
5. and only then does `complete` succeed.

Whichever of those fails first is the defect. Candidates worth checking, in order — but let the
test tell you rather than picking one:

- `_showQuizModal` deliberately does not transition sections. Confirm what advances past a check
  once the modal is dismissed, and whether dismissing counts as passing.
- `_locked = gates && !satisfied && !(isCheck && isAnswered)` — `isAnswered` is a **local** flag.
  If it is set anywhere other than a recorded answer, the client unlocks on a claim the server
  never saw, which is precisely the shape of this bug.
- `_detectQuizLock(index)` runs on transition; check it is reached for a check section at all,
  given the check path does not transition.

## §C — Five more, all confirmed on the deployed site

Console output from a single lesson view. None is the blocker; all are real.

1. **`hover_controller` does not exist.** `Failed to autoload controller: hover` —
   `app/views/profiles/show.html.erb:147` declares it and no file backs it. Found by the audit,
   now confirmed in production.
2. **Mermaid diagrams are broken in every lesson.** `[mermaid-diagram] Render failed: No diagram
   type detected` — the text handed to mermaid is the **generated CSS**, not the diagram source.
   Read `mermaid_diagram_controller.js:63` and find what it is passing.
3. **Confetti is blocked by CSP.** `Creating a worker from 'blob:…' violates … "script-src"`.
   `worker-src` is not declared, so it falls back to `script-src`. The celebration on a correct
   answer never fires. Decide whether to allow `worker-src blob:` or drop the worker.
4. **Four inline event handlers are blocked by CSP** on the step page. Find them; something on
   that page uses `onclick=` and does nothing when clicked. Report what, because it may be
   another dead control.
5. **The tutor chat stream 404s.** `GET /turbo-stream?stream=tutor_chat_step_… → 404`, repeatedly.
   Tutor replies never arrive live.

## §D — Two UX defects that made this hard to diagnose

1. **The refusal is invisible.** The server answers correctly and the client renders the message,
   but into a container the student is not looking at. Put it where the action was.
2. **"Completar paso" is pressable from section 0.** It should be disabled until the step is
   completable, or take the student to the first outstanding section. `data-outstanding-sections`
   is already in the response — use it.

## Hard constraints

1. **Do not deploy.**
2. Do not change `BlockGrader`, `BlockAttemptRecorder`, or the WP-10 gating policy. They are
   correct: six of eight blocks recorded perfectly in the log above.
3. Do not undo WP-21. The modals are outside the sections and that is verified working —
   `dentroDeSeccion: false` on the live site.
4. Do not "fix" the four known engine failures. Report before and after, intersection of 3 runs.
5. `env -u RAILS_MASTER_KEY` before every `bin/rails test`, one suite per process.

## Tests

- The §B sequence above, in the browser harness, as one end-to-end test: a lesson with two
  adjacent checks is completable **only** after both are answered, and `complete` returns success.
- A test that an element carrying `data-controller="interactive-lesson"` with no sections does
  nothing when its actions fire — the phantom cannot re-enter `completeLesson`.
- A regression test for whichever specific cause §B turns up.

## Reporting back

Print only: what §B turned out to be, in one paragraph, with the assertion that now fails without
the fix; the §A decision; and both test counts. Everything else to `WP22_HANDOFF.md`.

**Verify your report against the code before printing it.**
