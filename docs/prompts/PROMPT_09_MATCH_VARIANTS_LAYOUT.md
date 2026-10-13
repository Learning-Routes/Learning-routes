# PROMPT 09 — WP-15: the match block, procedural variation, and the dead space

> Run from `~/Documents/Learning-routes`.
> The working tree is currently on `wp7-true-costs` (HEAD `bd38b50`). **Confirm which branch
> the owner wants this on before committing** — `wp7-true-costs` is unmerged and this work is
> independent of it.
> Reference: `WP10_HANDOFF.md`, `WP12_HANDOFF.md`, `ROADMAP_v2.md`.

Three changes, reported by the product owner from the live site, in this order. Each was
located in the code before this prompt was written — the line numbers and the reasoning are
below so you do not re-derive them. **Verify each premise yourself before fixing it**; two
agent reports in this project have stated things that were not true.

---

## §A — The match block: two defects, and the second one is worse

The owner completed every pair, the block printed "¡Todo emparejado!", and the footer still
read "Responde para continuar".

### A1 · The submission is always empty

`app/javascript/controllers/drag_drop_controller.js:102`

```js
const placed = term.dataset.placedDef
```

Nothing in the file ever writes `placedDef`. `checkMatch()` sets inline styles and adds to
`this.matched`, but never records which drop zone the term landed on. So `_submitMatches()`
always builds `matches = {}`, and `BlockGrader#grade_drag_drop` has:

```ruby
return graded(false, 0) if matches.empty?
```

→ `correct: false` → the attempt is not satisfied → `interactive_lesson_controller.js:395`
keeps `_locked = true`. The gate is working exactly as designed; it is being fed an empty
submission.

**Checked against the other six controllers: only `drag_drop` has this defect.**
`fill_blank`, `scenario`, `lesson_check` and `flashcards` all build a real payload. Do not
"fix" them.

### A2 · The block marks wrong pairings as correct

`engines/learning_routes_engine/app/views/learning_routes_engine/steps/lesson_sections/_drag_drop.html.erb`

```erb
<% section[:pairs]&.shuffle&.each_with_index do |pair, i| %>     <%# terms: SHUFFLED %>
    data-term-index="<%= i %>"                                   <%# re-indexed by POSITION %>
    data-correct-def="<%= i %>"                                  <%# points at the same row %>
...
<% section[:pairs]&.each_with_index do |pair, i| %>              <%# definitions: NOT shuffled %>
    data-def-index="<%= i %>"
```

The terms column is shuffled and then **re-indexed by its new position**, while the
definitions column keeps the original order. The shuffle is therefore erased: the client
believes term at row *i* belongs to definition at row *i*, whatever term actually landed
there.

Two consequences, and the owner reported the first while not yet noticing the second:

1. **The answer is always "the one beside it."** No thought required.
2. **The pairing shown is wrong, and the block says it is right.** From the owner's
   screenshot: row 1 shows *Tipo de instancia* beside *Computadora virtual que ejecutas en
   AWS* — which is the definition of **Instancia**. The student matched them and got a green
   border and "¡Todo emparejado!". The block is teaching incorrect associations and
   confirming them.

Note that `grade_drag_drop` compares `matches[i] == i` — index identity. That is only
meaningful if the DOM indices are faithful to the stored `pairs` array. Today they are not,
so once A1 is fixed the server would also certify the wrong pairing. **A1 and A2 must be
fixed together; fixing A1 alone ships a grader that blesses wrong answers.**

### A3 · A wrong attempt must reach the server

Today `_submitMatches()` fires only when every term is placed, and a wrong drop bounces, so a
student can never submit a failing attempt. That means `BlockAttempt.attempts` never
increments for a match block, so **`RELEASE_AFTER = 3` can never fire and a student facing a
bad answer key is trapped forever.** Given that A2 proves the answer keys have been wrong,
this valve has to work.

Submit the attempt on a wrong placement too, so `attempts` increments and the release valve
is reachable. Keep the UI behaviour the owner already knows (the wrong drop bounces); this is
about the record, not the interaction.

---

## §B — Procedural variation (the owner's ask, and it has more than one customer)

The owner's words: *"tenemos que crear un sistema de generación procedural que a lo mejor
inclusive nos puede servir para otras varias cosas."* He is right that it generalises.

**Do not fix A2 with a bare `shuffle` in the partial.** A plain `shuffle` re-randomises on
every render, so a Turbo re-render or a reload halfway through a match scrambles the board and
destroys placements the student already made — and it makes the tests non-deterministic.

### What to build

`LearningRoutesEngine::BlockVariant` (or argue for a better home — `content_engine` is a
defensible alternative since the block vocabulary lives there).

A deterministic permutation from a seed:

```
seed = digest(user.id, route_step.id, section_index, attempt_number, salt)
order = (0...n).to_a.shuffle(random: Random.new(seed))
```

`attempt_number` comes from the existing `BlockAttempt#attempts` for that
`(user, route_step, section_index)` — the table already has a unique index on exactly that
triple (`idx_block_attempts_unique_per_section`), and `attempts` already increments on each
submission. Nothing new is needed to store this.

That gives the property that matters:

- **Stable within an attempt** — reloading mid-exercise shows the same board.
- **New after a failure** — retrying is not muscle memory.
- **Different per student** — two students do not share a board.
- **Reproducible in tests** — same inputs, same order, so you can assert on it.

The `salt` argument is what makes it reusable: `"terms"` and `"definitions"` from the same
section produce two independent permutations.

### Where to apply it in this package

1. **`drag_drop`** — permute terms and definitions **independently**, each element keeping its
   **original** index in `data-term-index` / `data-def-index` / `data-correct-def`. With
   original indices preserved, `grade_drag_drop` keeps working unchanged, and there is no
   positional shortcut left in either column.

2. **`check`** — `_check.html.erb:39` renders options in their stored order. If the generator
   tends to put the correct option first, position is a tell. Permute them, keeping the
   original index in `data-option-index`, so `grade_check` and
   `data-lesson-quiz-correct-value` (`:7`, the original index) keep working untouched.

**Explicitly out of scope, note it in `FINDINGS_WP15.md`, do not build:** `_check.html.erb:43`
renders `data-correct="<%= opt[:correct] %>"` on every option and the wrapper carries
`data-lesson-quiz-correct-value`. The answer key is in the DOM twice. Withholding it is a
separate package and `BlockGrader`'s own comment already acknowledges it.

Also note in findings, do not build: exam question order, flashcard order, and FSRS review
order are the next three callers of this service.

### Justify in the handoff

- Where the service lives and why.
- What the seed is composed of, and why `attempts` rather than a timestamp or a session value.
- What happens on the **first** render, before any `BlockAttempt` row exists.
- What happens for a section rendered outside a step context (preview, agent reply) where
  there is no `current_user` — it must not raise. `submitBlock` already fails quiet there;
  match that.

---

## §C — The dead vertical space

The owner: *"esos espacios tipo que no tienen ningún sentido... se ve como si la página no
fuera profesional."* He is describing the region between the lesson section and the likes bar.

Measured in the source. **One fixed footer, reserved for four times:**

| Where | Reserve |
|---|---|
| `application.css:1133` `.lesson-sections-container` | `min-height: 12rem` + `padding-bottom: 5rem` |
| `_lesson.html.erb` AI-tools wrapper | inline `padding: 0 1rem 6rem` |
| `_lesson.html.erb` divider above "HERRAMIENTAS IA" | `padding-top: 1.5rem` + `margin-top: 1rem` |
| `_lesson.html.erb` `#ai_supplementary_<id>` | `margin-top: 1rem` on a div that is empty |

`.lesson-nav-footer` is `position: fixed` and roughly 72px tall. It needs its clearance
**once**. The `min-height: 12rem` additionally floors every short section — a `tip` or a
`summary` occupies 192px whatever it contains.

**Before changing anything, measure the real DOM.** Reading templates produced three wrong
guesses in this project. Load a lesson page in a headless browser, walk from
`.lesson-sections-container` to the likes bar, and print per element: computed height,
`margin`, `padding`, and whether it has text content. Report the number of dead pixels you
found. Then fix, then measure again and print both numbers. The owner asked for these to be
*eliminated*, so the acceptance criterion is a number, not an opinion.

Direction, if the measurement agrees:

- Reserve the footer once, from a single `--lesson-footer-h` custom property, on the outermost
  wrapper. Remove the other three reserves.
- Drop `min-height: 12rem`, or scope it to the section transition only if you can show it
  exists to stop a jump mid-animation. Say which, with evidence.
- `#ai_supplementary_*:empty { margin: 0 }` — or render the div only when it has content.

Do not restyle by eye and do not tune numbers until the screenshot looks better.

---

## §D — The right-hand sidebar

The owner: *"se puede mejorar un poquito, a lo mejor hacerlo más a la derecha y así (indaga un
poco)."*

Measured in `steps/show.html.erb`:

```
outer            max-width: 82rem   (padding 1.25rem each side → ~79.5rem usable)
content column   flex: 1; max-width: 50rem
gap              2.5rem
aside            width: 19rem; flex-shrink: 0        (_sidebar.html.erb:1)
                 ─────────────────────────────────
                 71.5rem used, ~8rem left over
```

The row is `display:flex` with the default `justify-content: flex-start`, and the content
column is capped at 50rem, so the leftover ~8rem lands **to the right of the sidebar**. The
page is not centred: the left margin is ~1.25rem and the right is ~9rem. That asymmetry is
what he is seeing.

A second, smaller thing visible in the same screenshot: the lesson body is capped at `48rem`
(`_lesson.html.erb`) while the likes bar, `_navigation` and the comments section fill the full
`50rem` column. Three different measures on one page.

Direction:

- Replace the flex row with a grid — `grid-template-columns: minmax(0, 1fr) 19rem` — so the
  sidebar is flush to the right edge of the container and the leftover space goes to the
  reading column. Keep the `xl:` breakpoint behaviour: below it the sidebar is hidden and the
  content must still be centred.
- Unify the reading measure. One custom property used by the lesson body, the likes bar,
  `_navigation` and the comments block.
- Sidebar contents: `INFO DEL PASO` renders four visually identical rows (Tipo / Nivel /
  Duración / Bloom). Propose a tighter treatment and implement it if you can do so without
  inventing new colours — read the theme variables in `app/assets/tailwind/application.css`
  and use them. Seven partials shipped with hardcoded light-theme hex and were invisible on
  dark; that was fixed and must not come back.
- Note, do not build: the `PROGRESO` ring duplicates the HUD progress bar at the top of the
  same page.

This one is taste as much as measurement. Show the owner a before/after screenshot at
1440px and at 1920px rather than describing it.

---

## Hard constraints

1. **Do not deploy.** A human deploys.
2. Do not "fix" the red engine tests. Report the count before and after, measured as the
   intersection of 3 runs — a single run does not measure this suite reliably.
3. `env -u RAILS_MASTER_KEY` before every `bin/rails test`, or the production key in the
   shell poisons the test env with `MessageEncryptor::InvalidMessage`.
4. Every new query eager-loads its associations. `strict_loading_by_default` is on; in
   production it only logs, so it will not fail loudly.
5. Every new string goes through I18n in both locales. A recent sweep removed eighteen
   hardcoded strings; do not add any back.
6. **A Rails test does not load JavaScript.** Three Stimulus controllers were dead in
   production with 200+ green tests. §A is a JS fix: prove it in a browser, not only in a
   test.

## Tests

- `BlockVariant` returns the same permutation for the same seed and a different one when
  `attempts` increments.
- A `drag_drop` submission built from the rendered DOM indices grades correct, and a
  deliberately mismatched one grades incorrect. This is the test that A2 would have caught.
- A wrong placement increments `BlockAttempt#attempts`, and the third failure sets
  `released_at` and satisfies navigation without setting `correct`.
- A `check` renders its options permuted and still grades against the original index.

Both suites, before and after:

```bash
env -u RAILS_MASTER_KEY bin/rails db:test:prepare test
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test
```

## Reporting back

Print only: confirmation of A1 and A2 against the code, the `BlockVariant` seed composition in
one paragraph, the dead-pixel count before and after for §C, the before/after widths for §D,
and both test counts. Everything else goes to `WP15_HANDOFF.md`.

**Verify your report against the code before printing it.**
