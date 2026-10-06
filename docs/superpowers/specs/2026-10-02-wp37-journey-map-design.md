# WP-37 — The journey is a map, not a scroll: design

Source: `PROMPT_28_WP37_THE_JOURNEY_IS_A_MAP.md`. Branch `wp37-journey-map`, off `main` at
`5e07c80f`. Every section below was presented, amended by the owner, and accepted; the
rulings are recorded inline where they changed the design, and collected in §7.

**The goal, in the owner's words (12 September):** *"a node connects to a node, and so on for
every super-node — they spread sideways or downward depending on how many there are. More a map
than a scroll-down."* Acceptance is his, in production: *does it read as a map?*

**The shape it is judged on.** §0 of the prompt is done: `wp29:census` / `wp29:cleanup` ran in
production on 21 September (36 → 13 reinforcement steps; the route has 20 steps — 7 primary,
13 reinforcement). That is the target. 43 is a stress test, in two shapes (§2).

House rules, unchanged: every fix ships with the test that prevents its class, shown red first;
every claim in the handoff is something that was run; a node the student cannot read is a
defect — measure pixels, contrast and legible text, not the DOM.

---

## 1. Server and data

### 1.1 `triggering_step_id` — the ACTUAL trigger, stored

`AdaptiveDifficulty#insert_reinforcement!` adds one key to the metadata it writes:

```ruby
metadata: { reinforcement: true, trigger_score: @score, triggering_step_id: triggering_step_id }
```

`triggering_step_id` is the step that triggered the reinforcement, not a recomputation of
where it sits:

1. the assessment's `route_step_id` — the same lookup `assessment_step_module_id` already
   performs (`Assessments::Assessment.where(id: assessment_id).pick(:route_step_id)`, scoped to
   this route);
2. else the current step — the `RouteStep` at `position: @route.current_step`;
3. else `nil`.

The position rule (§1.3) is the legacy fallback only. In the normal case the two agree,
because insertion is at `current_step + 1`; when they disagree the stored id wins, which is
the reason to store it.

**Test (red first):** inserting a triplet from an assessment result writes the assessment
step's id on all three steps; with no assessment step, the current step's id.

### 1.2 Readability comes from the policy — preview, OR an entitled route

Today `routes_controller.rb:107` sets `readable = route_module.access_preview?`, and `:15`
(list view) and `:39` (journey) filter `@steps` the same way. A **purchased** module is
therefore drawn locked, titles hidden, for the student who paid — on both views
(`show.html.erb:64-67` draws the lock icon and the "locked" label for every non-preview
module).

`ModuleAccessPolicy` is the rule (`reachable?`: preview, or
`Commerce::RoutePurchase.entitled?(route_id:)`), and entitlement is **route-level**. The policy
gains one public method that asks `entitled?` **once per route** and answers per module:

```ruby
# ModuleAccessPolicy — one entitled? query per route, answered per module.
def self.module_reader(route)
  entitled = Commerce::RoutePurchase.entitled?(route_id: route.id)
  ->(route_module) { route_module.access_preview? || entitled }
end
```

It is the one source for:

- `build_journey_stages` — `readable` per stage;
- `:39`'s journey `@steps` — which feeds the header counts (`completed_count` / `total_count`
  in `journey.html.erb:5-6`), undercounted for a buyer today;
- the list view: `:15`'s `@steps` and `show.html.erb:65/67` (lock icon, "locked" label).
  **Owner's ruling:** in this package — the prompt excludes the list's *design*, not its
  *correctness*. One line each.

Ownership is unchanged: these controllers already scope the route to the signed-in user.

**Tests (red first):** journey — preview readable; purchased readable *with* titles and
`parent_id`; locked hidden (masked title, no path, no `parent_id`). List view — a purchased
module lists its steps without the lock; the list view's existing tests stay green.

### 1.3 `parent_id` per topic, in one pass

`journey_topic` grows `parent_id`:

- primary step → `nil`;
- reinforcement step → `metadata["triggering_step_id"]` when it names a **primary step in the
  same module**, else the **nearest preceding primary step in the same module** by
  `position`, else `nil` (an *orphan*: it hangs from the module node, §2.3).

  The guard does not weaken "stored wins". By construction the stored id is in the
  insertion module — `insert_reinforcement!` takes `module_id` from the assessment step's
  module, else the current step's, the same two sources §1.1 takes the id from. The guard
  only refuses ids that cannot be a parent in a depth-3 tree: a step that has since moved to
  another module, or a current step that was itself reinforcement. Those fall back to
  position rather than drawing an edge across modules or a reinforcement of a reinforcement.

Computed in one pass over the module's already-sorted, already-loaded steps — no new queries.

**Reinforcement is one rule:** `metadata["reinforcement"] == true`. The
`metadata["triggering_module_id"]` branch at `routes_controller.rb:156-157` is deleted — no
writer exists anywhere in the repo (verified).

**Locked modules:** `parent_id` is always `nil` and `reinforcement` always `false`, as today —
the paywall hides structure as well as titles.

**Tests (red first):** a fixture with one primary step followed by three reinforcement steps
renders three topics with `parent_id` = the primary; a legacy step without
`triggering_step_id` resolves by position; an orphan gets `nil`; a stored id that disagrees
with position wins.

### 1.4 One `current`, from the server

`@route.current_step` is a position the server owns (`AdaptiveDifficulty` reads it;
`LearningRoute#current_route_step`, `learning_route.rb:61`, resolves it from loaded steps).
The controller marks `current: true` on **exactly one** topic: the readable step at that
position. Only when that position is not a readable step does the fallback apply — first
`in_progress`, else first `available`, else the last readable step; a route with no readable
step marks none and the camera uses the root. **The client derives nothing.**

**Test:** the marked topic is the one at `current_step`; the fallback is exercised by a
`current_step` pointing into a locked module.

### 1.5 The root, and the level instead of the colour

- `@journey_root = { title: }` — handed to the view as its own Stimulus value. `stages` stays
  an array of the same stage hashes.
- `LEVEL_COLORS` (`routes_controller.rb:86`, fixed hex) is removed from the JSON: the stage
  emits its `level`; colours are theme tokens (§3.6).

### 1.6 `wp37:reinforcement_parents` — read-only census

`lib/tasks/wp37_reinforcement_parents.rake`, read-only like `wp38:ai_content_census`. Per
route: reinforcement steps resolved by stored `triggering_step_id`, by position, and hung from
the module (orphan). Plus one line: the count of `reinforcement` values that are present but
**not boolean `true`** (e.g. the string `"true"` from an old writer), so they are seen and not
silently dropped by the single rule.

It ships in this branch; production gets it on the automatic deploy after merge. Running it is
the owner's post-deploy step (§6).

---

## 2. Geometry: `app/javascript/lib/journey_map_layout.js`

Pure: no DOM, no Stimulus, no CSS. Next to it, replacing it, `journey_layout.js` is deleted.

### 2.1 Interface

- `buildTree(root, stages)` → the tree route → modules → steps → reinforcement, from the
  controller's JSON (`parent_id`, `reinforcement`, `current`).
- `layoutJourney(tree, options)` → `{ nodes, edges, bounds }` in world pixels:
  - `nodes`: `[{ id, kind, x, y, w, h }]` — `kind` ∈ `root | module | step | reinforcement`;
    `w`/`h` is the node's **whole box, label included**;
  - `edges`: `[{ from, to, kind, points: [[x, y], …] }]` — polylines, drawn as one `<path>`;
  - `bounds`: the world rect.
- Options include `labelWidth` (proposed **168 px**), label line height for **13 px** text,
  node diameters per kind, gaps, `rowSize` (4), `fanRowSize` (3). Node size is constant:
  count never shrinks anything — the camera is what changes.

### 2.2 The algorithm — tidy-tree rules at the tree's real depth (owner's choice: "A")

The tree is at most root → module → step → reinforcement, with fixed-size boxes. At that
depth Reingold–Tilford's contour threads reduce to subtree widths, so this implements **its
rules**, not Buchheim's general algorithm, and says so in the module header:

1. no two boxes overlap (by construction — tested exhaustively, not hoped for);
2. a parent is centred over its children;
3. children keep route order;
4. identical subtrees are drawn identically.

A step's subtree width is `max(step box, its fan's width)`; neighbours in a row are spaced by
subtree width.

### 2.3 Placement

- **Spine.** Root at the top; modules stack downward in `position` order. Module nodes own a
  **reserved spine column** that no step or reinforcement cell shares, so the spine edge
  (module → next module) never crosses a cell.
- **≤ 4 primary steps:** one row to the **side** of the module node, level with it.
- **> 4 primary steps:** rows of 4 **below** the module node, **boustrophedon** (row 1
  left → right, row 2 right → left, …), so route order reads as one continuous path.
- **Reserved row gutters.** Both ends of every row carry a gutter; the route-order hop from
  the end of row *k* to the start of row *k + 1* runs down the gutter, never through the fan
  hanging under the row-end step.
- **Reinforcement fan:** under its step, in rows of at most 3, centred on the parent. The real
  worst case — 36 behind one step — is a 12-row fan, not a 36-wide line.
- **Orphan reinforcement** (`parent_id` nil; it can only precede the module's first primary
  step): takes the first cells of the module's rows, drawn as reinforcement, edged from the
  module node.
- **Locked modules** carry no `parent_id`: they draw the plain shape of their step count.

**Vertical stacking, stated:** each step row starts below the **tallest subtree** of the row
before it; a module's block extends to its lowest row (fans included); the next module starts
below that. The same rule applies in the ≤ 4 case when a fan hangs under one of the four.

### 2.4 Edges — every one drawn

root → first module; module → next module (spine); module → its first step (or first orphan);
step → next step in route order within the module (across row wraps, via the gutter); step →
each of its reinforcement children. Within a row, step → step edges run at node-centre height
and fans hang below node boxes, so they do not meet.

### 2.5 Node tests (`bin/rails test`, node runs the module, Ruby asserts on its JSON — the
existing pattern)

- Counts 1 / 7 / 8 / 20 / 43 steps × 1 / 2 / 5 modules; plus both 43 shapes (43 peers; 7
  primary + 36 reinforcement behind one step) and production's 7 + 13.
- No two **node** boxes intersect; no **subtree** box intersects another.
- **No edge segment intersects any node box except at its own two endpoints** — at every count
  and shape, the 7 + 36 shape included (the node-overlap test cannot see this).
- ≤ 4 → a single row beside the module; 5 → wraps below; rows alternate direction; the spine
  column and gutters are empty of cells.
- Each row starts below the tallest subtree of the previous row; each module starts below the
  previous module's lowest box.
- Parent centred over its fan; identical subtrees have identical sizes; reading order is route
  order.
- **"A reinforcement drawn as a peer"** (the prompt's test 2, at the geometry layer): one
  primary step followed by three reinforcement steps produces **one** step node, three
  reinforcement nodes below it, and exactly three step → reinforcement edges from it.
- Edge count matches the formula; every edge's endpoints exist.
- `app/javascript/lib/journey_layout.js` does not exist.

---

## 3. The canvas, the camera, the page

### 3.1 The page does not scroll

`journey.html.erb` becomes a full-viewport canvas inside `layouts/journey.html.erb`, whose
`<body>` is `overflow:hidden` (`:36`) and whose `#journey-topbar` is **`position:fixed`**
(`:40`) and drawn *over* the canvas. (Corrected during review: the layout is `journey`, not
`learning`; there is no sticky nav and no 4 px bar on this page.) The failure that matters is
therefore not page scroll but **the overlay hiding what the camera centred** — handled by the
safe area (§3.3). `documentElement.scrollHeight == clientHeight` is still asserted (§4).

Inside the container:

- **A viewport**: `touch-action: none`, `tabindex="0"`, an `aria-label` naming the keys
  (arrows pan, + / − zoom, 0 fits) in both locales.
- **One world element**, moved by `transform: translate() scale()`, holding **one SVG** for all
  edges and **one HTML layer** for nodes. Readable steps and reinforcement are `<a>`; locked
  ones are non-focusable with an `aria-label`. **Module nodes are not interactive** (owner's
  ruling — the rail is the module index). DOM order is route order (each step, then its
  reinforcement), so Tab follows the route. Stimulus builds the nodes from the JSON, as today.
- **The root node's label is the page's `<h1>`** (the route title) — the 280 px header goes.
  The subtitle counts become a small fixed overlay; "Scroll to explore" becomes a drag hint
  (new key).
- **Overlays kept:** the rail (module index; click → camera fits that module), the list-view
  link, and **Fit / + / −** buttons bottom-right.

### 3.2 Camera math: `app/javascript/lib/journey_camera.js`, pure

Fit bounds, centre on a point, zoom about a point, clamp, the initial-camera rule (§3.4), and
**`safeRect(viewport, overlayRects)`** (§3.3). Tested under node like the layout. The controller
only wires events to it.

- **Pointer drag** pans (pointer capture); **pinch** (two active pointers) zooms about their
  midpoint.
- **Wheel:** a plain wheel **pans** (a mouse user is never trapped on a page that does not
  scroll); trackpad pinch / Ctrl+wheel zooms about the cursor.
- **Keyboard** on the focused viewport: arrows pan, `+` / `−` zoom, `0` fits.
- **Focus follows the camera:** when Tab lands on a node outside the safe area, the camera
  brings it in.
- **Zoom range:** fit-all (below 12 px allowed — the student chose to zoom out) up to 2×.

### 3.3 One safe area

(c), Fit, the rail click and focus-follows-camera all mean "the viewport minus the overlays".
`safeRect` takes the viewport rect and the overlay rects (topbar, Fit/zoom buttons, rail,
list-view link — measured with `getBoundingClientRect`) and returns the safe rect. The
controller calls it everywhere; a `ResizeObserver` re-measures and keeps the camera's centre
fixed on resize.

### 3.4 The initial camera

- Target: the topic marked `current: true` (§1.4); none → the root.
- Scale = fit the current module's block into the safe rect, clamped to
  `[12 / labelFontPx, 1]` — labels ≥ 12 px at first paint, never zoomed in past 1.
- If the module fits at that scale, centre the module; else centre the current node. Either way
  the current node is inside the safe rect.

  This reads the prompt's "fits the current module **and** centres the current step" as one
  rule. When the whole module fits, centring the step instead would push part of the module
  off-screen. When it doesn't fit, the step wins. Presented this way in review section 3 and
  accepted.

### 3.5 Motion

Camera moves ease ~250 ms via a CSS transition on the world transform, off during drag/pinch.
Under `prefers-reduced-motion: reduce`: no camera animation, no entrance animation, no pulse —
the first paint is the final picture. The rotating satellite rings and per-stage glows go with
the scroll layout.

### 3.6 Theme

Nodes and edges are styled with the app's CSS custom properties (`var(--color-…)`), so a theme
toggle repaints with no re-render. The mount-time `getComputedStyle` colour read
(`route_journey_controller.js:106`) — the WP-36 dark-theme class — goes; `getComputedStyle`
stays only where a number is needed. **Level colours become tokens** in
`app/assets/tailwind/application.css`, defined in both themes, followed by a Tailwind rebuild.
They **reuse the existing names `--color-node-nv1/2/3`** (`application.css:34-37`). Today those
are all `#B0A898`, light-only, and referenced nowhere in `app/` or `engines/`. They get the
level hues in `:root` and dark-theme values under `html[data-theme="dark"]`, with the exact
values set by the contrast test (b), not by eye.

**Reused, not redesigned:** the level tag, progress rings, the "done" check, the locked
masking.

---

## 4. Legibility, status, and the measured tests

### 4.1 Labels

Under each node; width = `labelWidth`; **13 px**; two lines via `line-clamp`, ellipsis after;
full title in `title` and `aria-label`. The label is inside the box the layout spaces by, and
no edge passes under a node box (§2.5), so a label's backing is the canvas background;
contrast is measured against the computed background of its first opaque ancestor.

### 4.2 Status — form and colour, never colour alone

| status | form |
|---|---|
| done | filled with the level token + the existing check |
| current | double ring (+ pulse, off under reduced motion) |
| available | outline ring |
| masked (paywall — a module the student cannot read) | dashed outline + lock glyph, no title, not focusable |
| locked (not yet reached, in a readable module) | dashed outline, **no** glyph; keeps its title and its link |
| reinforcement | smaller circle, **same** label size |

**Amendment (owner's ruling, after plan review).** "Locked" is two things, and they are drawn
differently. The **paywall mask** hides content: glyph, no title, no focus. A **not-yet-reached
step of a readable module** hides nothing: it keeps its title and link and is only outlined.
Without the split, a purchased module whose steps are not yet reached would carry lock glyphs —
the opposite of what the student bought. The system test's purchased run asserts no glyph.

Each node's `aria-label` is "title, status". **New locale keys** in `en` and `es` for
`current`, `available` and `reinforcement` status text, the drag hint, and the viewport's key
help; `locked_topic` and `completed` exist under `learning_engine.journey`.

### 4.3 System test: `test/system/journey_map_test.rb`

Replaces `journey_has_no_overlapping_satellites_test.rb` (its overlap check becomes (a)).
Fixtures use **real-length Spanish titles** (40–70 characters). Two routes: **7** (7 primary
steps in the preview module + a locked module) and **43** (7 primary + 36 reinforcement behind
one step). Each in `data-theme="light"` and `"dark"`, at 1440 × 1000:

- (a) no two label boxes intersect (`getBoundingClientRect`);
- (b) every label, and any level-coloured text, has computed `font-size` ≥ 12 px and contrast
  ≥ 4.5;
- (c) the current node is inside the **safe rect** — not intersecting any overlay;
- (d) Tab visits readable steps in route order, each step then its reinforcement;
- (e) the locked module leaks no titles (text, `title`, `aria-label`);
- (f) reduced motion, set **before `visit`** with
  `page.driver.browser.execute_cdp("Emulation.setEmulatedMedia", features: [{ name: "prefers-reduced-motion", value: "reduce" }])`
  (new in this suite): `document.getAnimations().length == 0`, and every node's box at load
  equals its box one second later;
- `document.documentElement.scrollHeight == clientHeight`.

**Mobile run** at 390 × 844 (`page.current_window.resize_to` before `visit`), at 7 and 43: (a),
(b), (c), the scroll assertion, and **no overlay (topbar, buttons, rail) intersects the current
node** at first paint.

**Purchased run:** with a `Commerce::RoutePurchase` fixture, the purchased module's titles are
in the DOM and no lock glyph is rendered for it (the fix lives in the view; the integration
test alone does not see it).

**Interactions:** Fit puts every node inside the safe rect; a rail click puts that module's
node inside it; a pointer drag moves the world by the dragged distance; a plain wheel pans and
does not change scale; Tab onto an off-screen node brings it into the safe rect.

**Reported, not asserted:** the ellipsis count (labels whose `scrollHeight > clientHeight`) at
7 and 43, printed for the handoff.

**Screenshots:** `SCREENSHOT=1` (the `video_lesson_test.rb:243` pattern) writes the five
handoff captures: 7 light, 7 dark, 43 light, 43 dark (reduced motion on for one pair, off for
the other), and the phone run.

### 4.4 Server tests

Integration/controller tests carry §1: `triggering_step_id`; `parent_id` (stored, position
fallback, orphan, stored-wins); the single `current`; readability preview / purchased / locked
on the journey and the list view. `journey_page_test.rb`,
`module_lock_authorization_test.rb` and
`test/integration/landing_redirects_signed_in_students_test.rb` stay green, updated only where
the JSON shape forces it.

---

## 5. Work order and checkpoints

Each step red first, committed separately; one suite at a time.

1. **Server** — §1 in full (1.1–1.6). → **CHECKPOINT 1: stop; the owner verifies.**
2. **Level tokens** — §3.6 in `application.css`, both themes; Tailwind rebuild.
3. **`journey_map_layout.js`** + node tests (§2).
4. **`journey_camera.js`** + node tests (§3.2–3.4, `safeRect` included).
   → **CHECKPOINT 2: stop; the owner runs both pure modules himself against the same shapes.**
5. **The canvas** — `journey.html.erb`, `route_journey_controller.js`, overlays, root `<h1>`,
   viewport `tabindex`/`aria-label`, locale keys (§3, §4.1–4.2).
6. **`journey_map_test.rb`** red → green (§4.3). → **CHECKPOINT 3: stop; the owner verifies,
   with the five `SCREENSHOT=1` captures.**
7. **Deletions** — `app/javascript/lib/journey_layout.js`, its pin in `config/importmap.rb`,
   `test/javascript/journey_layout_test.rb`, `test/system/journey_has_no_overlapping_satellites_test.rb`.
   The "does not exist" test (§2.5) guards the first.

**Not in this package:** the journey's data model (modules, steps, gates); Task 8; any change
to how reinforcement is generated beyond writing `triggering_step_id`; the list view's design;
the mascot.

---

## 6. Verification and handoff

**Verification:** `bin/rails test`, `bin/rails test engines/*/test`, `bin/rails test:system` —
**three runs each** from a clean base, one suite at a time; RuboCop clean. In a browser against
dev, after a **server restart** (engine views do not hot-reload): the seeded route and a 43
fixture, both themes, reduced motion on and off; pan, zoom, Fit, rail click; the phone size.

**`WP37_HANDOFF.md`:**

- **§0** — the owner's `wp29:census` and `wp29:cleanup` outputs from 21 September (36 → 13;
  20 steps). `wp37:reinforcement_parents` is listed as the **owner's post-deploy step**, not as
  a result: `bin/kamal app exec -r job 'bin/rails wp37:reinforcement_parents'`.
- **The legibility triple, together:** `labelWidth`, label font-size, and the measured ellipsis
  count at 7 and at 43 — so the next change to one of them sees the others.
- Suite numbers from all three runs; the five screenshots; everything not done, said plainly.
- **Merge context:** branched off `main` at `5e07c80f`; `ci-engine-tests` is still unmerged, so
  the engine suite shows the same four failures until it lands; `.github/workflows/deploy.yml`
  deploys on green CI on `main`; acceptance is the owner's, in production, with his own
  screenshot at 7 primary steps (the real route of 20) answering *does it read as a map?*

---

## 7. Rulings recorded in review

| # | ruling |
|---|---|
| 1 | Parent census via a read-only rake, `wp37:reinforcement_parents` (+ non-boolean `reinforcement` count). |
| 2 | Layout approach A: tidy-tree rules at fixed depth, not literal Buchheim; stated in the module. |
| 3 | `triggering_step_id` = the actual trigger (assessment step → current step → nil). The stored id wins only when it names a primary step in the same module; otherwise, and for legacy rows, the position rule (§1.3). |
| 4 | Readability from `ModuleAccessPolicy`, one `entitled?` per route; journey stages, journey `@steps`, list view `:15` and `show.html.erb:65/67`. |
| 5 | List-view readability is in this package (correctness, not design). |
| 6 | Reserved spine column; reserved row gutters; edges are polylines; edge-segment-vs-box test. |
| 7 | Vertical stacking below the tallest subtree; module block to its lowest row. |
| 8 | `labelWidth` is a layout option; ellipsis count measured and recorded with font-size. |
| 9 | Snake rows: yes. Tab order is DOM/route order. |
| 10 | Plain wheel pans; title is the root node / `<h1>`; colours from CSS custom properties. |
| 11 | Safe area, measured (layout is `journey`: fixed topbar over the canvas); scroll assertion kept. |
| 12 | One `current`, from `@route.current_step`; client derives nothing. |
| 13 | Level colours become theme tokens; controller emits the level. |
| 14 | Reduced motion via CDP `Emulation.setEmulatedMedia`, before `visit`. |
| 15 | Mobile run at 390 × 844; one `safeRect` in `journey_camera.js`; purchased-module system run. |
| 16 | Module nodes not interactive; new `en`/`es` status keys; legibility triple in the handoff. |
| 17 | Three checkpoints: after steps 1, 4, 6. |
| 18 | Production rake output is a post-deploy step, not a handoff result; merge context in the handoff. |
