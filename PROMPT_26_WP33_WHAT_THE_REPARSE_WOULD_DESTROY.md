# WP-33 — What the re-parse would destroy, and what the parser still drops

Branch: `wp33-reparse-keeps-what-it-did-not-make`, off `main` at `d5bdaaa` or later.

WP-24 §2 fixed the scenario parser and shipped `wp24:reparse_scenarios` to rewrite the parses
already persisted in production. That task has **not been run**, on purpose: the audit of
7 September (`AUDIT_2026-09-07.md` §2.5, §2.6, §4.3) found that running it would erase every
image the media jobs have paid for, and that two more parsers still throw away the content that
follows them — including one of the two mermaid diagrams the generator is told to emit. This
package makes the re-parse safe, closes the parser class for good, widens the re-parse to every
step, and then — only then — the owner runs it.

House rules, unchanged: bugs before features; every fix ships with the test that prevents its whole
class, shown red first; every claim in your handoff is something you ran. Prompts, code, comments and
commits in English. `block_attempts.section_index` indexes into `metadata["parsed_sections"]`, so
**nothing here may change the number or order of sections for an existing step** — position
compatibility (same size, same `type` at every index) remains the safety rule for any rewrite, and
your changes to the parser must keep it true for the bodies the generator has already produced.

Three facts from WP-35 that this brief depends on: `mermaid_invalid` no longer exists (§7 deleted
the fake validation that wrote it — it is **not** an enrichment key); the parser's default titles
are the one part of §6 that was deferred to here; and a fenced ```` ```mermaid ```` block that fails
now falls back quietly in both render paths, so recovering diagrams into an aftermath cannot
reintroduce the error graphic.

---

## §1 — The re-parse rewrites what other jobs wrote into the array

`lib/tasks/wp24_reparse_scenarios.rake`: `reparse` is a fresh `LessonSectionParser.call(...).map(&:as_json)`;
`compatible` compares only `size` and `type` per index; then
`step.update!(metadata: step.metadata.merge("parsed_sections" => new_sections))`.

The parser always emits `image_url: nil` for a visual (`lesson_section_parser.rb:313`). But two
jobs store their results **inside** that same array: `media_prefetch_job.rb:193-197` writes
`image_url` and `image_fallback`; `section_image_job.rb:61-63` writes `image_status`, `image_url`
and `image_error`. So every illustrated step passes the guard (`old != new`, because of the URL),
is rewritten without its images, and `media_prefetch_job.rb:79` — `if type == "visual" &&
section["image_url"].blank?` — queues a paid regeneration for each of them the next time it runs.

### What to do

Put the vocabulary of enrichment in one place: `ContentEngine::SectionEnrichment::KEYS =
%w[image_url image_status image_error image_fallback]` (with a comment that these are the keys
**written by jobs, not by the parser**, and that a new job key goes here or the re-parse will eat
it), and a `carry_over(old_sections, new_sections)` that copies each key from `old[i]` onto
`new[i]` when the new value is blank. The rake task goes through it. `SectionResolver#parse_and_persist!`
(`section_resolver.rb:42-60`) only runs when no array is persisted, so there is nothing to carry
there — but it writes the **whole** metadata hash from a copy it read earlier
(`@step.update!(metadata: (@step.metadata || {}).merge(...))`), which can clobber an
`audio_sections` a job wrote in between. Switch it to `merge_metadata!`; same class, one line.

Write through a lock, not through a stale copy. The task read `step.metadata` minutes before it
writes; `MediaPrefetchJob` and `SectionImageJob` run concurrently in production and write the same
array. Inside `step.with_lock`, re-read with `fresh_metadata` (`route_step.rb:78`), carry over,
then `merge_metadata!` (`route_step.rb:63`) — the same discipline `MediaPrefetchJob#apply_results!`
already documents in its RE-READ comment.

Sweep test: grep the jobs under `engines/content_engine/app/jobs` for writes into
`parsed[...]["<key>"]` and assert every key written is in `KEYS`. That is what stops the next job
from reopening this.

## §2 — `## Pregunta` and `## Match` still throw away what follows them

`lesson_section_parser.rb:261-298` (`parse_heading_check`): the loop keeps `A)`–`D)`, `CORRECTA:`,
`EXPLICACIÓN:` and the first prose line; **every other line is discarded**. `:382-390`
(`parse_heading_drag_drop`): `.select { |l| l.include?("==>") }`; everything else is discarded.
Neither has an `aftermath`, and neither partial renders `body`.

`lesson_content.yml:127-128` tells the model to place its first mandatory mermaid diagram
immediately after the CYCLE 2 interactive block, whose preferred types are `## Complete` and
`## Pregunta`. Half the time, the diagram lands in the body of a check and is silently deleted.
The section count does not change, so the boundaries sweep's count assertion passes; the sweep
treats `drag_drop` as its *control* (`section_parser_boundaries_test.rb:95-98,134-141`) and asserts
only that the trailing content is not in `pairs` — never that it survives. `check` is not in the
sweep at all.

### What to do

Both parsers gain an `aftermath` through `split_aftermath`, **but the terminator applies only after
the block's structural lines are complete.** A programming lesson's check is `## Pregunta ("what
does this print?")` followed by a code fence and *then* the options; a fence before the first
option is part of the question, not an aftermath. So: for `check`, `question` is everything before
the first option line (markdown, fences included), the options/`CORRECTA:`/`EXPLICACIÓN:` lines are
what they are today, and the aftermath is what follows the last recognised marker line from its
first terminator. For `drag_drop`, prose before the first `==>` line is `intro`, pairs are the
`==>` lines, and the aftermath follows the last pair from its first terminator. Adding fields is
position-safe; removing or reordering sections is not.

Render them. `_drag_drop.html.erb` renders `intro` (through `MarkdownRenderer`, as `_concept`
does) above the board and the shared `aftermath` partial below it. A check renders nothing in the
flow — its modal is emitted after the container (`_lesson.html.erb:162-168`) — so its aftermath
renders **inside the check's `.lesson-section` element**, which is empty today; the student answers
the modal and finds the diagram and the prose where the block sits in the lesson. And
`_check.html.erb:54` prints `section[:question]` as plain text: render it through
`MarkdownRenderer` so the code sample in a "what does this print?" question is code and not
backticks.

Then the sweep: `check` and `drag_drop` join `ACCUMULATORS` (with a canonical body each) so both
"does not swallow" and "keeps the trailing content as aftermath" run for them; the control comment
goes. Add the case the template actually produces — a `## Pregunta:` with four options,
`CORRECTA:`, `EXPLICACIÓN:` and then a ```` ```mermaid ```` fence — and assert the fence is in the
aftermath, intact, with its newlines. Add a check whose question carries a code fence *before* the
options and assert the fence is in `question`, the options are four, and the aftermath is empty.

## §3 — The playground's Reset ships `&quot;`

`_code_playground.html.erb:4`:

```erb
data-code-playground-initial-code-value="<%= section[:code]&.gsub('"', '&quot;') %>"
```

The same double escape WP-24 §2 removed from `_scenario.html.erb`. The textarea at `:33-36` is
seeded from `<%= section[:code] %>` and is fine; `code_playground_controller.js:192-193` writes
`initialCodeValue` back on Reset, so `print("hola")` → Reset → `print(&quot;hola&quot;)` →
SyntaxError. Fix: `<%= section[:code] %>`; ERB escapes attributes correctly on its own.

While in that partial, the three English literals a Spanish student reads — `aria-label="Reset code"`
(`:22`), `aria-label="Run code"` and `Run ▶` (`:27-28`) — become locale keys next to
`learning_engine.blocks.reset`.

Sweep test: no view under `app/views` or `engines/*/app/views` contains `gsub('"', '&quot;')` or
`gsub('"', "&quot;")`. A view test: a playground whose code contains a double quote renders the
attribute with `&quot;` **once** (ERB's escape) and the decoded attribute value equals the source.

## §4 — The parser bakes a language into the persisted title

`lesson_section_parser.rb:128,136,143,148,163,223,291,308,389,564,568,604,625,644,663` (and the
inline `title.presence || "Ejemplo"` / `"Consejo"` at `:215-218`, `"Introducción"` at `:244`):
when a heading has no title the parser persists a literal — Spanish for prose blocks
(`"Concepto"`, `"Resumen"`, `"Comprueba tu conocimiento"`, `"Audio explicación"`), English for
interactive ones (`"Match"`, `"Visual"`). The parser runs inside `ContentPipelineJob`, whose
`I18n.locale` is whatever the worker has, not the route's; a translated default persisted from a
job would be baked in the wrong language half the time.

### What to do

**Never persist a translation.** The parser emits `title: nil` when the heading had none (or the
field is absent), and the *view* fills it: one helper, `block_title(section)`, returning
`section[:title].presence || t("learning_engine.blocks.default_title.#{section[:type]}")`, used
by every partial that prints `section[:title]` (twelve of them — `grep -l 'section\[:title\]'`
under `lesson_sections/`). The default titles live under `learning_engine.blocks.default_title`
in **both** locale files, one key per type in `ContentEngine::LessonBlocks::BLOCKS`, and the
contract test that already guards `BLOCKS` gains the assertion that every type has that key in
both locales. Steps already persisted with a literal default get their `nil` from the re-parse in
§5, because the re-parse recomputes titles from the body — that is the reason this belongs here
and was deferred from WP-35 §6.

Check `LearningRoutesEngine::BlockGrader.answerable?` and anything else that reads `title` before
you change it; nothing should gate on a title, and if something does, say so in the handoff.

## §5 — Widen the re-parse to every step, and retire the scenario-only task

Every parser fix since WP-24 §2 — scenario, flashcards, code_playground, fill_blank, simulation,
and now check and drag_drop and the titles — changes nothing a student can see on a step that
already exists, because `StepsController#show` renders the persisted array. The scenario-only task
would leave every other type broken.

Replace `lib/tasks/wp24_reparse_scenarios.rake` with `lib/tasks/wp33_reparse.rake`, same style,
two tasks:

- `wp33:reparse_census` — read only. Every `RouteStep` with a non-empty `parsed_sections`. For
  each: resolve content as `SectionResolver#lesson_content` does, re-parse, carry over
  enrichment (§1), compare. Report: steps scanned; steps whose parse changes, **broken down by
  section type** (how many checks gain an aftermath, how many drag_drops, how many titles go from
  a literal to nil, how many scenarios change, …); steps not position-compatible, with ids and the
  two shapes; steps with no usable `AiContent`; and — the number that proves §1 — how many
  `image_url`s the old array holds and how many the new array would hold (they must be equal).
  Modify nothing.
- `wp33:reparse` — rewrite the position-compatible ones under the lock of §1, skip and list the
  rest, idempotent, print counts including the image-URL pair again.

Move the "an incompatible step is skipped and reported, not rewritten" case from
`test/tasks/wp24_reparse_scenarios_test.rb` into the new test file and delete the old task and
test; `WP24S2_HANDOFF.md:115-124` names the old tasks four times — replace those lines with one
pointing here, so the owner cannot run a task that no longer exists.

---

## The tests that prevent the classes

Three classes, three tests, each red first with the run pasted in the handoff:

1. **"A rewrite of `parsed_sections` loses a key the parser did not produce."**
   `test/tasks/wp33_reparse_test.rb`: a compatible step whose visual carries `image_url`,
   `image_status: "ready"` and whose other visual carries `image_fallback: true` keeps all of them
   after `wp33:reparse`, and `MediaPrefetchJob`'s task builder enqueues **no** image task for the
   step afterwards. Then the concurrency case in the WP-19 harness pattern: a job writes an
   `image_url` into the row between the task's read and its write, and the URL survives. Plus the
   sweep of §1.
2. **"A heading parser drops what follows its structural lines."** The boundaries sweep with
   `check` and `drag_drop` in `ACCUMULATORS`, the template case and the fence-in-question case
   from §2, and the count assertion still green for every document in the file.
3. **"A view double-escapes, or a persisted section carries a language."** The `&quot;` sweep of
   §3; a parser test that no `parse_heading_*` output contains a default title literal (assert
   `title` is nil for every untitled heading); the `BLOCKS`/locale contract of §4; and a view test
   that an untitled `## Match:` renders "Emparejar" for a Spanish student and "Match" for an
   English one, from the same persisted section.

Also: a test that a check's aftermath is rendered inside its `.lesson-section` and not inside the
modal; a test that `question` markdown reaches the modal as HTML (`<code>`), sanitized.

## Order

1. §1 with class test 1 red first — it is what makes everything else safe to ship.
2. §2 with the sweep red first.
3. §3, §4.
4. §5 last, tested against fixtures that exercise §1–§4 together.

## Verification

Before and after, three runs each: main, browser, combined with engines — the table as in
`WP35_HANDOFF.md`, **before column from a clean checkout of the base commit with nothing else
running** (that column was contaminated twice in two packages; the handoff says how). RuboCop clean.
In a browser against dev: a lesson with a `## Pregunta:` followed by a mermaid fence shows the
diagram in the check's section after the modal is answered; a `## Match:` with an intro sentence
shows the sentence above the board; the playground Reset restores `print("hola")` intact; the same
persisted untitled block reads its title in Spanish and in English by switching the user's locale.

Write `WP33_HANDOFF.md`: what changed and why, the red-then-green output of every new test, the
exact commands the owner runs on the production box — `bin/kamal app exec 'bin/rails
wp33:reparse_census'` first, read the image-URL pair and the incompatible list, then
`wp33:reparse`, then the census again to see zero changes — and what you did not do.

## Not in this package

The generator prompt (moving the diagram out of the check is a content decision, and the parser
must cope with the bodies that already exist anyway). `raise_on_missing_translations` and the rest
of the §4.6 literal sweep (safety net). The sanitizer allow-list (audit §4.7). Anything in
`BlockGrader` or the gate. Spend guards (WP-34). Re-generating lessons — that costs money.
