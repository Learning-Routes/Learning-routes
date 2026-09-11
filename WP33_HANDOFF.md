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

| Suite | Before (`d5bdaaa`) | At `7036973` | After the review fixes |
|---|---|---|---|
| Main (`bin/rails test`) | 751 runs, 3559 assertions, 0F 0E | 768 runs, 3608 assertions, 0F 0E | **771 runs, 3618 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 66 runs, 483 assertions, 0F 0E | 66 runs, 483 assertions, 0F 0E | **66 runs, 483 assertions, 0F 0E** |
| Combined (`bin/rails test test engines/*/test`) | 1161 runs, 5263 assertions, **3F 1E** | 1184 runs, 5437 assertions, 3F 1E | **1193 runs, 5481 assertions, 3F 1E** |
| RuboCop | clean, 585 files | clean, 588 files | **clean, 588 files** |

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
- **A third finding I reported is not fixed and is the one I would look at next:** the check's
  aftermath renders into a `.lesson-section` that `interactive_lesson_controller.js` never sets to
  `display: ""` on the forward path — `_showQuizModal` does not reveal the section, and
  `_handleQuizModalClose` transitions straight past it. So §2's recovered diagram is in the DOM and
  invisible unless the check is section 0 or the student presses Back. The integration tests assert
  server-rendered HTML, so they are green. **This is a JS change, not a parser one**, and it is why
  I would not call §2 delivered to the student yet even with the fixes above.
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
