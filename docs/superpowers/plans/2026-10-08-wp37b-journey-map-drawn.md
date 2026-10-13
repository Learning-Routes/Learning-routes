# WP-37b — The map, drawn at another level: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task (native execution, one reviewer over the whole branch at checkpoint 3). Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the journey map: curved continuous routes, module sectors, terrain, a Continue
card and a popover. The geometry module, the camera module and the data stay as they are, apart
from three small tested layout options.

**Architecture:** Three pure ES modules hold everything that is geometry:
- `journey_map_layout.js` (existing; gains `wave`, `moduleLabelWidth`, `rootX`);
- `journey_map_paths.js` (new: layout → SVG path strings, chevrons, panels);
- `journey_terrain.js` (new: seeded noise → contour paths).

Each is node-tested from `bin/rails test`, like WP-37's layout. The Stimulus controller only
draws their output and handles input. All colour comes through CSS custom properties.

**Tech Stack:** Rails 8.1 engines, Stimulus + importmap (no bundler), node 25 for pure-module
tests driven from Minitest, Selenium headless Chrome system tests (CDP reduced motion), Tailwind 4
source CSS at `app/assets/tailwind/application.css`.

**Spec:**
- The brief: `PROMPT_30_WP37B_THE_MAP_DRAWN_AT_ANOTHER_LEVEL.md` (main checkout, untracked; its
  §-numbers are "brief §n").
- The addendum: `docs/superpowers/specs/2026-10-08-wp37b-journey-map-drawn.md` ("addendum §X").
- The approved prototype: `tmp/wp37b/prototype.html` in the main checkout.

## Global Constraints

- Worktree `/Users/go/Documents/Learning-routes-wp37b`, branch `wp37b-journey-map-drawn`, from
  `7396de2f` (addendum §A). Nothing is pushed.
- `env -u RAILS_MASTER_KEY bin/rails test` for every run. Run one suite at a time.
- Never `git add -A`. Stage named paths only. Never commit `config/master.key`,
  `config/credentials/*.key`, `.claude/`, `node_modules`, `.env`.
- Every fix ships with the test that catches its class, seen red first. Paste the red output into
  the checkpoint report.
- Do not touch `app/motion/**`: it is hashed into `vendor/javascript/mc.js`.
- After any edit to `application.css`: `env -u RAILS_MASTER_KEY bin/rails tailwindcss:build`.
  After an engine view edit, restart the dev server before trusting the browser.
- Fonts on the journey: Instrument Serif, Manrope and JetBrains Mono only (brief §4.4).
- Product strings are i18n keys in both `en.yml` and `es.yml`. Code, comments and commits are in
  English.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Checkpoints (brief §9): after Task 4, after Task 13, and after Task 15. At each one, stop and
  hand off.

## Review Focus

1. **A step title of one 65-character word.** Under a halo label with no box, it must clip
   inside `labelWidth` and never overflow into a line. Pinned in Task 13: the existing fixture
   title plus the line-crossing check.
2. **A route whose current step is a reinforcement under an orphan anchor.** The travelled path
   ends at the anchor, and its branch is `on`. Pinned in Task 3.
3. **No current at all** (`current` null). No travelled path, chevrons everywhere readable, no
   Continue card, no crash. Pinned in Task 3 (paths) and Task 9 (card absent).
4. **Terrain over a fractional rectangle** (layout bounds are not integers). No point outside the
   rect. Pinned in Task 4.
5. **A popover near the top or left edge** at the phone width. It flips below and stays clamped
   inside the viewport. Pinned in Task 10.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `app/javascript/lib/journey_map_layout.js` | three new options | 1 |
| `test/javascript/journey_map_layout_test.rb` | digests, option sets, wave, widths, rootX | 1 |
| `app/javascript/lib/journey_camera.js` | `initialCamera` `alsoBox` | 2 |
| `test/javascript/journey_camera_test.rb` | union / fallback / null | 2 |
| `app/javascript/lib/journey_map_paths.js` | layout → drawn paths | 3 |
| `test/javascript/journey_map_paths_test.rb` | its node tests | 3 |
| `app/javascript/lib/journey_terrain.js` | contours | 4 |
| `test/javascript/journey_terrain_test.rb` | its node tests | 4 |
| `config/importmap.rb` | two new pins | 3, 4 |
| `engines/.../routes_controller.rb` | `short_name`, `minutes` | 5 |
| `config/locales/{en,es}.yml` | short names, card, popover, legend, chip strings | 5, 7–10 |
| `app/assets/tailwind/application.css` | `.jm-*` block rewritten | 6–12 |
| `test/assets/journey_fonts_test.rb`, `journey_level_tokens_test.rb` | fonts, contour alpha | 6 |
| `app/views/layouts/journey.html.erb` | fonts link, top bar | 7 |
| `engines/.../routes/journey.html.erb` | overlays, card, popover, legend | 7, 9, 10 |
| `app/javascript/controllers/route_journey_controller.js` | drawing and interaction | 8–12 |
| `test/system/journey_map_test.rb` | brief §6 | 8–13 |

---

## CHECKPOINT 1 — pure modules

### Task 1: Layout — `wave`, `moduleLabelWidth`, `rootX`

**Files:** Modify `app/javascript/lib/journey_map_layout.js`, `test/javascript/journey_map_layout_test.rb`.

**Interfaces:**
- **Produces:** `DEFAULTS.wave = 0`, `DEFAULTS.moduleLabelWidth = 168`, `DEFAULTS.rootX = -180`.
- **Produces:** the module node's `w = max(moduleLabelWidth, moduleDiameter)`, and `spineHalf`
  likewise.
- **Produces:** the root's `x = rootX` and `cx = rootX + rootWidth / 2`.

- [ ] **Step 1 — red.**
  - Generate the digests from `b907fea9`'s file. Run the generation script (in the scratchpad)
    over the test's own `SHAPES`, importing `git show b907fea9:app/javascript/lib/journey_map_layout.js`.
  - Add `WP37_DIGESTS` and the test "#{name}: with every default the output is WP-37's, byte for
    byte". It passes today, and must still pass after the change.
  - Parameterise the per-shape invariant block over `OPTION_SETS = { "defaults" => {}, "wave 16"
    => { wave: 16 }, "view" => VIEW }`.
  - Add these tests:
    - "wave: consecutive heads in a row differ in cy by exactly 2·wave, and each row grew by
      2·wave" (wave 16 against wave 0, all shapes);
    - "a module label width is reserved in the spine column" (`moduleLabelWidth: 160,
      labelWidth: 124` → `spineHalf == 80`, every step `x >= 80`, module node `w == 160`);
    - the module case added to "a label width is an option";
    - "rootX places the root's left edge" (`rootX: 18` → root `x == 18`, `cx == 18 + rootWidth/2`,
      the spine edge still at x 0).
  - **Cache** each layout per `(stages, overrides)` in a class-level hash, so tripling the
    invariant sets does not triple the node spawns.
- [ ] **Step 2.** Run `env -u RAILS_MASTER_KEY bin/rails test test/javascript/journey_map_layout_test.rb`.
  - **Expected:** the wave, `moduleLabelWidth` and `rootX` tests fail.
  - **Expected:** under `VIEW`, the invariants may fail where `wave`/`moduleLabelWidth` are
    ignored. Paste the output.
- [ ] **Step 3 — green.** Apply `tmp/wp37b/wave.patch`, and add `moduleLabelWidth` and `rootX`
  as above.
- [ ] **Step 4.** Run the same file. Expected: all pass. Commit `feat(journey-layout): wave,
  module label width and root x — defaults byte-identical to WP-37`.

### Task 2: Camera — `initialCamera` takes `alsoBox`

**Files:** Modify `app/javascript/lib/journey_camera.js`, `test/javascript/journey_camera_test.rb`.

- [ ] **Step 1 — red.** Add three tests:
  - **Union.** The union of module and root fits at `k ≥ 12/13`: centred on the union, and both
    are inside the safe rect.
  - **Fallback.** The union is too tall at the floor: the result equals the call without
    `alsoBox`.
  - **`alsoBox: nil`.** Each existing initial-camera case returns exactly the same as without the
    key.
- [ ] **Step 2.** Run it; the union test fails.
- [ ] **Step 3 — green.**
  ```js
  export function initialCamera({ moduleBox, alsoBox = null, node, safe, minScale, padding = 24 }) {
    if (moduleBox && alsoBox) {
      const u = unionBox(moduleBox, alsoBox);
      const fit = Math.min((safe.width - 2 * padding) / u.w, (safe.height - 2 * padding) / u.h);
      if (fit >= minScale) return centerOn(centerOf(u), safe, Math.min(1, fit));
    }
    // … today's body unchanged
  }
  ```
- [ ] **Step 4.** Green. Commit `feat(journey-camera): the initial camera can also keep the title in view`.

### Task 3: `journey_map_paths.js`

**Files:**
- Create `app/javascript/lib/journey_map_paths.js` and `test/javascript/journey_map_paths_test.rb`.
- Modify `config/importmap.rb` (pin `journey_map_paths`).

**Interfaces:** addendum §C exactly.

- [ ] **Step 1 — red.** In the new test, the same `SHAPES` as the layout test, × `[wave 0, wave
  16]` with the brief §2.4 `VIEW` options. For each shape, several currents: the 3rd primary,
  the first primary, the last primary of the first readable module, a reinforcement if the shape
  has one, and none.
  1. **No sample of `route`, `travelled`, `trunk` or `branch` lies inside a label box** (box per
     brief §3, with module `lw = moduleLabelWidth`). Ruby computes the boxes; the points come
     from `samplePath`.
  2. **Each route is one `M`, continuous, tangent-continuous at every joint, quarter-circle arcs,
     and ends at the last head's centre** (addendum §D, parsed in Ruby).
  3. **U-turn arcs** in a path share one radius, and each clears the row end: for a right gutter
     `gx − r ≥` the row-end label's right edge; for a left gutter `gx + r ≤` its left edge.
  4. **`travelled[i].d` is a string prefix** of the same module's route `d`, and its last point
     is the current head's centre (the parent head for a reinforcement; the anchor for an
     orphan).
  5. **Chevrons.** The count equals the curved segments ahead (Ruby counts `C` commands after the
     current head, excluding the module swoop). No chevron lies in a label box.
  6. **A locked module** gives `routeLocked` only: no travelled path, no chevrons, no branches.
  7. **`samplePath` itself.** A line, a quarter arc (every sample at distance r from its centre)
     and a cubic (its ends exact). A command outside `M L C Q A` throws.
  8. **Brief §3's `branchOn` rule.** A child is on when it is completed or current; otherwise it
     is in `branch`.
- [ ] **Step 2.** Run it. Expected: fails to import (no module).
- [ ] **Step 3 — green.** Implement it from the prototype's `buildPaths`, `cubicH`, `uTurn` and
  `roundedPath`, with these changes:
  - the addendum §C return shape;
  - `bendRadius` from the options;
  - `samplePath`.
- [ ] **Step 4.** Run the paths, layout and camera tests. Run the seeded fuzz (scratchpad: 23
  shapes + 2,500 random routes × 3 option sets) and record its numbers. Commit.

### Task 4: `journey_terrain.js`

**Files:**
- Create `app/javascript/lib/journey_terrain.js` and `test/javascript/journey_terrain_test.rb`.
- Modify `config/importmap.rb`.

- [ ] **Step 1 — red.** Four tests:
  - **Deterministic for a seed.** A different seed gives a different output.
  - **Every point is inside the rectangle,** for an integer rect and for a fractional one
    (`x: -97.3, y: 12.6, w: 1234.5, h: 777.7`).
  - **The segment count is bounded:** under 40,000 for a 3000 × 3000 field.
  - **Five levels give five strings.**
- [ ] **Step 2.** Red: no module.
- [ ] **Step 3 — green.** Implement addendum §E: an exact-fit grid, clamping, and the
  prototype's noise.
- [ ] **Step 4.** Green, then commit.

**CHECKPOINT 1.** Run all three suites. Report to the owner: red-first evidence per task, fuzz
numbers, segment counts, and how to run the node tests. Stop.

---

## CHECKPOINT 2 — the page (Tasks 5–13)

These tasks are listed with their tests. The code for each step is written into this plan at
the start of checkpoint 2, after the owner has run checkpoint 1's modules: their interfaces may
still move at that check.

- **Task 5 — server.**
  - `journey_topic` adds `short_name` for reinforcement (brief §4.4 rule) and `minutes`
    (`estimated_minutes`, omitted when nil).
  - Locale keys `learning_engine.reinforcement.<kind>.short` in both locales.
  - Integration test: 3 kinds × 2 locales, no prefix; `name` unchanged; `minutes` present/absent.
- **Task 6 — tokens and fonts.**
  - Tokens: `--jm-panel`, `--jm-contour`, `--jm-halo`, `--jm-halo-c`, `--jm-glow-a`,
    `--jm-reinf`, `--jm-track`, `--jm-locked`, `--jm-glass`, in both themes.
  - `journey_fonts_test.rb`: every `font-family` in the `.jm-*` block is in the layout's fonts
    link.
  - Token test: the alpha of `--jm-contour` is ≤ 0.1 in both themes.
- **Task 7 — page chrome.**
  - Root `h1` (eyebrow, serif title, meta); top bar without a title; a counter with a percentage
    and a progress line.
  - Remove the rail and `.jm-subtitle`. Add the legend, the bottom-right glass bar, and
    `data-journey-overlay` on every overlay.
  - System: one title on the page; no rail; the legend is hidden under 700 px.
- **Task 8 — drawing.**
  - Terrain svg, panels with ticks, chips, unlock pill, tracks, travelled + glow, chevrons, fan
    trunk/branches, origin, current glow. Nodes per brief §4.4. Labels with a halo and
    `-webkit-line-clamp: labelLines`.
  - System §6.1: no drawn line crosses a label. §6.2: one `M` per route path. §6.3: contrast.
    §6.4: the ellipsis census.
  - The locked module leaks no titles: chip and popover included.
- **Task 9 — Continue card.**
  - Brief §5.1 markup and logic, and the `I` key.
  - System: the CTA `href` at 7 and 43; the completed route; no card without a current; the card
    never over the current node at 1440 and 390.
- **Task 10 — popover.**
  - Brief §5.2.
  - System: focus on step 4 opens the popover with the full title and the action; Escape and a
    drag close it; the module node has no popover; a masked node's popover is generic; the
    popover flips and is clamped at 390.
- **Task 11 — zoom, keys, LOD, initial camera.**
  - Brief §5.3, §5.4.
  - System: at `k = 0.4` the labels are at opacity 0 and the discs visible; double-click; the two
    camera openings pinned.
- **Task 12 — entrance and motion.**
  - Brief §4.5.
  - System under reduced motion: the first paint is final, the orbit's `animation-name` is none,
    and a Turbo restore does not replay.
- **Task 13 — renders and suites.**
  - `SCREENSHOT=1` at 7, 7+13, 43 × light/dark × 1440/390 → `tmp/wp37b/renders/`.
  - Three suites green. **CHECKPOINT 2.**

## CHECKPOINT 3 — review (Tasks 14–15)

- **Task 14.** A fresh reviewer over `b907fea9..HEAD`. Fix Critical and Important findings red
  first.
- **Task 15.** `WP37B_HANDOFF.md`, the census numbers, what the tests do not catch, and WP-37's
  §0 status. Three runs per suite and RuboCop. **CHECKPOINT 3.**
