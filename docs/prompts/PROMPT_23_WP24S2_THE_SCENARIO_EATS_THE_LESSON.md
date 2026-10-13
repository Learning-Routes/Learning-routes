# WP-24 §2 — The scenario parser has no terminator, so the last option eats the rest of the lesson

Branch: `wp24s2-scenario-terminator`, off `main` at `46e067a` or later.

This is the one section of WP-24 that was not done. §1 (the quiz timer) and §3
(`BlockGrader.answerable?`) shipped and are verified in production. Do not touch them.
`PROMPT_17_WP24_THE_UNFINISHABLE_LESSON.md` §2 is the origin of this brief; this file
supersedes it, because three things it did not know turned out to decide the fix:

1. `split_by_headings` already cuts the document on `^##\s` (`lesson_section_parser.rb:189-194`),
   so the body a `parse_heading_*` method receives **never contains a `##` line**. What it
   does contain — and what was observed inside a consequence in production — is `###`
   sub-headings, fenced code blocks (a mermaid `sequenceDiagram`), and trailing prose.
2. Parsed sections are **persisted**. `ContentPipelineJob#stage_section_parsing!`
   (`content_pipeline_job.rb:167-180`) and `SectionResolver#parse_and_persist!`
   (`section_resolver.rb:42-60`) write `metadata["parsed_sections"]`, and
   `StepsController#show` (`steps_controller.rb:377-379`) renders from that cache when it
   exists. A parser fix alone changes nothing a student can see on any lesson that already
   exists.
3. `block_attempts.section_index` indexes into that persisted array
   (`route_step.rb:120-145`, `20260811000001_create_block_attempts.rb:26,48`). A fix that
   changes the **number or order** of sections for an existing step silently re-points
   every recorded attempt at a different block. The fix must keep the section count.

House rules, unchanged: bugs before features; every fix ships with the test that prevents
its whole class, and that test is shown red first; every claim in your handoff is
something you ran, not something you read. Prompts, code, comments and commits in English.

---

## §1 — Give the loop a terminator, and keep what it was swallowing

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

Once the last `OPTION X` line is seen, every remaining line of the section is appended to
that option's consequence — sub-headings, fences, prose — and `.join(" ")` collapses the
newlines, which is why a mermaid diagram that reached this path could never have drawn
anywhere. Observed on `/learning/routes/60452d4b…/steps/3700fee4…`: option B revealed the
word `Consequence.` followed by a whole `sequenceDiagram` fence and its Spanish explanation
on one line, with `**bold**` markers printed literally. Option A, not being last, showed
only `Consequence.`.

### What to do

An option's consequence ends at the first line that is any of: the next `OPTION` marker, a
fence delimiter (`` ``` ``), a heading of level 3–6 (`^#{3,6}\s` — level 2 cannot occur
here, see above), or a horizontal rule (`---`, `***`, `___`). The situation ends at the
first `OPTION`.

Everything from that terminator to the end of the body is the **aftermath**. It is real
lesson content the author placed after the exercise. It does not vanish, and it does not
become a new section (rule 3 above). Return it on the same section:

```ruby
{ type: "scenario", title:, situation:, options:, aftermath: tail_markdown.presence, body: }
```

Render it in `_scenario.html.erb` below the card, through
`ContentEngine::MarkdownRenderer.render(section[:aftermath])` — the renderer already emits
the mermaid container (`markdown_renderer.rb:18-26`) and sanitizes (`markdown_renderer.rb:93`).
Read `_concept.html.erb:20` for the exact call the other partials use. Whether the aftermath
is shown always or only after a choice is a product question; show it always, and say so in
the commit — a hidden diagram is the bug we are fixing.

Newlines inside a consequence are preserved (`join("\n")`), not flattened. §2 decides how
they are rendered.

### Re-parse what is already persisted

Write `lib/tasks/wp24_reparse_scenarios.rake` with two tasks, in the style of
`lib/tasks/wp21_stuck_checks.rake` and `wp29_reinforcement_cleanup.rake`:

- `wp24:scenario_census` — read only. For every `RouteStep` whose
  `metadata["parsed_sections"]` contains a `"scenario"` section, re-run the parser on the
  step's `AiContent.body` (resolve it the way `SectionResolver#lesson_content` does, `section_resolver.rb:63`) and
  report: steps scanned, steps whose scenario consequences change, steps where a non-empty
  aftermath is recovered, and steps where the new parse would **not** be position-compatible
  (different count, or a different `type` at any index). Print the ids of the incompatible
  ones. Modify nothing.
- `wp24:reparse_scenarios` — rewrite `metadata["parsed_sections"]` **only** for steps where
  the new parse is position-compatible. Skip and list the rest. Idempotent. Print counts.

A rake task, not a migration: `bin/docker-entrypoint:16` runs `db:prepare` on every boot.

---

## §2 — The consequence reaches the student as raw text, with `&quot;` in it

`_scenario.html.erb:22`:

```erb
data-consequence="<%= option[:consequence]&.gsub('"', '&quot;') %>"
```

`<%= %>` escapes the string it is given. The `&` of `&quot;` becomes `&amp;quot;`, the
browser decodes the attribute back to the six literal characters `&quot;`, and every
consequence containing a double quote shows `&quot;` to the student. Then
`scenario_controller.js:36` does `this.consequenceTextTarget.textContent = consequence`,
so markdown emphasis prints as `**asterisks**` and line breaks are gone.

### What to do

Stop shipping the consequence through an attribute. Render each option's consequence
server-side, through `MarkdownRenderer`, into its own hidden element — one per option,
addressable by index (`data-scenario-target="consequenceFor" data-option-index="<%= i %>"`,
or a `<template>`). The controller reveals the one whose index matches the clicked option
and never touches text content. The `gsub`, the `data-consequence` attribute and
`consequenceText` go away.

### The vocabulary must match the contract

A scenario has **no correct option**. That is the generator's contract
(`lesson_content.yml:203-209`: `OPTION A: … / Consequence.`; `curriculum_design.yml:184`:
"a situation plus 2-3 choices, each with a consequence. Decision practice"), and the
grader's (`block_grader.rb:25,30`: `scenario` is in `GATING_TYPES`, not `GRADABLE_TYPES`).
The parser produces no `correct` flag because there is none to produce.

The partial contradicts this: `Result:` (`_scenario.html.erb:37`) implies a verdict and
`Try Again` (`_scenario.html.erb:46`) implies there was a right answer to reach. Both are
hardcoded English inside a Spanish UI. Replace them with locale keys under
`learning_engine.blocks` (next to `badge_scenario`, `es.yml:1014`) that say what the thing
is — the consequence of a choice, and the option to explore another choice — in both
locales. Keep the reveal-and-reset behaviour; rename it, do not regrade it. Making scenarios
gradable would be a contract change to the generator and belongs in the roadmap, not here.

---

## §3 — Option A said `Consequence.` because the template says `Consequence.`

`lesson_content.yml:203-209`:

```
## Scenario: [title]
  Describe the situation.
  OPTION A: First choice
  Consequence.
  OPTION B: Second choice
  Consequence.
```

Every other placeholder in that template is bracketed (`[title]`). These three are plain
sentences, and the model echoed one of them verbatim into a real lesson. Bracket them —
`[describe the situation]`, `[first choice]`, `[what happens if the student picks A]` — and
say in one line that the consequence may be one or two sentences of prose. Separate commit;
it is a prompt change, and it should be reviewable on its own.

---

## The test that prevents the class

The class is **"a heading parser accumulates without a terminator and swallows the rest of
the section"**. `parse_heading_scenario` is not the only one with that shape:

- `parse_heading_flashcards` (`:422-456`) appends every non-marker line to the current
  front or back until a `---`; after the last `BACK:` it swallows the remainder.
- `parse_heading_code_playground` (`:364-375`) makes **everything** after the code fence the
  `expected_output`.
- `parse_heading_fill_blank` (`:355-361`) makes the whole body the sentence.
- `parse_heading_simulation` (`:377-397`) takes the first prose line containing `=` as the
  formula.

Write `engines/content_engine/test/services/content_engine/section_parser_boundaries_test.rb`.
For **every** `parse_heading_*` method, build a body that is the block's canonical content
followed by, in order: a `###` heading, a fenced `mermaid` block, a `---` rule, and two
lines of prose. Assert that no field of the parsed block contains any of the trailing
content, and — for the types that gain an `aftermath` — that the aftermath contains all of
it, in order, with its newlines intact. Assert `sections.size` is unchanged by the fix.

The scenario case must fail today with the fence inside `options.last[:consequence]`.
Paste that red run in the handoff. Where the sweep turns other parsers red, fix them in
the same shape or explain in the handoff why a given one is out of scope — do not delete
the assertion.

Also:

- A parser test that a consequence keeps its newlines and a double quote, and a view/system
  test that the rendered consequence contains the quote and no `&quot;`, and contains
  `<strong>` where the source had `**`.
- A test on `wp24:reparse_scenarios` that a step whose new parse would change the section
  count is skipped and reported, not rewritten.
- A test that `_scenario.html.erb` renders no English literal: assert against the locale
  keys, not the strings.

---

## Order

1. §1 parser terminator + aftermath, with the boundaries sweep red first.
2. §2 server-rendered consequences and the vocabulary/i18n change.
3. §1's rake tasks, tested against a fixture step with a persisted broken parse.
4. §3 the template placeholders.

## Verification

Before and after, three runs each: main suite, browser suite, combined with engines, exactly
as WP-29's handoff tabulated them (1005 tests, 3766 assertions, the four known engine
failures and nothing else). RuboCop clean. Then, in a browser against your dev server,
the fixture lesson: option B shows a sentence with its emphasis rendered, option A shows
its own sentence, the diagram draws below the card, and no `&quot;` anywhere.

Write `WP24S2_HANDOFF.md`: what changed and why, the red-then-green output of every new
test, the census/reparse commands the owner runs on the production box
(`kamal app exec 'bin/rails wp24:scenario_census'` first, then `reparse_scenarios`), and
what you did not do.

## Not in this package

Grading scenarios (contract change). The answer-key hallucination in assessments (WP-31).
`raise_on_missing_translations` (safety-net package). Anything in WP-23. Re-generating
lessons whose scenarios came out empty — that is content, not parsing, and costs money.
