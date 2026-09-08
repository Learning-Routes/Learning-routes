# WP-33 — What the re-parse would destroy, and what the parser still drops

**Written:** 2026-09-08 · **Branch:** `wp33-reparse-keeps-what-it-did-not-make`, base `main` @
`d5bdaaa`. **Tree clean. Not merged, not deployed. Nothing run against production.**

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

## Verification

Three runs of each, one suite at a time. The **before** column is from a clean checkout of
`d5bdaaa` with nothing else running and no test files written during the run — the discipline the
last two packages got wrong.

| Suite | Before (`d5bdaaa`) | After |
|---|---|---|
| Main (`bin/rails test`) | 751 runs, 3559 assertions, 0F 0E | **768 runs, 3608 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 66 runs, 483 assertions, 0F 0E | **66 runs, 483 assertions, 0F 0E** |
| Combined (`bin/rails test test engines/*/test`) | 1161 runs, 5263 assertions, **3F 1E** | **1184 runs, 5437 assertions, 3F 1E** |
| RuboCop | clean, 585 files | **clean, 588 files** |

All nine runs of each column identical. The combined failures are the four known engine ones,
unchanged: `RouteGenerationJobTest`, `RouteGeneratorTest`, `GapAnalysisJobTest`,
`ReinforcementJobTest`. **I did not touch them.**

New tests: **23** — 9 reparse (including the concurrency case and the §1–§4 integration), 4 check
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
