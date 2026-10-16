# WP-24 — The Unfinishable Lesson

Branch: `wp24-unfinishable-lesson`, off `main` after `wp22-lesson-completion` is merged.

**This goes BEFORE WP-23.** WP-23 is real, but none of its six defects stops a student from
finishing a lesson. All three below do, and §1 is the one the owner hit in production today:
progress updates, navigation works, and the lesson still cannot be completed no matter how
correctly it is answered.

Found by testing the live site after the WP-22 deploy, not by reading code. Every claim here
is grounded in a specific line — check each one before you touch it.

---

## §1 — The quiz timer records nothing, and disables the only path that would

**This is the blocker. Everything else in this file is secondary.**

`app/javascript/controllers/lesson_quiz_controller.js:119-142`, the timeout branch:

```js
if (this._secondsLeft <= 0) {
  this._stopTimer()
  // Timer ran out — auto-unlock but no XP
  this._answered = true
  this._markBonusMissed()

  this.optionTargets.forEach((opt) => {
    opt.style.pointerEvents = "none"        // ← options are now dead
    opt.style.opacity = "0.6"
    ...
  })

  this.element.dispatchEvent(new CustomEvent("quiz:completed", {
    bubbles: true,
    detail: { correct: false, timeout: true }
  }))
}
```

`submitBlock` is **never called here.** The only call site for a check is
`lesson_check_controller.js:86`, inside `select()`, which fires on **click** — and this
branch has just set `pointerEvents: "none"` on every option, so the student can never click
one. Two controllers share the element; the one that times out is not the one that submits.

The consequences, in order:

1. No `BlockAttempt` row is ever written for that check.
2. `outstanding_blocks_for` therefore never clears it.
3. `POST /complete` refuses with `422 {"blocks_required": true, ...}` forever.
4. WP-22's `_showOutstandingBlocks` faithfully sends the student **back to that same check**,
   whose options are dead and whose timer already expired.
5. Loop. There is no exit. The step can never be completed by anyone who lets one timer run
   out even once.

Note what the comment says: *"auto-unlock but no XP"*. It unlocks the **client** —
`_answered = true` feeds the local `isAnswered` in the navigation lock — while the
**server** is never told anything. That is the same client-believes-server-doesn't split
that caused the WP-21 regression, in a second place. WP-22 fixed one instance of this
pattern. This is the other one.

### What to do

A timeout is an outcome, not an absence of one. Record it.

On expiry, submit the attempt with no chosen option before disabling anything:

```js
submitBlock(this.element, { option_index: null, timed_out: true }, { complete: true })
  .then((r) => announceResult(this.element, r))
```

`BlockGrader#grade_check` already handles this correctly —
`return graded(false, 0) if chosen.nil?` — so a timeout grades as wrong, scores zero, and
**satisfies the gate**. That is the right behaviour: `BlockAttempt::RELEASE_AFTER = 3` exists
precisely so a student who cannot get it right is not trapped. A timeout that records
nothing bypasses that release entirely.

Check whether `lesson_quiz_controller` can reach `submitBlock` directly or whether the
timeout should dispatch to `lesson_check_controller` and let *it* submit. Prefer the second:
one submitter per block, as `block_submission.js` was designed for. Two controllers both
POSTing to the same endpoint is how this class of bug gets made.

While you are there, audit the **other** exit paths of both controllers for the same hole.
The question to ask at every branch that ends a block: *does the server find out?*

### The test that prevents the class

The class is **"a block reaches a terminal state without telling the server"**. Not "the
timer does not submit."

```ruby
# test/system/block_terminal_states_test.rb
```

For every gating block type, drive each way it can end — answered right, answered wrong,
timed out, skipped, released after three failures — and assert a `BlockAttempt` exists with
`completed_at` present after each. Database, not DOM. WP-22's `lesson_completion_test.rb`
is the pattern; extend it rather than starting over.

The timeout case must fail today. Freeze or stub the clock — do not make CI wait 15 seconds.

---

## §2 — `parse_heading_scenario` has no terminator, so the last option eats the rest of the lesson

**This is the real cause of WP-23 §6.** Mermaid was never the problem.

`engines/content_engine/app/services/content_engine/lesson_section_parser.rb:399-418`:

```ruby
text.lines.each do |line|
  stripped = line.strip
  if stripped.match?(/\AOPTION\s+[A-Z][:.]?\s*/i)
    label = stripped.sub(/\AOPTION\s+[A-Z][:.]?\s*/i, "").strip
    current_option = { label: label, consequence: "" }
    options << current_option
  elsif current_option
    current_option[:consequence] = [current_option[:consequence], stripped].reject(&:empty?).join(" ")
  else
    situation << stripped
  end
end
```

There is no terminator. Once the last `OPTION X` line is seen, **every remaining line of the
body is appended to that option's consequence, forever** — headings, fenced code blocks,
prose, all of it. No check for `##`, no check for ` ``` `, nothing.

Observed in production on `/learning/routes/60452d4b…/steps/3700fee4…`: picking option B
("He have coffee") reveals a Result containing the word `Consequence.` followed by an entire
mermaid `sequenceDiagram` fence and its Spanish explanation, with every newline collapsed
into a space and the `**bold**` markers printed literally.

Two separate things are broken and they compound:

1. **The `.join(" ")`** flattens newlines. Mermaid is newline-sensitive, so even if this text
   reached a renderer it could never draw. This is why the diagram "never worked in any
   lesson" — the source never survived parsing.
2. **`scenario_controller.js:30`** does `this.consequenceTextTarget.textContent = consequence`.
   `textContent`, so no markdown, no fences, no diagram — literal characters. The content is
   printed raw at the student.

Option A shows only the bare word `Consequence.` because it is not the last option: it
captured the one stray line before the next `OPTION` marker and nothing else. So the correct
answer gets an empty result and the wrong answer gets a wall of garbage. That is backwards
in the most visible possible way.

### What to do

Give the loop a terminator. An option's consequence ends at the first line that is a
markdown heading (`^#{1,6}\s`), a fence delimiter (` ``` `), a horizontal rule, or the next
`OPTION` marker. Everything after the option list belongs back in the section body, where
`MarkdownRenderer` will find the fence and emit the mermaid container it already knows how
to emit (`markdown_renderer.rb:18-26`).

Then decide what the consequence field is allowed to be. If it is prose, render it through
`MarkdownRenderer` instead of assigning `textContent`, and sanitize. If it is one plain
sentence, keep `textContent` and make the parser guarantee that. Do not leave a field that is
sometimes a sentence and sometimes a document.

Two more things visible in the same screenshots — fix them here since you are in the file:

- The scenario shows the **same** result whether the student picks right or wrong, and offers
  "Try Again" after a correct choice. The parser produces no `correct` flag on scenario
  options at all. `scenario` is deliberately engagement-only in `BlockGrader`
  (`GATING_TYPES` but not `GRADABLE_TYPES`), which is a fine design — but then the UI must
  not imply there is a right answer to retry toward. Either mark correctness and grade it, or
  drop "Try Again" and present the consequence as an outcome. Pick one and say which in the
  commit.
- `Result:` and `Try Again` are hardcoded English in `_scenario.html.erb` inside a Spanish
  UI. Move them to locale keys.

### The test that prevents the class

The class is **"a heading parser accumulates without a terminator and swallows the rest of
the document"**. `parse_heading_scenario` is not the only accumulator in that file —
`parse_heading_flashcards` and the others have the same shape. Test them together:

```ruby
# engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb
```

For every `parse_heading_*` method, feed a body whose block is followed by a `##` heading, a
fenced code block, and trailing prose, and assert the parsed block contains **none** of the
trailing content and that the trailing content is still available to the section body. The
scenario case must fail today with the mermaid fence inside `options.last[:consequence]`.

---

## §3 — The check asks for a translation without showing what to translate

Screenshot: a `DESAFÍO RÁPIDO` modal titled *"Elige la traducción correcta (evaluación)"*
with four Spanish options (`Ella tiene un perro`, `Nosotros tenemos un perro`,
`Ella es un perro`, `Él tiene un perro`) — and **no English sentence anywhere**. The student
is asked to choose a translation of nothing. It is unanswerable except by guessing, and a
wrong guess costs a heart.

`_check.html.erb:53` renders `section[:question]` and nothing else. So `section[:question]`
here is the *instruction* and the *stem* was lost. Find out where:

- `parse_heading_check` (`lesson_section_parser.rb:261`) — does it split the heading from the
  sentence and drop one?
- `inject_metadata_checks` (`:536`) — `question: kc["question"]`. If the generator emits the
  stem in a sibling key (`prompt`, `sentence`, `source`), it is being ignored here.
- The generator prompt itself (`engines/ai_orchestrator/config/prompts/lesson_content.yml`) —
  it may simply never ask for the stem as a separate field.

Fix at the layer where the data is actually lost, and **add the guard at the template**: a
check with no answerable stem should not render as a gate. If the question is missing or is
pure instruction, either skip the block or let it pass without blocking. `BlockGrader`
already has this instinct written down — *"Fail OPEN on data quality: a section we cannot
grade must never trap a student behind our own generation bug"* (`block_grader.rb:54`). The
template needs the same instinct. A check the student cannot answer is exactly that trap.

### The test that prevents the class

The class is **"a generation defect renders as a gate the student cannot pass"**. A unit test
on the parser is not enough, because the failure is a gate that traps.

Assert at the model boundary: a `check` section whose `question` is blank, or whose `options`
are empty, or which has no option marked `correct`, must **not** appear in
`outstanding_blocks_for`. Today `BlockGrader` fails open for grading, but the gate is decided
separately — verify that path and make it agree.

---

## Order

1. §1 — no student can finish a lesson until this ships.
2. §3 — it hands out unanswerable questions that cost hearts.
3. §2 — it makes lessons look broken and it is WP-23 §6, so closing it shortens the next
   package.

Then WP-23, with §6 replaced by a pointer to §2 here.

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, report the intersection.
- Browser suite, same.
- All three new tests demonstrated red before the fix, with the failure output pasted in.
- **Then verify on the live site**, on the exact step this was found on:
  `/learning/routes/60452d4b-bda4-4934-9228-9aaa91e22ed7/steps/3700fee4-b2b0-47d4-b71c-1b0b9c9d7230`
  — let a timer run out on purpose, then finish the lesson. If it does not complete, §1 is
  not done.
- Say what you did not do.

## Not in this package

Everything in WP-23. WP-20, Task 8, Task 9, bot protection, the 72 `includes` sites.

One thing to **write down and not fix**: the generated image on the step above renders
garbled fake text (`IMCLER PAGA PRINCTPAINTIDS`, `You pos wasdy.`). That is the known
image-text problem, and the decision is already made — forbid text in generated images and
put labels in HTML. It has its own slot in the roadmap. Do not start it here.
