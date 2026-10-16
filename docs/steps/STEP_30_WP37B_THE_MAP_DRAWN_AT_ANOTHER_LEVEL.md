# STEP 30 — WP-37b: the map, drawn at another level

**Package:** WP-37b (visual layer of the journey map). **Base:** `main` at `b907fea9` (WP-37 merged
and deployed on 8 October). **Branch:** `wp37b-journey-map-drawn`. **Method:** superpowers —
brainstorm is already done (this prompt and the approved prototype are its output), so start at
the **spec addendum**, then plan → TDD → verification → review, with the owner's checkpoints listed
in §9. Work in English in code and commits; the product strings stay in both locales.

Before anything, read in this order: `WP37_HANDOFF.md`, `docs/superpowers/specs/2026-10-02-wp37-journey-map-design.md`,
`app/javascript/lib/journey_map_layout.js`, `app/javascript/lib/journey_camera.js`,
`app/javascript/controllers/route_journey_controller.js`, the `.jm-*` block of
`app/assets/tailwind/application.css` (lines ~3326–3386), `app/views/layouts/journey.html.erb`,
`engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb`, and the
four journey tests (`test/javascript/journey_map_layout_test.rb`, `test/javascript/journey_camera_test.rb`,
`test/system/journey_map_test.rb`, `test/assets/journey_level_tokens_test.rb`).

Then open the **approved prototype**: `tmp/wp37b/prototype.html` (a single file; open it in a
browser), with its renders `tmp/wp37b/mapa-light.png`, `mapa-dark.png`, `mapa-phone.png`,
`mapa-popover.png`, and the reference diff `tmp/wp37b/wave.patch` (applied: `tmp/wp37b/journey_map_layout_wave.js`).
The prototype runs on a verbatim copy of `journey_map_layout.js` plus **one** new option (`wave`). Everything
you see in it is the owner's accepted visual language. It is a reference, not code to paste:
it has no Stimulus, no i18n, no pinch, no Turbo cache handling, and its fixtures are fake.

---

## 0. Why this package exists

WP-37 made the journey a map in the geometric sense — a tidy tree with a spine, snake rows,
fans, a camera — and the owner saw it in production and rejected the **drawing**, not the
geometry: *"the map is right but it is just a map; it has to be beautiful, with curved lines, a
design at another level, less loose, more in keeping with the app, futuristic"*, and after the
first prototype round: *"above all beautiful, comfortable and innovative for the learner"*.

So WP-37b changes **how the map is drawn and how the learner acts on it**, and leaves the
geometry module, the camera module and their node tests as they are — except for three small,
tested additions to the layout (§2). Nothing in the data model moves. The acceptance is the
owner's, in production, against the prototype: *does the real page look and feel like this?*

---

## 1. What stays exactly as it is

- `journey_map_layout.js`'s rules and tests: no two boxes overlap, parent centred over its fan,
  route order, snake rows, reserved spine column and gutters, hop in a gutter, `ordinal`.
- `journey_camera.js` and its test, except the one addition in §2.3.
- The controller JSON (`build_journey_stages`, `journey_topic`), `ReinforcementParents`,
  `ModuleAccessPolicy.module_reader`, one `current` from the server, the paywall mask (a locked
  module leaks no titles — the system test for this must stay green unchanged).
- Pan by drag and wheel, pinch, ctrl+wheel zoom, + / − / Fit, keyboard pan, modifiers left to the
  browser, Turbo-cache redraw guard, focus-follows-camera, `prefers-reduced-motion` honoured.
- Colours only through CSS custom properties, never values read at mount.

---

## 2. Geometry: three additions to `journey_map_layout.js`, each with its red test first

`validated()` keeps its rule — every option is a finite number — so each new option gets a
numeric default in `DEFAULTS`: `wave: 0`, `moduleLabelWidth: 168` (today's `labelWidth`),
`rootX: -180` (today's `−rootWidth/2`). With the defaults, the output is byte-identical to today's.

### 2.1 `wave` (default `0`)
Consecutive cells in a row alternate between the row's top and `2·wave` below it (`placeCell(c,
left, rowTop + (i % 2 ? 2 * wave : 0), …)`), and the row reserves `2·wave` more height. The
reference diff is `tmp/wp37b/wave.patch` (eight lines against `main`'s file). Tests:
- With `wave: 0` the output is **byte-identical** to today's for all 23 named shapes (JSON
  equality of `nodes`, `edges`, `cells`, `modules`, `bounds`).
- With `wave: 16` every invariant test already in the file passes (parameterise the invariant
  block to run over `[DEFAULTS, { ...DEFAULTS, wave: 16 }]`), plus: within a row, consecutive
  heads differ in `cy` by exactly `2·wave`, and each row's `bottom − top` grew by `2·wave`.
  I ran my own fuzz over `main`'s file with this patch and the §2.4 options (23 named shapes +
  2,537 random routes): 0 overlaps, 0 edges through a box, route order and snake direction
  intact. Yours should agree.

### 2.2 `moduleLabelWidth` (default `168`, i.e. today's `labelWidth`)
The module node's width and `spineHalf` use it, so a wider module label is *reserved* in the
spine column instead of painted over the gutter. Test: with `moduleLabelWidth: 160` and
`labelWidth: 124`, `spineHalf === 80`, no step box's `x` is below `spineHalf`, and the existing
"a label width is an option" test gains the module case.

### 2.3 `rootX` (default `-180`, i.e. today's `−rootWidth / 2`)
The root box's left edge. The view will pass `rootX: 18` so the title sits beside the spine's
origin instead of centred on it (handoff minor 2: the title no longer appears twice — §4.1).
`initialCamera` gains an optional `alsoBox`: when `moduleBox ∪ alsoBox` fits at `≥ minScale`, fit
and centre the union; otherwise fall back to today's rule unchanged. Test in
`journey_camera_test.rb`: the union case, the fallback case, and `alsoBox: null` ≡ today.

### 2.4 Options the view passes (from the prototype; the plan may tune, the tests must still pass)
`labelWidth: 124, labelLineHeight: 16, labelLines: 3, labelGap: 8, moduleLabelWidth: 160,
rootWidth: 420, rootHeight: 64, rootGap: 52, rootX: 18, moduleDiameter: 52, stepDiameter: 44,
reinforcementDiameter: 28, cellGap: 16, rowGap: 36, gutter: 84, moduleGap: 76, fanGutter: 20,
fanGap: 8, fanRowGap: 20, rowSize: 4, fanRowSize: 3, wave: 16`.

`labelLines: 3` is the owner's "comfortable": the full title legible is the spec's criterion
(§3.5). Measure with the existing ellipsis census (`report_ellipsis` in the system test) against
the **real** reinforcement and step titles; if at 2 lines ≤ 5 % of real step titles clip, 2 is
acceptable — report the numbers in the handoff either way. The popover (§5.2) shows the full
title in every case.

---

## 3. A new pure module: `app/javascript/lib/journey_map_paths.js`

Everything that turns layout output into **what is drawn** is pure and node-tested, like the
layout: no DOM, no Stimulus. Pin it in `config/importmap.rb` next to the other two.

`buildPaths(layout, tree, currentId, opts)` returns:

- `panels[]` — one per module: `{ box (module box inflated by opts.panelPad = 18), level, locked }`.
- `spine[]` and `spineTravelled[]` — the vertical track between the root's origin and each
  module disc (`M 0 y₀ L 0 y₁`); travelled up to and including the current module.
- `route[]` / `routeLocked[]` — **one continuous path string per module**: `M` at the module
  centre, then the module→first-step segment (`L` when they share a row, otherwise one cubic
  with horizontal tangents at both ends, tension `K = 0.55`: `C ax+K·dx, ay  bx−K·dx, by  bx, by`),
  then for each consecutive pair of heads either the same cubic (same row) or a **U-turn**
  down the geometry's gutter: `L (gx − dir·r) ay  A r r 0 0 sweep gx ay+r  L gx by−r  A r r 0 0
  sweep (gx − dir·r) by  L bx by`, with `gx` the gutter's midpoint from `modules[i].gutters`,
  `r = min(opts.bendRadius = gutter/2 − 4, (by − ay)/2)`, `sweep = 1` on the right gutter and `0`
  on the left. Constant radius; never a corner.
- `travelled[]` — the prefix of the current module's route path up to the current primary step
  (if the current step is reinforcement, up to its parent head, and that one branch is marked
  `on`); all earlier modules' routes whole.
- `chevrons[]` — `{ x, y, angle }` at the midpoint of every curved segment still ahead of the
  current step (never on the swoop out of the module): the tangent at `t = 0.5` of the cubic
  is `atan2(dy, (1 − K)·dx)`.
- `trunk[]` / `branch[]` / `branchOn[]` — fans: a solid stub from the head's **label bottom**
  (`head.y + head.h`) down to `street0 − traceRadius`, then one dotted trace per child along the
  geometry's own `fan` edge points, with the first point replaced by the label bottom and the
  last by the child's disc top, corners rounded with quadratic curves of radius
  `opts.traceRadius = 9` (≤ `fanRowGap/2 − 1`). A completed child or the current child gets
  `branchOn` (solid).
- `origin` — the diamond at the top of the spine (`rootN.y + 10`).

`samplePath(d, step = 3)` evaluates the `M L C Q A` commands this module emits (arcs are
quarter circles) and returns points — the test uses it; the browser uses `getPointAtLength`.

Tests, red first (`test/javascript/journey_map_paths_test.rb`, same runner as the layout test):
- For all 23 shapes × `[wave 0, wave 16]`: **no sampled point of any `route`, `travelled`,
  `trunk` or `branch` path falls inside any label box** (`x ∈ [cx − lw/2, cx + lw/2]`,
  `y ∈ [cy + d/2 + labelGap − 1, … + labelLines·lineHeight + 1]`, with the module's `lw =
  moduleLabelWidth`). This is the curved successor of "no edge crosses a node box".
- Every route path is continuous: each command starts where the previous ended (parse and
  check), and its last point is the last head's centre.
- The U-turn's arcs have the same radius, and `gx − dir·r ≥` the row-end label's outer edge.
- `travelled` is a prefix of `route` (string prefix) and ends at the current head's centre.
- Chevron count = curved segments ahead; none lies inside a label box.
- A locked module produces `routeLocked` and no `travelled`, no chevrons.

---

## 4. The page

### 4.1 Root, top bar, overlays (handoff minors 1, 2, 4, 5 closed here)
- The **root** (`<h1 class="jm-root">`) is left-aligned at `rootX`, beside the origin diamond:
  a mono eyebrow (`learning_engine.journey.your_route` — "Tu ruta" / "Your route"), the title in
  **Instrument Serif** 30 px, and a mono meta line with the subtitle's content (`N módulos ·
  M temas`). `.jm-subtitle` is removed (minor 4).
- The **top bar** keeps the back link, the due-reviews chip and the counter; the italic title in
  its middle goes (minor 2: one title, the h1 on the map). The counter becomes `3 de 26 · 12 %`
  with a 3 px progress line under it in the current module's level colour.
- The **rail** is removed (minors 1 and 5). Its job — jump to a module — moves to the module
  chip and disc (§4.2), both clickable → `fitCamera(module.box)`.
- Bottom-left: the **legend** (hecho · estás aquí · por llegar · refuerzo · bloqueado) in a
  glass card, hidden under 700 px. Bottom-centre: the **Continue card** (§5.1). Bottom-right:
  the controls (− + Encajar) and the list link, in one glass bar. All overlays carry
  `data-journey-overlay` so `safeRect` keeps the current node clear of them — add a system
  assertion that the Continue card never covers the current node at 1440 and 390.

### 4.2 Module sectors
A `<rect>` per module behind everything (`class="jm-panel"`, `rx 22`): fill `--jm-panel`
(`--color-card` at ≈ 0.62 alpha, both themes), 1 px stroke `--color-border-subtle`, four
12 px corner ticks in the level colour for readable modules. On the top edge, centred on the
spine, a **chip** in JetBrains Mono: `01 · NV1 · 2 de 7` for a readable module; `02 · NV2 · 🔒
6 temas` (lock as an inline SVG, dashed border) for a locked one, plus a pill at the panel's
top-right **"Desbloquear módulo"** linking to the same target the list view uses for a locked
module. The module node keeps disc + label (Manrope 700, 14 px, `moduleLabelWidth`), the `tag`
leaves the label (it is in the chip now).

### 4.3 Terrain
`app/javascript/lib/journey_terrain.js`, pure: 2-D Perlin noise (seeded, deterministic) →
marching squares at five levels → one path string per level. Rendered in an `<svg
class="jm-terrain">` behind the panels over `bounds` inflated by 700 px, stroke `--jm-contour`
(≈ 7 % of the text colour, both themes; a token test like `journey_level_tokens_test.rb` pins
the alpha ≤ 0.1). Cell 18 px. Tests under node: deterministic for a seed; every point inside
the requested rectangle; segment count bounded (< 40 k for a 3000 × 3000 field). No dot grid.

### 4.4 Lines and nodes (CSS, all through tokens; replace the `.jm-edge*` rules)
- `.jm-track` 2 px `--color-faint`-like track; `.jm-track--locked` dashed `3 7`; `.jm-travelled`
  3.5 px in the level colour with `.jm-glow` beneath it (14 px, blur 2 px, opacity 0.09 light /
  0.18 dark via `--jm-halo`); `.jm-branch` dotted (`stroke-dasharray: 0 6`, round caps) in
  `--jm-reinf`; `.jm-trunk` solid 1.5 px; `.jm-chevron` in the track colour; a single radial
  glow (`r 150`) behind the current node, opacity `--jm-glow-a` (0.07 light / 0.16 dark).
- Nodes: done = filled disc in the level colour with a check; current = level-coloured ring
  with a 5 px bg gap and a slow conic **orbit** ring (`animation: 6 s linear infinite`, off under
  reduced motion) plus, on first paint only, two "ping" rings; not reached = hollow ring with
  the `ordinal` in JetBrains Mono; masked = dashed ring + lock; reinforcement = dotted ring with
  an inner dot, filled when done; module = double ring. Labels in **Manrope** 500 13 px / 16 px
  (reinforcement 12 px / 15 px, muted), `-webkit-line-clamp: labelLines`, **no background box**:
  a cartographic halo instead (`text-shadow` ×5 in `--jm-halo-c`, the panel's opaque
  equivalent per theme).
- **Fonts: only the three the journey layout loads** — Instrument Serif, Manrope, JetBrains
  Mono. Today `.jm-node__label` and `.jm-root` ask for *DM Sans* and `.jm-node__tag` for *DM
  Mono*, which `journey.html.erb` never loads, so production falls back silently. Add
  `test/assets/journey_fonts_test.rb`: every `font-family` named in the `.jm-*` block appears in
  the layout's Google Fonts link.
- Reinforcement labels drop the locale prefix: the controller sends `short_name` for a
  reinforcement step — the matching `learning_engine.reinforcement.<kind>.short` key
  ("Repasa los conceptos clave" / "Práctica guiada" / "Nueva evaluación" and the English three)
  when `localized_title` equals that kind's `title`, else the title with a leading
  `"#{status_reinforcement}:"` stripped, else the title. `name` stays the full title (aria,
  popover). Test: all three kinds × both locales produce a `short_name` without the prefix.

### 4.5 Entrance and motion
First paint of a visit only (not on Turbo cache restore): the travelled path and its glow draw
in over 900 ms (`pathLength="1"`, `stroke-dasharray/offset` 1 → 0, `cubic-bezier(.23,1,.32,1)`),
nodes and chips fade in with a 40 ms stagger, the current node pings twice after 900 ms. Under
`prefers-reduced-motion`, the first paint is the final picture (the existing system test must
still pass) and the orbit does not turn. Camera moves animate 450 ms with the same easing.

---

## 5. Acting on the map (the owner's "comfortable and innovative")

### 5.1 The Continue card
Fixed bottom-centre, glass: eyebrow `Sigues en · <module> · paso n de N` (mono), the current
step's full title (one line, ellipsis), a **locate** icon button ("Ir a donde estoy", key `I`)
that centres the current node at `k = max(k, 1)`, and the primary CTA **Continuar →** linking to
`current.path`. When every readable step is completed the card says `Ruta completada` and the
CTA goes to the list view; with no readable current step the card is not rendered. Phone: full
width above the controls. Tests: the CTA's `href` is the current step's path at 7 and 43; the
completed-route case; the card is listed in the overlays the camera avoids.

### 5.2 The popover
One `.jm-pop` element (`role="tooltip"`, `aria-hidden` when closed), positioned in **screen
space** above the node (flipped below when there is no room above, clamped horizontally): mono
eyebrow `<module> · paso n de N` or `Refuerzo de · <parent title>`; the **full title** in Manrope
700; a meta line `estado · 11 min` (`estimated_minutes` joins the JSON as `minutes`, omitted
when nil); and the action line from locale keys: *Continuar →*, *Volver a verlo →*, *Empezar el
refuerzo →*, *Se abre al terminar el paso anterior*, *Desbloquea el módulo para abrirlo*. Opens
on pointer hover (90 ms, not for touch), on focus, and on tap (a second tap closes it); closes
on pointer leave (120 ms), blur, Escape, and the start of a drag. Tests: focus on step 4 opens
the popover with the full title and the right action; Escape closes it; a drag closes it; the
module's own node has no popover.

### 5.3 Zoom, keys, LOD
Double-click a node → centre it at `max(k, 1.2)`; double-click empty canvas → zoom ×1.6 about
the point. Key `I` = locate, `Escape` = close popover. `data-lod` on the world from `k`: `far`
(< 0.5) hides step and reinforcement labels and chevrons, `mid` (< 0.75) hides reinforcement
labels — opacity 0 via CSS, the DOM unchanged. Test: at `k = 0.4` the labels have
`opacity: 0` and the discs are visible.

### 5.4 Initial camera
`initialCamera({ moduleBox, alsoBox: rootBox, node: current, safe, minScale })` (§2.3): at
1440 × 1000 the 7-step and the production 7+13 routes open with the title, the chip and the whole
first module visible at `k ≈ 0.97`; at 390 × 844 the current node is centred at `k = 12/13`.
Pin both in the system test.

---

## 6. System test additions (`test/system/journey_map_test.rb`, same harness: CDP reduced
motion, 1440 × 1000 and 390 × 844, light and dark, 7 and 43, a purchased module)
1. **No drawn line crosses a label** on the real page: sample every `path.jm-track,
   .jm-travelled, .jm-branch, .jm-trunk` with `getPointAtLength` every 3 px and assert no point
   lies inside any `.jm-node__label`'s box (the DOM twin of §3's node test). The prototype's
   version of this check is `window.__wp37bCheck` in `tmp/wp37b/prototype.html`.
2. The route path per module is a single `<path>` whose `d` starts with `M` once.
3. Contrast ≥ 4.5 of labels, chips, the Continue card and the popover text over what is behind
   them, both themes (extend the existing measurement).
4. The ellipsis census prints as today, now with `labelLines` lines.
5. §5.1–§5.4's cases; the two camera openings; the Continue card never over the current node.
6. Everything that passes today still passes: the locked module leaks no titles (chip and
   popover included — a masked node's popover shows the generic text and no title), Tab order,
   Back draws once, drag does not navigate, plain click navigates, wheel pans.

---

## 7. Out of scope
Any change to `ReinforcementParents`, to how `current` is chosen, to the data model, to the
list view, to the lesson page. The mascot. Anything in WP-39/WP-40.

---

## 8. Constraints that do not move
`env -u RAILS_MASTER_KEY bin/rails test` for every run; never commit `config/master.key`,
`config/credentials/*.key`, local tool folders, or `node_modules` (WP-38's history purge must not repeat:
no `git add -A`); keep `config/credentials/production.yml.enc` as it is; no API key is ever
printed or pasted. Every fix ships with the test that catches its class, seen red first. All
three suites (app, engines, system) green before each checkpoint. The agent reports; the owner
and I verify against the branch before believing a report.

---

## 9. Checkpoints (stop and hand off at each)
1. **Pure modules** — §2 (layout additions), §3 (`journey_map_paths.js`), §4.3 (`journey_terrain.js`)
   with their node tests green and red-first evidence. I run them under node myself with my
   fuzz before you go on.
2. **The page** — §4 and §5 built, system tests green, and `SCREENSHOT=1` renders at 7, 7+13
   (seed the production shape: fans of 3, 3, 3, 4 under steps 2, 3, 5, 6) and 43, light and dark,
   1440 and 390, placed in `tmp/wp37b/renders/`. The owner compares them with the prototype
   renders side by side.
3. **Review** — a fresh reviewer over the whole branch (merge-base `b907fea9`), its fixes, the
   handoff (`WP37B_HANDOFF.md`: what changed, numbers from the census, what the tests do not
   catch, the §0 of WP-37's handoff still pending if it is), the spec addendum committed under
   `docs/superpowers/specs/2026-10-08-wp37b-journey-map-drawn.md` and the plan under
   `docs/superpowers/plans/`.

Acceptance is the owner's, in production, with his own screenshot: *does it look and feel like
the prototype — beautiful, comfortable, and does the learner know what to do next?*
