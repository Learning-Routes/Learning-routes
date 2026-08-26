# WP-15 handoff — the match block, procedural variation, and the dead space

**Branch:** `wp15-match-variants`, branched off `main` (`adfbc37`) after confirming with the
owner. `wp7-true-costs` is unmerged and touches nothing in this package — the two diffs do
not overlap in a single file.

**Not deployed.** A human deploys.

Out-of-scope findings are in `FINDINGS_WP15.md`.

---

## §A — the match block

### A1 confirmed, against the code

`drag_drop_controller.js:102` read `term.dataset.placedDef`. `grep -rn "placedDef\|placed_def"`
over the whole repository returns **one** line: that read. Nothing has ever written it.
`checkMatch()` set inline styles and added to `this.matched`, and that was all it recorded.

So `_submitMatches()` built `matches = {}` every time, `BlockGrader#grade_drag_drop` hit
`return graded(false, 0) if matches.empty?`, the attempt was never satisfied, and
`interactive_lesson_controller.js` kept `_locked = true`. The gate was working exactly as
designed on a submission that was structurally empty. That is why the owner saw
"¡Todo emparejado!" over a footer that still said "Responde para continuar".

**Fix:** `checkMatch` writes `term.dataset.placedDef = defIndex` on a correct placement.

**Checked, and left alone:** the six other block controllers. `fill_blank` sends `answers`,
`lesson_check` sends `option_index`, `scenario` sends `choice_index`, `flashcards` sends
`ratings`. Only `drag_drop` had this defect.

### A2 confirmed, against the code

The old partial:

```erb
<% section[:pairs]&.shuffle&.each_with_index do |pair, i| %>   <%# terms: SHUFFLED %>
    data-term-index="…i…"                                      <%# then re-indexed BY POSITION %>
    data-correct-def="…i…"                                     <%# pointing at the same row %>
…
<% section[:pairs]&.each_with_index do |pair, i| %>            <%# definitions: NOT shuffled %>
    data-def-index="…i…"
```

The terms were shuffled and then renumbered by their new position while the definitions kept
the stored order, so the shuffle erased itself. Two consequences, and the second is the one
that matters:

1. `data-correct-def` always equalled the term's own row, so the answer was always the
   definition beside it.
2. The pairing shown was **wrong**, and the block certified it. `checkMatch` compares
   `term.dataset.correctDef === defIndex`, so a student who dropped *Tipo de instancia* onto
   *Computadora virtual que ejecutas en AWS* — which is the definition of **Instancia** — got
   a green border and "¡Todo emparejado!".

`grade_drag_drop` compares `matches[i] == i` against the stored `pairs`. That is only
meaningful if the DOM indices are faithful to the array, and they were not. **Fixing A1 alone
would have shipped a grader that certifies wrong pairings**, which is why both are in one
commit.

**Fix:** both columns are permuted, independently, and every element keeps its **original**
index in `data-term-index`, `data-def-index` and `data-correct-def`. `BlockGrader` is
untouched.

The test that A2 would have failed is
`block_variant_rendering_test.rb#test_matching_row_for_row_by_screen_position_no_longer_grades_correct`:
it reads the rendered orders, pairs row *k* with row *k*, and asserts the server says wrong.
Under the old partial that submission was the guaranteed-correct answer.

### A3 — the release valve was unreachable

`_submitMatches()` fired only when every term was placed, and a wrong drop bounced without
submitting. So `BlockAttempt#attempts` could not increment on a failure, `RELEASE_AFTER = 3`
could never fire, and — given A2 proves the answer keys were wrong — a student facing one was
trapped with no way past the block.

A wrong placement now submits. The UI is unchanged (the drop still bounces); this is about
the record. The wrong pairing is included in **that** submission so the stored payload is what
the student actually did, but it is not written to the DOM, so the next submission does not
carry it.

---

## §B — `BlockVariant`

### Where it lives, and why

`LearningRoutesEngine::BlockVariant`, in `learning_routes_engine`.

`content_engine` was the alternative the brief offered, and it is the wrong way round:
`content_engine.gemspec` and `assessments.gemspec` both declare `add_dependency
"learning_routes_engine"`, and the reverse dependency does not exist. Putting the service in
`content_engine` would put it out of reach of `assessments`, where two of the three named
future callers live. `learning_routes_engine` is the engine both of the others already depend
on, and it owns `RouteStep` and `BlockAttempt`, which is where the seed comes from.
`content_engine` owns the block *vocabulary* — what a `drag_drop` is — not the student's
*state*, and variation is a function of state.

### The seed, in one paragraph

`digest(DIGEST_NAMESPACE, user_id, route_step_id, section_index, attempt_number, salt)`,
SHA-256, first 64 bits, fed to `Random.new` and used to `shuffle` the index range. `user_id`
makes two students' boards different; `route_step_id` and `section_index` make two blocks on
the same page different; `salt` makes the terms column and the definitions column of the
*same* section permute independently, which is the whole reason the positional shortcut
cannot come back; and `attempt_number` is `BlockAttempt#attempts` for that
`(user, route_step, section_index)` triple, which the table already stores under
`idx_block_attempts_unique_per_section` and already increments on every submission, so nothing
new is persisted. It is `attempts` rather than a timestamp because a timestamp changes on
every render and would scramble a board the student is halfway through, and rather than a
session value because a session value does not survive a logout or a second device — both of
which break "stable within an attempt". The parts are joined with a separator that cannot
appear in a UUID, an integer or one of our salts, so `("ab","c")` and `("a","bc")` cannot
collide, and a `DIGEST_NAMESPACE` constant keeps a future caller that happens to pass the same
integers out of the same seed space.

### The first render, before any `BlockAttempt` row exists

`StepsController#load_satisfied_sections!` plucks `(section_index, attempts, completed_at)`
for this student and this step in **one** query and builds `@block_attempt_counts`. A section
with no row is simply absent from that hash, so `block_variant_for` reads `nil.to_i` → `0`.
Attempt 0 is a first-class value, not a special case: it is just the permutation the student
sees before they have submitted anything. Pinned by a test.

### No step context (preview, agent reply)

`BlockVariant.for` takes `user:` and `route_step:` as either a record, an id, or `nil`. Every
part is stringified into the digest, so a `nil` contributes an empty segment and the result is
still a deterministic permutation. Nothing raises and nothing branches. The helper reads
`current_user` through `respond_to?` so a view context that has no such helper also does not
raise. This matches `submitBlock`, which already returns `null` rather than throwing when
there is no `data-block-url-value` on the page.

The consequence, stated plainly: in a preview every viewer sees the same board. That is
correct — there is no student to vary for.

### Applied to `check` as well

`_check.html.erb` rendered options in stored order, so a generator that favours putting the
correct option first made position a tell. The options are now permuted with the `"options"`
salt; each keeps its original index in `data-option-index`; `correct_index` and
`data-lesson-quiz-correct-value` are unchanged because they were already original indices.

This exposed a real bug on the way: **`lesson_check_controller` and `lesson_quiz_controller`
both derived the chosen option from DOM position** — `optionTargets.indexOf(btn)` — and
compared it against an index into the *stored* array. Correct while the two orders coincided;
wrong the moment the board is permuted. Both now read `data-option-index` through one shared
`originalIndexOf` helper in `block_submission.js`.

### One tension, stated rather than hidden

A3 makes `attempts` increment on every wrong *placement*, not once per completed round. So
the board is stable until the student gets something wrong, and new on the next render after
that. "Stable within an attempt" holds in the sense that matters — nothing re-renders the
section while the student is working in it (`_transitionToSection` reveals sections that are
already in the DOM; the block submits by `fetch` and never re-renders) — but a student who
fails a placement and *then* reloads gets a fresh board. Placements are client-only state and
a reload loses them regardless, so nothing is destroyed that survived anyway.

---

## §C — the dead vertical space

**Measured in a real headless Chrome against a real 15-section lesson at 1440px**, walking
from the last ink inside `.lesson-sections-container` to the top of the likes bar and
subtracting every interval that actually carries text or a graphic.

| | span | ink | **dead** |
|---|---|---|---|
| Before | 415px | 90px | **325px** |
| After | 223px | 90px | **133px** |

**−192 dead pixels, −59%.**

### What the 192px was

Four places reserved room for `.lesson-nav-footer`. That footer is `position: fixed` to the
viewport, so it never overlaps any of them — it only overlaps whatever is at the bottom of the
scroll. All four were reserving space where the footer is not.

| Where | Was | Now |
|---|---|---|
| `.lesson-sections-container` | `padding-bottom: 5rem` (80px) | removed |
| AI-tools wrapper | `padding: 0 1rem 6rem` (96px) | `padding: 0 1rem` |
| `#ai_supplementary_*` | `margin-top: 1rem` on an empty div (16px) | `.lesson-ai-supplementary:not(:empty)` |
| `.step-page` (the outer wrapper) | `padding-bottom: 3rem` | `calc(var(--lesson-footer-h) + 1.5rem)` |

`--lesson-footer-h: 5rem`. The footer measures 78px (0.75rem padding above and below a 48px
button, plus a 1px border); 5rem leaves room for a longer label.

The last row is the fix, not another reserve: the footer's clearance is now taken **once**, at
the bottom of the scroll, which is the only place it is needed. The page previously reserved
3rem for a 78px footer, which is why the footer covered the "Comentar" button — visible in
`before_1440.png`, gone in `after_1440.png`.

### `min-height: 12rem`: dropped, with evidence

Every section of the real lesson was revealed in turn and the container measured with the
floor in force and with it removed:

```
idx  type          floored container   unfloored container
 0   concept            433                  433
 1   concept            836                  836
 2   check              192                   80      <-- binds
 3   concept            409                  409
 4   visual             422                  422
 5   drag_drop          482                  482
 6   check              192                   80      <-- binds
 7   concept           1027                 1027
 8   example            496                  496
 9   check              192                   80      <-- binds
10   tip                406                  406
11   visual             422                  422
12   fill_blank         259                  259
13   check              192                   80      <-- binds
14   summary            609                  609
```

It binds on exactly one block type. `check` renders its body into a `position: fixed` modal
and therefore occupies 0px in flow; every other type measured 179–1027px, all above the 192px
floor, so the blanket floor only padded blocks that did not need it.

It is **not** a transition guard either. `_transitionToSection` sets
`incoming.style.display = ""` and only hides the outgoing section inside a 400ms `setTimeout`,
so both are in flow for the whole animation and the container is never empty. There is no
frame the floor protects.

So the floor moved to the one section that needs it:
`.lesson-section[data-section-type="check"] { min-height: 12rem; }`.

### The 133px that remain

They are rhythm, not reserve: 73px between the end of the lesson body and the "HERRAMIENTAS
IA" label (the divider's own `margin-top: 1rem` + `padding-top: 1.5rem`, plus the section's
trailing space), 12px under that label, 7px between the two rows of AI buttons, and 40px above
the likes bar. Each is a separator between two things that are genuinely separate. Removing
them would be tuning by eye, which the brief ruled out and I agree with.

---

## §D — the sidebar and the page

Measured at both widths, before and after.

| | outer | content col | aside | stranded right of aside |
|---|---|---|---|---|
| Before @1440 | 1312px `[64..1376]` | **800px** | `[924..1228]` | **128px** |
| After @1440 | 1152px `[144..1296]` | **768px** | `[972..1276]` | **0px** |
| Before @1920 | 1312px `[304..1616]` | **800px** | `[1164..1468]` | **128px** |
| After @1920 | 1152px `[384..1536]` | **768px** | `[1212..1516]` | **0px** |

### One correction to the brief's premise

The brief said "the page is not centred: the left margin is ~1.25rem and the right is ~9rem."
Measured, the outer container **was** centred — 64px on both sides at 1440, 304px on both at
1920. The asymmetry the owner is seeing is one level in: the row claimed 82rem and could only
use 71.5rem of it, and `justify-content: flex-start` put the leftover **128px inside the
container, to the right of the sidebar**. Identical at both widths, because the leftover is a
property of the fixed track widths, not of the viewport.

### The fix

A grid, as directed — `grid-template-columns: minmax(0, 1fr) var(--step-sidebar-w)` — so the
sidebar is pinned to the right track. On its own that would hand the whole 128px to the
reading column and make the prose measure 928px, which is too wide to read. So the container
is also capped at exactly `measure + gutter + sidebar + 2 × padding`, which means `1fr`
resolves to the measure and there is no leftover to strand in the first place. The page is
then genuinely symmetric at every width, and narrower — 1152px instead of 1312px at 1440.

Below the `xl` breakpoint the grid collapses to a single `minmax(0, 1fr)` column and the aside
goes full width, exactly as the old `flex-direction: column` override did.

### The reading measure

There were **four** different numbers, not two: 48rem for the lesson body, 50rem for the likes
bar / navigation / comments, and 48rem again hardcoded separately in eleven block partials.
All of them now read `--step-measure: 48rem`. Measured after: 768px for the lesson body, the
likes bar, the navigation **and** the comments — one number where three of them used to be
800px.

### The Continue button was ~190px out

Found while measuring §C. `.lesson-nav-footer` spans the viewport and centred its inner bar on
the *viewport*, but that bar's own column sits to the left of the sidebar. The footer now
mirrors the page grid. Measured after: the footer's actions box is `[164..932]` and the reading
column is `[164..932]` — exact.

### `INFO DEL PASO`

Four visually identical tinted, rounded, full-width rows read as four buttons and spent most
of the card's height on chrome. Same four facts, same theme variables, **no new colours**: a
`<dl>` of label/value rows separated by `var(--color-border-subtle)`, which is the hairline
the rest of the page already uses. `--color-muted` for the labels, `--color-txt` for the
values, `--color-tint` dropped entirely. Both screenshots are dark-theme, so the fix that
removed seven partials' hardcoded light hex is visibly still in force.

### Screenshots

`before_1440.png`, `after_1440.png`, `before_1920.png`, `after_1920.png` in the session
scratchpad. The before shots show the two empty bands, the empty strip to the right of the
sidebar, the offset Continue button, and the footer covering "Comentar". The after shots show
the comments section fitting on one screen at 1440, which it did not before.

---

## §A proved in a browser, not only in a test

A Rails test does not load JavaScript, so §A was driven end to end in headless Chrome against
the dev server, through the **keyboard** path (see finding 5 — the keyboard path is itself
something this package repaired).

**The board, as rendered:**

```
termOrder   [0, 1, 3, 2]     termText  Sustantivo, Verbo, Frase común, Adjetivo
defOrder    [3, 2, 0, 1]     zoneText  "Como vai?", "Grande", "Casa", "Correr"
correctDefs [0, 1, 3, 2]     == termOrder, i.e. every term still points at its own pair
```

Row 1 shows *Sustantivo* beside *"Como vai?"*, which is not its definition. Under the old
partial that pairing would have been marked correct.

**One wrong placement:**

```
attempts 1 · correct false · satisfied false
stored payload {"matches": {"0": "3"}}          <- the wrong pairing, recorded
block:graded {correct: false, attempts: 1, attempts_remaining: 2, released: false}
```

Before this package that submission did not happen at all.

**Three wrong placements:**

```
block:graded {correct: false, attempts: 3, attempts_remaining: 0, released: true, satisfied: true}
```

The release valve fires. `correct` stays `false` — released is not a pass.

**A clean run:**

```
attempts 1 · correct true · score 100.0 · satisfied true
stored payload {"matches": {"0":"0","1":"1","2":"2","3":"3"}}
feedback "¡Todo emparejado!"    footer "Continuar"    (unlocked)
```

**After a reload:** `data-block-satisfied="true"`.

Before A1 that same interaction produced `correct: false` on an empty payload and the footer
stayed locked, which is precisely what the owner reported.

---

## Tests

| Path | Before (`adfbc37`) | After |
|---|---|---|
| `env -u RAILS_MASTER_KEY bin/rails db:test:prepare test` | 227 runs, 653 assertions, 0F 0E | **242 runs, 767 assertions, 0F 0E** |
| `env -u RAILS_MASTER_KEY bin/rails test test engines/*/test` | 520 runs, 1478 assertions, 3F 9E | **550 runs, 1623 assertions, 3F 9E** |

**Red engine tests: 12 before, 12 after.** Measured as the intersection of 3 runs on each
side — all three runs agreed exactly on both sides (`3 failures, 9 errors`), and the twelve
names are identical: four `ContentEngine::AudioControllerTest`, four
`ContentEngine::SectionAudioControllerTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`,
`RouteGenerationJobTest`, `RouteGeneratorTest`. The same twelve WP-10 and WP-12 reported. Not
touched, as instructed. The "before" numbers were taken from a `git worktree` at `adfbc37`,
not inferred by subtraction.

`bin/rubocop`: 424 files, no offenses.

**30 new tests:**

- `BlockVariantTest` (15) — same seed → same permutation; a different `attempts`, user, step,
  section or salt → a different one; it is a permutation and not a sample; degenerate sizes;
  `nil` user and `nil` step do not raise and stay deterministic; the separator actually
  separates; attempt 0 is the first render.
- `BlockVariantRenderingTest` (15) — every rendered term carries its original index and the
  definition it truly belongs to; the two columns are permuted independently; the board is
  identical on a reload and different after a failure; two students do not share a board; a
  submission built from the rendered DOM grades correct; a mismatched one grades incorrect;
  **matching row-for-row by screen position no longer grades correct**; three failures release
  without setting `correct`; the released block is published to the client as satisfied; the
  release response says satisfied-but-not-correct; `check` renders permuted and still grades
  against the original index; the correct option does not stay pinned to the first row; and two
  guards on the §C/§D geometry so the four reserves cannot quietly come back.

---

## What surprised me

1. **A2 was worse than the brief's own description, and in a direction that helps.** The brief
   said the block "marks wrong pairings as correct". It does — but the same renumbering also
   meant `data-correct-def` was self-referential, so the *client* was consistent with itself
   while being wrong about the data. That is why nobody noticed: every internal check agreed.

2. **§B's real cost was in the JavaScript, not the view.** Permuting the `check` options is
   four lines of ERB. Making it *correct* required finding that two controllers were deriving
   the graded index from DOM position, which was invisible until the two orders stopped
   coinciding. A test that asserted "the right option grades correct" would have passed before
   and after, because it would have clicked the right option either way.

3. **The keyboard path had never worked.** Two `data-action` attributes on one element; the
   parser keeps the first. `role="option"` and `tabindex="0"` were advertising an interaction
   that could not happen. I only found it because I needed that path to drive the browser
   proof.

4. **The brief's §D premise was measurably wrong, and the real defect was adjacent.** The page
   was centred. The 128px was stranded *inside* the container, to the right of the sidebar,
   and it was identical at 1440 and 1920 because it is a function of the track widths. Reading
   the template would have given the same wrong answer the brief gave; measuring gave the right
   one in one pass.

5. **Three of the four §C reserves were reserving space where the footer never is.** A fixed
   element needs clearance at the bottom of the *scroll*, once. Reserving it after the lesson
   sections, after the AI tools, and on an empty div reserved it three times in three places
   the footer cannot reach — while the one place that needed it, the bottom of the page, had
   3rem for a 78px footer and was letting the footer cover the "Comentar" button.

6. **`min-height: 12rem` was inert on 11 of 15 sections.** It only ever bound on `check`, whose
   content is a fixed modal. I would not have believed that from reading the CSS; the probe
   that reveals each section in turn with and without the floor answered it in one run.
