# WP-33 — What the re-parse would destroy, and what the parser still drops

**Written:** 2026-09-08 · **Revised:** 2026-09-10 after code review · **Branch:**
`wp33-reparse-keeps-what-it-did-not-make`, base `main` @ `d5bdaaa`. **Tree clean. Not merged, not
deployed. Nothing run against production.**

**A review of `7036973` found five defects and all five are fixed on this branch — one of them a
hole in §2 big enough that §2 was not actually closed.** See *What the review found* below.

`wp24:reparse_scenarios` is deleted. The task the owner runs is `wp33:reparse`, and the exact
sequence is at the end of this document. **Read the census output before running anything.**

---

## §1 — the re-parse would have deleted every image and bought it again

`wp24:reparse_scenarios` rewrote `parsed_sections` from a fresh parse. The parser always emits
`image_url: nil` for a visual — but `MediaPrefetchJob` and `SectionImageJob` store what they
generated **inside those same entries**. Every illustrated step passed the position guard (the
arrays differ, because of the URL), was rewritten without its images, and then
`MediaPrefetchJob#build_media_tasks` queued a paid regeneration for each:

```ruby
if type == "visual" && section["image_url"].blank?
```

So the free fix would have cost the price of every illustration in production, twice: once to lose
them, once to buy them back. That is why the task was never run.

`ContentEngine::SectionEnrichment` now names the four keys jobs write — `image_url`,
`image_status`, `image_error`, `image_fallback` — and carries them across a reparse wherever the
new parse has nothing to say. **`mermaid_invalid` is deliberately absent**: WP-35 §7 deleted the
validation that wrote it and nothing ever read it. Audit §2.5's enrichment list should lose it.

**The sweep is what stops the next job reopening this.** It greps every engine job for writes into
`parsed[...]["key"]` and fails on any key `KEYS` does not name.

### Writes go through the lock

The task reads a row, parses, and writes; the two jobs write the same array concurrently in
production. `wp33:reparse` works inside `step.with_lock`, re-reads with `fresh_metadata`, and
writes with `merge_metadata!`.

`update!(metadata: metadata.merge(...))` rewrites the **whole** jsonb blob from whatever copy the
process is holding, so an `audio_sections` or `image_url` written in between is erased. That
one-line defect was in `SectionResolver#parse_and_persist!` and in the reparse task, both fixed.

**The sweep that was supposed to catch the rest only globbed `app/jobs`.** WP-19 wrote it after
`MediaPrefetchJob` lost ten call sites' worth of paid media, and it has been green ever since —
while three non-job writers of the same blob sat outside its glob. I found them by widening it to
controllers and services, which is where the money-losing writes had moved:

| | what it erased |
|---|---|
| `SectionImagesController#mark_generating!` | a narration stored in another tab, on every click of the generate button |
| `SectionAudioController#update_audio_section_status!` | a sibling narration **and** a hand-generated `image_url`; no lock at all |
| `SectionAudioGenerator#update_step_audio_status!` | any key written since its `with_lock` reload |

The third is subtle and worth naming: `with_lock` makes the read-modify-write of `audio_sections`
safe **against other lockers**, so its entries were never lost — but the blob it holds is still
missing every other key written since the reload, and it saved that blob. A lock does not make a
whole-blob write safe; it only makes it lose different things.

All three now go through `merge_metadata!`, and the audio controller takes the same `with_lock` the
generator has, so the two writers of `audio_sections` are finally serialised against each other.

```
Expected ["engines/content_engine/app/controllers/content_engine/section_audio_controller.rb",
          "engines/content_engine/app/controllers/content_engine/section_images_controller.rb",
          "engines/content_engine/app/services/content_engine/section_audio_generator.rb"]
  to be empty.
5 runs, 11 assertions, 1 failures
```

Two of the five files the widened glob matches only *mention* the whole-blob write, in the comment
explaining why they no longer do it — so the sweep strips comments before matching, the same trap
WP-35 §2's format sweep fell into.

### Red

```
7 runs, 2 assertions, 0 failures, 7 errors     (no task, no constant)
```

and the carry-over shown load-bearing by removing it from the rewrite path:

```
the reparse threw away an image the media job had already paid for
the reparse blanked image_url, so every illustration would be generated again
7 runs, 20 assertions, 2 failures
```

## §2 — `## Pregunta` and `## Match` threw away what followed them

`parse_heading_check` kept `A)`–`D)`, `CORRECTA:`, `EXPLICACIÓN:` and the first prose line; every
other line was **discarded**. `lesson_content.yml:127-128` tells the model to place its first
mandatory mermaid diagram immediately after the CYCLE 2 interactive block, whose preferred types
include `## Pregunta` — so about half the time the diagram landed in the body of a check and was
silently deleted. `parse_heading_drag_drop` selected the `==>` lines and discarded the rest,
including an instruction sentence above the board.

The section count never changes, which is why the boundaries sweep stayed green: `check` was not in
it at all, and `drag_drop` was its **control** — "selecting is already a terminator". True, and
beside the point: selecting keeps the trailing content out of `pairs` *and* throws it away. Both
are accumulators now and the control comment is gone.

**The terminator applies only after the structural lines are complete**, which is the whole
difficulty. A programming check is `## Pregunta ("what does this print?")` followed by a code fence
and *then* its options: a fence before the first option is part of the question, not an aftermath.
So `question` is everything before the first option line, fences included; the aftermath starts at
the first terminator **after** the last recognised marker. For a match, prose before the first pair
is `intro` and the aftermath follows the last pair. Fields are added, never removed or reordered —
position compatibility holds.

Rendering: `_drag_drop` draws the intro above the board (through `MarkdownRenderer`, as `_concept`
does) and the shared aftermath partial below it. A check's aftermath renders **inside its own
`.lesson-section`**, which was empty — the student answers the modal, it closes, and the diagram is
there in the lesson. Never inside the modal, which is a question and not a page. `_check` renders
the question through `MarkdownRenderer`, so a code sample is code and not backticks.

### Red

```
check dropped "What actually happened"...
drag_drop dropped "What actually happened"...
the diagram the generator is told to emit was deleted by the check parser
the code the question is ABOUT was treated as trailing content
  Expected "What does this print?" to include "print(2 + 2)"
20 runs, 341 assertions, 4 failures
```

**One defect I introduced and caught in the same run.** The original
`lines.map(&:rstrip)` is harmless when you only inspect a line and fatal when you re-join a slice:
my first aftermath came back flattened onto one line — precisely what stopped a diagram drawing in
WP-24 §2. The parser keeps the raw lines and matches on a stripped copy.

## §3 — the playground's Reset shipped `&quot;`

```erb
data-code-playground-initial-code-value="<%= section[:code]&.gsub('"', '&quot;') %>"
```

The same double escape WP-24 §2 removed from `_scenario`. ERB escapes the attribute on its own, so
the ampersand of the hand-written entity was escaped again, arrived as `&amp;quot;`, and the
browser decoded it once — leaving six literal characters.
`code_playground_controller.js:192-193` writes that value back on Reset, so `print("hola")` became
`print(&quot;hola&quot;)` and the next Run was a SyntaxError. The textarea was always seeded
correctly, which is why this only ever broke **after** pressing Reset.

The red run says it better than a paragraph:

```
Expected "print(&amp;quot;hola&amp;quot;)..." to include "&quot;"
Reset would restore escaped entities instead of code: the value decodes to
  "print(&quot;hola&quot;)\nprint('adiós')"
```

A sweep now fails on that gsub in any view under `app/views` or `engines/*/app/views` — this is the
second time the same line has shipped. The three English literals in that partial (`Reset code`,
`Run code`, `Run ▶`) are locale keys.

## §4 — the parser baked a language into the persisted title

When a heading had no title the parser wrote a literal into `parsed_sections`: Spanish for prose
blocks, English for interactive ones. It runs inside `ContentPipelineJob`, whose `I18n.locale` is
the worker's and **not the route's**, so the default was persisted in the wrong language about half
the time — and stayed wrong, because that array is the cache the page renders from.

The parser emits `nil`. `block_title(section)` in the engine's `ApplicationHelper` fills it at
render time from `learning_engine.blocks.default_title.<type>`, present for all 14 declared types in
both locales, with a contract test tied to `LessonBlocks::BLOCKS`. Twelve partials go through the
helper. Steps already persisted with a literal get their `nil` from `wp33:reparse` — which is why
this was deferred from WP-35 §6.

**Nothing gates on a title.** `BlockGrader` never reads one; I checked before changing it. Two
places *use* one and both are handled: `SectionImagesController` falls back to the same key for alt
text and caption, so an untitled visual keeps its accessible name, and `LessonAssistantAgent` only
puts it in prompt context.

### An existing engine test asserted the defect

`LessonSectionParserTest#test_:::example_and_:::tip_carry_their_body` required the parser to persist
`"Ejemplo"` and `"Consejo"`. I changed the **assertion**, not just a fixture: it now requires the
opposite, that nothing about the language reaches the cache. Flagging it because changing what a
test asserts deserves to be seen rather than noticed.

**It was red in the combined suite while the main suite was green** — the file lives under
`engines/content_engine/test`. That is the argument for the three-column table below.

## §5 — the re-parse covers every step now

`wp24:reparse_scenarios` selected steps with a persisted `scenario`. Right for WP-24 §2, wrong for
every parser fix since: a step whose check swallowed a diagram has no scenario in it. The new tasks
walk every step with a non-empty `parsed_sections`.

`WP24S2_HANDOFF.md` named the two dead tasks four times as commands to run on the production box;
those lines now point here and say not to run anything from `wp24:`. The remaining mentions across
the repo are historical (the briefs, the audit), not instructions.

The census reports **the two shapes** when a step is refused, not the two sizes. `15 sections -> 15`
told the owner nothing; in development it immediately named the real case:

```
478f1cc5-…
  persisted: concept,concept,check,concept,visual,drag_drop,check,…,fill_blank,check,summary
  reparsed:  concept,concept,check,concept,visual,drag_drop,check,…,flashcards,check,summary
```

A `fill_blank` at index 12 reparses as `flashcards`. The guard correctly refuses it.

---

## What the owner runs on the production box

**In this order, reading the output of each before running the next.**

```bash
# 1. READ ONLY. Changes nothing.
bin/kamal app exec 'bin/rails wp33:reparse_census'
```

Three things to check in that output before going further:

1. **`image urls now` and `image urls after reparse` must be EQUAL.** They are the whole point of
   §1. If they differ, stop: the reparse is deleting images the media jobs paid for, and the task
   says so on its own line.
2. **The incompatible list.** Those steps are skipped, never rewritten, because a rewrite would
   re-point every recorded `block_attempt` at a different block. The two shapes tell you which index
   moved. They stay on the old parse until someone decides what to do with them.
3. **`no usable AiContent`** — steps whose source text is gone. Also skipped.

```bash
# 2. Rewrite the position-compatible ones.
bin/kamal app exec 'bin/rails wp33:reparse'

# 3. Confirm. "steps whose parse would change" must now be 0,
#    and the image-URL pair must still be equal.
bin/kamal app exec 'bin/rails wp33:reparse_census'
```

I ran exactly that sequence against the development database, on a step staged to look like
production (stale parse, baked-in Spanish titles, a paid image URL):

```
census   10 steps, 8 would change, 1 incompatible, 1 unparseable
         image urls now: 3   after reparse: 3
reparse  rewritten: 8   already current: 0   skipped: 2
         image urls now: 3   after reparse: 3
census   8 would change -> 0        image urls: 3 / 3
```

and confirmed on the row itself: the image URL and status kept, the check's aftermath recovered
with its ```` ```mermaid ```` fence, the match's intro recovered, both titles now `nil`, and the
section types unchanged.

## What the review found

Five defects in `7036973`, all confirmed against the branch, all fixed here, each with its test red
first. **The first two mean §2 was not closed** — the aftermath field made it look closed while the
same class of loss continued one line lower down.

### 1. `split_aftermath` discarded `_kept`, so §2 still deleted prose

`parse_heading_check` and `parse_heading_drag_drop` both did:

```ruby
_kept, aftermath = split_aftermath(lines[(last_marker_index + 1)..].join)
```

`split_aftermath` returns `[everything before the first terminator, everything from it]`. The
first half was thrown away. So prose between the last structural line and the first
heading/fence/rule was deleted — and with **no** terminator at all, which is the ordinary shape,
the entire tail was deleted:

```
## Pregunta: ¿Cuál es la capital?
A) Lima
B) Quito
CORRECTA: A
EXPLICACIÓN: Lima es la capital del Perú.

Recuerda este dato, lo usaremos en el siguiente bloque.   ← gone, and `check` has no `body`
```

**The brief's wording caused this.** It says the aftermath runs "from its first terminator", and
that is what I implemented. The rule is simpler than the brief made it: `split_aftermath` exists
for a parser that does *not* know where its accumulation ends. These two know — the last option /
`CORRECTA` / `EXPLICACIÓN` line, and the last `==>` line. After that, everything is aftermath **by
construction**, so hunting for a terminator inside it only created a second place to lose content.
Both sites are now `lines[(boundary + 1)..].join.strip.presence`.

**Why the sweep did not catch it:** `TRAILING` opens with `### What actually happened`. The
terminator is on line one, so `_kept` was always empty in every generated case, and the two §2
cases put the fence directly after the last marker. The sweep never put plain prose in the gap.
It does now — two cases per parser, one with a terminator after the prose and one without.

### 2. An option-less `## Pregunta` drew its diagram inside the modal

With no `A)`–`D)` line there was no `first_option_index`, so the whole body became the `question` —
and §2 had just started rendering `question` through `MarkdownRenderer`. A mermaid fence after an
option-less question therefore drew **inside the modal**, the one place `_lesson.html.erb` says an
aftermath must never be. Verified in the rendered DOM, not just in the parse.

When `options.empty?` there is nothing structural to protect, so the ordinary terminator rule
applies from the top: `body_question, aftermath = split_aftermath(lines.join)`.

### 3. `mark_generating!` wrote a nested array from a stale copy

`SectionImagesController#mark_generating!` got `merge_metadata!` in `7036973` but not the lock and
re-read its sibling `update_audio_section_status!` got in the same commit. `merge_metadata!` is
shallow — `RouteStep` says so itself: *"A caller mutating a NESTED structure must still re-read
that structure immediately before writing."* This caller rebuilds the **whole** `parsed_sections`
array and names it, from the copy `set_step_and_authorize!` loaded at the top of the request.

A `SectionImageJob` committing another section's `image_url` in between was written straight back
out as nil, and `MediaPrefetchJob#build_media_tasks` then bought that image again — §1's own
failure mode, through the door §1 did not close. Both jobs already re-read; this was the last
writer holding a stale copy. Now `with_lock` + `fresh_metadata`.

### 4. `update_section_image!` was dead code

No callers anywhere. `7036973` edited its write and added a comment to it; `mark_generating!` then
pointed at it for the rationale. Deleted, comment moved onto `mark_generating!`.

### 5. The enrichment sweep globbed only `engines/*/app/jobs`

The commit message of `7036973` is *"three non-job writers were outside the whole-blob sweep"* —
so the branch already knew jobs are not the only writers, and the §1 sweep was still looking only
at jobs. Widened to `{jobs,controllers,services}`: 116 files instead of 60-odd, and it picks up
`SectionImagesController`'s two writes (both already in `KEYS`, so it passes today).

**The regex is unbound from the local name too.** It was `parsed(?:_sections)?\[...`, so a writer
that called its local `sections` was invisible. It is now `\w+\[[^\]]+\]\["([a-z_]+)"\]\s*=` —
the *shape* of an enrichment write, not the variable name. The double bracket is what keeps
`audio_sections[index] = entry` out: that is a single-bracket write of a whole entry at the top
level of the blob, not enrichment. Verified both patterns return the same four keys today, so the
widening changed coverage without changing the answer.

### The browser check on the modal header

`7036973` replaced `<p style="margin:0">` with `<div class="lesson-content">`, and
`MarkdownRenderer` emits its own `<p>` inside it. Measured in Chrome against the compiled
stylesheet, on the real rendered modal markup:

| | old `<p>` | after `7036973` | now |
|---|---|---|---|
| `margin-top` | 0px | **0px** | 0px |
| `margin-bottom` | 0px | **16px** | 0px |
| `color` | `rgb(28, 24, 18)` | **`rgb(109, 102, 91)`** | `rgb(28, 24, 18)` |

**No stray top margin** — that specific worry was unfounded. But `.lesson-content p` is body copy
(`@apply ... mb-4; color: var(--color-sub)`), so the question had picked up a 1rem trailing gap and
turned muted grey: the inline `color:var(--color-txt)` sits on the wrapper `div`, and the rule
targets the `p` inside it. Fixed with a `.quiz-question` scope next to the other `.quiz-*` rules —
a heading is not body copy — keeping the `code`, list and emphasis rules that were the point of
rendering markdown at all. **`app/assets/tailwind/application.css` changed, so this needs
`bin/rails tailwindcss:build`;** the dev server serves the compiled build, not the source.

## Verification

Three runs of each, one suite at a time. The **before** column is from a clean checkout of
`d5bdaaa` with nothing else running and no test files written during the run — the discipline the
last two packages got wrong.

| Suite | Before (`d5bdaaa`) | At `7036973` | After the review fixes | **Round 3 (`666f340`)** |
|---|---|---|---|---|
| Main (`bin/rails test`) | 751 runs, 3559 assertions, 0F 0E | 768 runs, 3608 assertions, 0F 0E | **771 runs, 3618 assertions, 0F 0E** | **783 runs, 3661 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 66 runs, 483 assertions, 0F 0E | 66 runs, 483 assertions, 0F 0E | **66 runs, 483 assertions, 0F 0E** | **69 runs, 513 assertions, 0F 0E** |
| Combined (`bin/rails test test engines/*/test`) | 1161 runs, 5263 assertions, **3F 1E** | 1184 runs, 5437 assertions, 3F 1E | **1193 runs, 5481 assertions, 3F 1E** | **1220 runs, 5620 assertions, 3F 1E** |
| RuboCop | clean, 585 files | clean, 588 files | **clean, 588 files** | **clean, 590 files** |

All nine runs of each column identical. The final column was re-run in full *after* the view and
CSS changes, not carried over from before them. The combined failures are the four known engine ones,
unchanged: `RouteGenerationJobTest`, `RouteGeneratorTest`, `GapAnalysisJobTest`,
`ReinforcementJobTest`. **I did not touch them.**

New tests since the review: **9** — 5 boundaries cases (prose-in-the-gap and
no-terminator-at-all, for both `check` and `drag_drop`, plus the option-less check), 1 modal render
case, 1 `mark_generating!` isolation case, 1 sweep-coverage case, and the widened sweep itself.

New tests in the package overall: **32** — 9 reparse (including the concurrency case and the §1–§4 integration), 4 check
aftermath and question rendering, 4 playground/`&quot;` sweep, 6 titles — plus `check` and
`drag_drop` joining the boundaries sweep and two new cases there. The metadata-write sweep gained
no test; it was **widened**, which is why the run count is unchanged by the three writers it caught.

### In a browser, against the development server

A lesson with all four fixes in one body, verified in the DOM and then deleted:

- The check's `.lesson-section` contains the mermaid container and the trailing prose; the **modal
  does not**. The modal has `<code>` and no backticks.
- The match shows "Arrastra cada término a su definición." above the board.
- `data-code-playground-initial-code-value` decodes to `print("hola")` — real quotes, no `&quot;`.
- The same persisted section, titles `nil`, reads **"Emparejar"** for a Spanish student and
  **"Match"** for an English one; explicit titles ("Ciclos", "Saludos") are untouched.
- Section types unchanged: `concept,check,drag_drop,code_playground,summary`.

## What I did not do

- **I did not run anything against production.** The census goes first and the owner reads it.
- **Two findings from the same review are still open, because they were scoped out of the fix
  list.** Both are real; I reproduced both. Neither is a regression from this branch except where
  noted, and neither is touched here:
  - **A check whose options are not `A)`–`D)` leaks its answer into the modal.** With `1) 4 / 2) 22
    / CORRECTA: A / EXPLICACIÓN: …` the parser matches no options, so `question` becomes the whole
    body — `CORRECTA: A` included — and the modal now renders it. The fix in §2 above covers the
    option-less case, not this one; slicing at the first marker line *of any kind* would close both.
    **This one IS a regression from `7036973`:** the old code took only the first non-empty line.
  - **`==>` is mermaid's thick-link arrow.** A `## Match:` followed by a diagram that uses
    `A[Start] ==> B[Middle]` gets two junk pairs (pre-existing) *and*, new on this branch, an
    aftermath of the dangling `` ``` `` because `pair_indexes.last` now points inside the fence.
    Restricting the pair scan to lines outside fenced regions would close it.
- ~~**A third finding I reported is not fixed and is the one I would look at next:**~~ **FIXED in
  the second round below.** The check's aftermath rendered into a `.lesson-section` that
  `interactive_lesson_controller.js` never set to `display: ""` on the forward path, so §2's
  recovered diagram was in the DOM and invisible. `_handleQuizModalClose` now lands on the check's
  own section when the server marks it `data-has-aftermath`. See "The second review round".
- **The generator prompt is untouched** — moving the diagram out of the check is a content decision,
  and the parser has to cope with the bodies that already exist regardless.
- **A bare `## Match` with no colon is still parsed as a concept titled "Match".** The parser treats
  the keyword as the title when there is no colon, so an untitled block only reaches a *default*
  through the `## Match:` form. Pre-existing, out of this brief's scope, recorded in a test comment
  and here.
- **One English literal remains in the code chrome:** the markdown renderer's code blocks have a
  `Run` button (`copy-code#fakeRun`) that is not the playground's. Different component, outside
  §3's three literals; for the §4.6 safety-net package.
- **`raise_on_missing_translations` and the rest of the §4.6 literal sweep**, the sanitizer
  allow-list (audit §4.7), anything in `BlockGrader` or the gate, and spend guards (WP-34) are all
  untouched, as the brief says.
- **I did not re-generate any lesson.** That costs money.
- **The four known engine failures** are unchanged, including the `RouteGeneratorTest`
  strict-loading one that belongs with WP-34's lazy-load list.
- **CI is still red** since WP-17 from `scan_ruby` (brakeman exits 5 on the known `permit!` warning)
  and `scan_js` (6 DOMPurify/Mermaid warnings).
- **I still owe the prompt investigation** from several packages ago.


---

# The second review round

Two patches arrived from a cloud session in `tmp/wp33-review-2/` (tests first, then the fix), and
this round also re-verified the ten findings the first round's audit reported. Applied in the order
the README specifies, on top of the five first-round fixes.

    fe06b73  fix(wp33): the five findings of the first review     <- the base. `git am` needs a clean index
    7eae555  test(wp33): the second review round, red first       <- 0001, applied unmodified
    3063d3c  fix(wp33): bounded scanners, and the check's aftermath is shown   <- 0002 + the CSS comment
    ba332f3  test(wp33): wait for the crossfade before measuring which sections show
    34a0b3b  fix(parser): the marker run is contiguous, and a wrapped value keeps its marker
    3f7b7ae  fix(images): mark_generating! is a claim, so one section is bought once
    4ff1b4c  fix(wp33): findings 7, 9 and 10, and correct finding 8's comment
    4d66f98  style(test): rubocop autocorrect on the new sweep assertions
    6fd75ec  fix(parser): a match's board is a contiguous run too   <- outside the ten; see below

Nothing is pushed. The owner pushes.

## 0001 was red, and 0002 did not by itself make it green

`0001` red against `fe06b73`, as promised: **5 failures** across the parser and integration suites
(36 runs, 445 assertions) and **3 failures** in `test/system/check_aftermath_is_shown_test.rb`.

`0002` turned the parser and integration suites green (36 runs, 467 assertions). **It did not turn
the system suite green** — 3 runs, 3 failures. The README predicted green, so this is the one place
the delivered patch set did not do what its own notes claimed, and it took a probe to establish
why rather than a reading of the diff.

## The third assertion IS red against the base, and the defect IS pre-existing

As instructed, recorded explicitly. The assertion the README names —
`shown_section_indexes == [CHECK_INDEX]`, at `check_aftermath_is_shown_test.rb:67` and `:101` —
is red against the base commit, and the defect behind it predates this branch.

Two independent pieces of evidence:

1. `git log main..fe06b73 -- app/javascript/controllers/interactive_lesson_controller.js` returns
   **zero commits**. The branch never touched the file the defect lives in.
2. The second test, `"a check without an aftermath is skipped, exactly as before"`, asserts only
   pre-WP-33 behaviour and is red on the base at `:83` with `Expected: [2] / Actual: [0, 2]`. The
   section the student had been reading was never hidden.

The mechanism: `_handleQuizModalClose` set `currentSectionValue` to the check — a section that is
`display:none`, because the modal overlays whichever section was already on screen — and then called
`_transitionToSection`. So `from` was the hidden check, `_transitionToSection` dutifully hid it
again (a no-op), and the section actually on screen was never touched. `0002`'s `_shownSectionIndex`
fixes exactly this, and it is a fair thing for it to carry: the same line had to change anyway.

I measured permanence rather than inferring it, sampling every 150ms after the modal closes:

    base fe06b73   [0,2] [0,2] [0,2] [0,2] ... [0,2]   12/12 samples over 1.8s — PERMANENT
    with 0002      [0,2] [0,2] [0,2] [2]   ... [2]     ~450ms — just the crossfade

## Why the suite was still red after 0002, and what I changed

Not the fix. The test.

`_transitionToSection` reveals the incoming section **synchronously** and hides the outgoing one in
a **400ms `setTimeout`**. So two sections are legitimately on screen for the length of the
crossfade — and "two sections on screen" is also the exact symptom the test was written to catch.
The delivered test read `shown_section_indexes` the instant the incoming section appeared, which
raced that window, so the correct code and the broken code were **observationally identical** and
the failure message argued for the wrong conclusion.

`ba332f3` replaces the point measurement with `assert_settled_sections`, which polls for the
condition. A section animating out clears within the crossfade; a section that was never hidden
never does. **Verified in both directions:** that file is still red against the base JS (3 failures)
and green with `0002`. It did not become permissive.

The same race, second form: two clicks in the third test fired mid-crossfade, and `nextSection` /
`previousSection` early-return while `_animating` — cleared only in that same 400ms timeout — so the
click was swallowed and the lesson never moved. They settle before clicking now.

`application.css:1192` is updated in `3063d3c`, the same commit as the JS, as instructed. It carried
the invariant the JS breaks: "a check `.lesson-section` renders nothing at all and is never
transitioned to." That now holds for only half the checks.

## The ten findings of the first round, re-verified

`file:line`, the verdict after this round, and what was actually run for each. The four I had
marked PLAUSIBLE were verified before anything was touched.

| # | file:line | verdict | what I ran |
|---|---|---|---|
| 1 | `_lesson.html.erb:174` | **fixed by 0002**, green | `check_aftermath_is_shown_test.rb`; 150ms time-series probe, base vs fixed |
| 2 | `lesson_section_parser.rb:316` | **fixed by 0002** | parser probe: `question` no longer carries CORRECTA/EXPLICACIÓN |
| 3 | `lesson_section_parser.rb:322` | **survived 0002 — fixed in `34a0b3b`** | probe: trailing `Answer:` → `aftermath` nil, answer unmarked |
| 4 | `lesson_section_parser.rb:322` | **survived 0002 — fixed in `34a0b3b`** | probe: wrapped `EXPLICACIÓN` → continuation leaked to aftermath |
| 5 | `lesson_section_parser.rb:437` | **fixed by 0002** | drag_drop probe: 2 pairs kept, diagram intact in aftermath |
| 6 | `section_images_controller.rb:25` | **CONFIRMED — fixed in `3f7b7ae`** | code trace + grep of every reader of `image_status`; then a red test |
| 7 | `wp33_reparse.rake:213` | **CONFIRMED — fixed in `4ff1b4c`** | read `:175-220`: accumulates inside the lock, prints at the end, no compare, no abort |
| 8 | `section_images_controller.rb:98` | **mechanism yes, consequence NO — comment only** | runner probe: `loaded?` true→false across `with_lock`; a read afterwards issues a SELECT and does **not** raise |
| 9 | `wp33_reparse_test.rb:245` | **CONFIRMED — fixed in `4ff1b4c`** | `ruby -e` on the regex: matched `== "visual"` as a write |
| 10 | `lesson_assistant_agent.rb:88` | **CONFIRMED — fixed in `4ff1b4c`** | parser probe: prompt rendered literally `- Title: ` |

### 3 and 4 — one cause the second round left open

`0002` bounded the scanner against *fences*. It did not bound it against *the end of the structure*.
`last_marker_index` still meant "the last line anywhere that looked structural", so:

    A) Yes / B) No / CORRECTA: A / EXPLICACIÓN: Because yes.
    <a mermaid diagram>
    Answer: think about it before moving on.

the trailing `Answer:` line overwrote `correct_letter` with prose — which leaves no option marked
correct, so `BlockGrader` turns the check into an unanswerable, non-gating block — **and** moved the
aftermath boundary past the diagram, deleting it. The same loss WP-33 §2 exists to close, arriving
through the scanner instead of the slice.

And a wrapped value belonged to nobody. Only the first line of `EXPLICACIÓN:` was captured; the rest
fell past the last marker into the aftermath, which `_aftermath.html.erb` renders **always and
ungated** under the check — so the tail of the answer explanation printed in the lesson before the
student had answered.

The run is now contiguous: it stops at the first line that is neither a marker, a blank, nor the
wrapped rest of the marker above it. A blank line does **not** end it (options arrive
blank-separated); a fence or heading does. Two guard tests pin both halves so it cannot be
"simplified" into "ends at the first blank line".

### 6 — the lock closed the write, not the decision

`generate` resolves the section and checks `image_url` **outside** the lock, then calls
`mark_generating!`. Two clicks before either job lands both see it blank, both pass, both enqueue a
paid job; `SectionImageJob:28` only rejects a job enqueued after the first has already committed a
URL, which is the case that was never the problem.

The guard needed already existed and had no reader: `image_status = "generating"` was written here
atomically under the lock, and the only code that ever read `image_status` was the poll endpoint,
looking for `"failed"`. `mark_generating!` now reports whether it won the claim.

**One hole left open on purpose.** It returns `:no_metadata` for a step whose `parsed_sections` has
not been written yet — that step renders from `AiContent` through `SectionResolver`
(`SectionImagesFallbackTest`) and there is nowhere to record a claim. The caller enqueues anyway,
because a dead Generate button is worse; such a step can still be double-clicked into two paid jobs.
Closing it means persisting a claim for a step that has no array yet, which is a WP-34 spend-guard
decision, not this package's.

### 8 — the one finding that did not survive verification

I reported that a line added after `mark_generating!` would raise `StrictLoadingViolationError`.
**It would not.** `with_lock` does clear the association cache — measured,
`association(:learning_route).loaded?` goes `true → false` across the block — but reading an
association afterwards silently issues a second query, even in development with
`action_on_strict_loading_violation = :raise` and no `strict_loading: false` on the association.
So there is no code change: the real cost is a wasted eager-load, and today `generate` reads no
associations after the lock at all, so the cost is zero. What I fixed is the comment, which also
claimed this action reads `route.locale` off that chain. It does not; nothing in the file does.

## Verification — three runs per column, from a clean base, one suite at a time

`before` = `fe06b73`. `after` = `6fd75ec`. Suites run **sequentially, never in parallel** — this
runner shares one test DB and concurrent runs manufacture a flaky suite. All test writing finished
before the first baseline, because the runner re-globs and an inflated `before` column is silent.

| suite | before | after |
|---|---|---|
| `section_parser_boundaries_test.rb` | 26 runs, 417 assertions | 35 runs, 465 assertions |
| `lesson_section_parser_test.rb` | 34 runs, 107 assertions | 34 runs, 107 assertions |
| `check_aftermath_rendering_test.rb` | 5 runs, 22 assertions | 6 runs, 24 assertions |
| `block_titles_have_no_language_test.rb` | 6 runs, 10 assertions | 7 runs, 17 assertions |
| `section_images_double_spend_test.rb` | *absent* | 4 runs, 11 assertions |
| `section_images_fallback_test.rb` | 4 runs, 18 assertions | 4 runs, 18 assertions |
| `step_metadata_write_isolation_test.rb` | 6 runs, 14 assertions | 6 runs, 14 assertions |
| `wp33_reparse_test.rb` | 10 runs, 37 assertions | 12 runs, 48 assertions |
| `check_aftermath_is_shown_test.rb` | *absent* | 3 runs, 30 assertions |
| **total** | **91 runs, 625 assertions** | **111 runs, 734 assertions** |

**0 failures, 0 errors, 0 skips in every cell, and all three runs of each column were byte-identical
— including the system suite, which is the one I de-raced.** Raw per-run output is in the session
scratchpad (`before.txt`, `after.txt`).

This table covers only the files this round touched. The FULL three-suite verification that was
still owed at the end of round two is now the **Round 3** column of the table under
[§Verification](#verification) above.

`bundle exec rubocop`: **590 files inspected, no offenses detected.**

## What this round did not do

- **Did not push.** The owner pushes.
- **Did not re-generate any lesson.** That costs money.
- **Did not touch the generator prompt.** Still a content decision, as in round one.
- **`0002`'s design decision stands, unoverruled:** the aftermath shows on the check's **own**
  section after the modal, costing one extra Continue, rather than being prepended to the next
  section. The README's reasons hold up — it keeps the aftermath under the check's own
  `section_index`, and it works when the check is the last section before the auto-appended summary.
- **A sibling of finding 3 was found in `parse_heading_drag_drop`, and I fixed it — outside the ten
  this round was scoped to.** Flagging it as a scope call rather than burying it: revert `6fd75ec`
  alone if you disagree. I had written this up as a hedge ("*would* move the boundary") and then
  measured it before shipping the claim, which was the right order, because it is worse than the
  hedge. Trailing prose that merely mentions the arrow — `write it as term ==> meaning when you
  practise`, a natural thing for a Match block's own prose to say — produced:

      pairs: ["Dog", "Cat", "Write it as term"]     # a junk pair on the board
      aftermath: nil                                # the mermaid diagram, deleted

  I fixed it because it is the same defect as finding 3, one function lower in a file this round was
  already editing, and it destroys author content. `0002` bounded both scanners against fences;
  neither was bounded against the end of its own structure, and that second half is what findings 3
  and 4 were really about.
- **A bare `## Match` with no colon is still parsed as a concept titled "Match"** — unchanged from
  round one, still pre-existing, still out of scope.
- **The four known engine failures, the red CI** (`scan_ruby` brakeman exit 5, `scan_js` DOMPurify
  /Mermaid warnings) **and the owed prompt investigation** are all unchanged from round one.


---

# The third review round

Two more patches, in `tmp/wp33-review-3/`, cut against `f86ad3e`. Applied as its README specifies.

    b34989d  test(parser): the run follows the template's grammar, red first
    469693c  fix(parser): a check's marker run follows the template's grammar
    666f340  feat(census): count persisted boards whose pairs are separated by blank lines

`0001` red against `f86ad3e`, **3 failures in the boundaries suite** exactly as the README said
(38 runs, 471 assertions):

- `a marker-shaped line straight after a blank does not rejoin a finished run` — `Expected: "Yes" / Actual: nil`
- `a second CORRECTA or a late option never overwrites the first` — `Expected: 2 / Actual: 3`
- `prose directly under CORRECTA is aftermath, not a wrapped value`

`0002` green: **72 runs, 590 assertions, 0F 0E** across the boundaries and parser suites.

## Finding 3 was still open, and my own guard test is why I did not know

This is the part worth recording, because the failure was in the *test*, not the fix.

Round two closed finding 3 with a contiguous marker run, and I pinned it with a guard test that I
believed exercised the shape. It did not. The fixture was:

    A) Yes / B) No / CORRECTA: A / EXPLICACIÓN: Because yes.
    <blank>
    Here is the diagram you need:        <- a plain prose line
    <blank>
    ```mermaid … ```
    <blank>
    Answer: think about it before moving on.

The plain sentence ended the run three lines before the `Answer:` line was ever scanned. So the test
passed for a reason unrelated to what it claimed to check, and the **actual** shape of finding 3 —
`EXPLICACIÓN:`, blank, `Answer: …`, with nothing in between — still overwrote `correct_letter` with
prose and still deleted the line. `Expected: "Yes" / Actual: nil` above is that defect, surviving a
round that reported it fixed.

The mechanism the contiguity rule missed: a blank line does not end the run (options arrive
blank-separated, which round two pinned deliberately) and a marker-shaped line was accepted
unconditionally. So blank-then-marker walked straight back into a run that was finished. "Contiguous"
was necessary and not sufficient.

`0002` replaces the positional rule with the template's **grammar** — options, then one `CORRECTA`,
then one `EXPLICACIÓN`, which is what `lesson_content.yml` asks for. A marker-shaped line the grammar
no longer expects is prose that happens to open like a marker, and it ends the run and becomes
aftermath. The first `CORRECTA` and the first `EXPLICACIÓN` win. Separately, a line directly under
`CORRECTA` (a single letter, which wraps nothing) was being consumed as a wrapped value with nowhere
to put it and was therefore deleted; it is aftermath now too.

The lesson I am taking from it: a guard test whose fixture contains an *earlier* sufficient cause
proves nothing about the cause it names. Round two's fixture had a plain prose line doing the work
the blank line was supposed to be tested against.

## The board's sibling: counted, not changed

`parse_heading_drag_drop` has the same variant — `Cat ==> Gato`, blank, `The arrow ==> means "maps
to".` still yields a third pair — and **the board rule is deliberately unchanged in this round**
(verified: the parser diff since `f86ad3e` touches neither `drag_drop` nor `pair_indexes`).

It is not fixable the way the check was. A check has a grammar to appeal to; a board does not, because
every pair looks identical and nothing distinguishes prose *about* the arrow from a pair *using* it.
That leaves ending the board at the first blank line — the shape the template actually shows — and
that is safe only if no board already in production is written with its pairs spaced out.

So `wp33:reparse_census` now counts them and prints the number:

    match boards persisted:                 N
      with pairs separated by blank lines:  M

`M == 0` means rule (a) would truncate nothing that exists and the board can take the same treatment
the check took. `M > 0` means those boards would lose pairs, and the rule should stay. **The number
decides it, before anyone changes the parser** — a parser change justified by a guess about
production content is precisely how `wp24:reparse_scenarios` shipped as a task nobody could run.

Counted from the persisted array and *before* the AiContent check, because a board in the cache is a
board a student sees whether or not its step is still position-compatible. Two false positives are
pinned shut: a blank between the last pair and trailing prose is the ordinary shape and is not
counted, and `==>` inside a mermaid fence is not a pair, so a blank above such a fence is not a blank
between pairs.

## Verification — the full three suites, at last

The full three suites, **three runs each from a clean base**, one suite at a time — added as the
**Round 3** column of the round-one table under [§Verification](#verification) rather than replacing
anything.
All nine runs identical; the combined column's failure set was fingerprinted per run and is the same
four every time.

| | Round 3 (`666f340`) | vs. round 1's final column |
|---|---|---|
| Main | 783 runs, 3661 assertions, 0F 0E | +12 runs, +43 assertions |
| Browser | 69 runs, 513 assertions, 0F 0E | +3 runs, +30 assertions |
| Combined | 1220 runs, 5620 assertions, 3F 1E | +27 runs, +139 assertions |
| RuboCop | clean, 590 files | +2 files |

The combined 3F/1E are the four known engine failures, unchanged and untouched:
`RouteGenerationJobTest`, `RouteGeneratorTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`.

## Open after this round

- **The board variant**, above — the census will say whether rule (a) is safe. Nothing else in
  `parse_heading_drag_drop` changed.
- **The `:no_metadata` hole in the image claim** (round two) — a step with no persisted
  `parsed_sections` can still be double-clicked into two paid jobs.
- **`0002`'s one-extra-Continue design** for showing a check's aftermath, still unoverruled.
- **A bare `## Match` with no colon** is still parsed as a concept titled "Match". Pre-existing.
- **CI is still red** from `scan_ruby` (brakeman exit 5 on the known `permit!`) and `scan_js`
  (6 DOMPurify/Mermaid warnings), and **the prompt investigation is still owed**.
- **Nothing is pushed.** The owner pushes.
