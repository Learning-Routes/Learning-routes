# WP37B_HANDOFF — the map, drawn at another level

PROMPT 30 (WP-37b) checkpoints 2 and 3, run back to back as PROMPT 34 §2 asks. Branch
`wp37b-cp2`, cut from `main` at `dc0221b2`, which already carried checkpoint 1 (#49: the
layout options, `journey_map_paths.js`, `journey_terrain.js`, approved on 9 October). `main` was
merged in once, at `d982eb81`. Not rebased.

## 1. What changed

**Server.** All in `RoutesController`, nothing in the data model.
- Each reinforcement topic carries `short_name`: the kind's `learning_engine.reinforcement.<kind>.short` when its title is that kind's generated title in either locale, else the title without a leading "Refuerzo:" / "Reinforcement:".
- Every readable topic carries `minutes`, omitted when nil.
- `journey_continue` decides the Continue card: the current step and its place among its module's primary steps; "Ruta completada" when every readable step is done; nothing when no readable step exists.
- The locked-topic JSON is byte-for-byte the shape it was. The exact-shape test is unchanged.

**Page** (`journey.html.erb`, `layouts/journey.html.erb`).
- The root: the eyebrow "Tu ruta", the title in Instrument Serif (the only `h1`) and the meta "N módulos · M temas".
- The top bar loses its italic title. Its counter reads "3 de 26 · 12 %" over a 3 px line in the current module's colour.
- Gone: the rail, the subtitle, and the layout's bottom fade, which painted over the overlays.
- New overlays: the legend, the Continue card, and the list link plus − + Encajar in one glass bar.
- Every overlay is `data-journey-overlay`, so the camera keeps the current step clear of each one.

**Drawing** (`route_journey_controller.js`, which renders checkpoint 1's pure output):
- seeded contour terrain;
- one panel per module with corner ticks;
- a chip on each panel's top edge, plus an unlock pill on locked modules;
- one continuous route path per module, with the travelled prefix and its glow, and chevrons ahead;
- dotted fan traces;
- the current step's radial glow;
- the node states of brief §4.4;
- halo labels instead of boxes.

**Acting on it.**
- The Continue card, with `I` / the locate button to bring the current step back.
- A screen-space popover on hover, keyboard focus and tap. It carries the full title, status · minutes and the action, points at its node, flips below near the top, and is clamped at the edges.
- Double-click: on a node, centre it at ≥ 1.2; on the canvas, zoom ×1.6.
- `data-lod` fades labels when zoomed far out.
- The opening camera of §5.4.
- The entrance draws in on the first paint of a visit only: not on a Turbo restore, not after a Turbo preview, not under reduced motion.

**CSS.** The `.jm-*` block is rewritten. All colour comes from `--jm-*` / `--color-*` tokens, defined on `.jm` and again under `html[data-theme="dark"] .jm`. Fonts are only the three the layout loads.

## 2. Decisions taken provisionally (PROMPT 34 §0.3, the owner can reverse each)

| Brief | Decision | Why |
|---|---|---|
| §2.4 `labelLines: 3` | **2** (the prototype's value) | At 3, the production shape's title and first module can't open together at 1440 × 1000 above the legible floor: they need 890 px of height, which gives k = 0.912 < 12/13, and §5.4 pins that opening. The census below doesn't change between 2 and 3 (7/9 test step titles clip at either), and the popover shows every full title. |
| §4.4 reinforcement labels 12 px | **13 px**, set apart by colour (`--color-sub`) and weight 400 instead | WP-37's legibility guarantee is ≥ 12 px *rendered*. On a phone the camera opens at 12/13, where 12 px renders as 11.1 px. |
| §4.2 the unlock pill goes "to the same target the list view uses" | **The route's list view** | The list view has no link for a locked module, and no student UI calls `POST /commerce/routes/:id/checkout`. Adding a payment entry point to the map is a product decision. |
| §5.2 "on tap; a second tap closes it" | As written, and the popover's action line is a link (`tabindex -1`) | Otherwise a touch user could only open a step through the Continue card. Mouse and keyboard still open a step with one click / Enter. |
| §5.3 double-click a node to centre it | Applies to the module disc, masked nodes and the canvas | A step is a link: a mouse click navigates before a double-click exists. |
| §5.4 "k ≈ 0.97" for 7+13 at 1440 × 1000 | **k = 0.932**, pinned | The production module is 1476 px wide, wider than 1440, so the opening is width-limited. Title, chip and the whole module are in view, as the brief asks. |
| §4.1 legend bottom-left on every width | Hidden under 700 px (as the brief says); from 701 to 1279 px it rises above a left-aligned card | At those widths the centred card covered the bar (fresh review, finding 5). |

## 3. Numbers

**Ellipsis census** (`report_ellipsis`, 124 px labels, 13 px / 16 px, the test's real-length Spanish titles):

| Shape | 2 lines | 3 lines |
|---|---|---|
| 7 | step 7/9 · module 0/2 | step 7/9 · module 0/2 |
| 7+13 | step 7/9 · reinforcement 0/13 · module 0/2 | same |
| 43 | step 7/9 · reinforcement 0/36 · module 0/2 | same |

The 48–65-character step titles clip at both line counts: 124 px holds about 18 characters per line. Reinforcement short names never clip. The popover is where a full title is read. If the owner wants titles whole on the map, the lever is `labelWidth`, not `labelLines`, and it widens every module.

**Camera openings** (CDP device metrics, the prototype's sizes):
- 7 at 1440 × 1000: k = 1.0.
- 7+13 at 1440 × 1000: k = 0.932.
- 7+13 at 390 × 844: the current step is centred at k = 12/13.

**Contrast** ≥ 4.5:1, measured:
- in both themes: every node label, the root title, eyebrow and meta, the chips, the unlock pill, the card, the legend and the counter;
- in the light theme only: the popover text. Its dark-theme colours are the same tokens as the card's. The map's own `--color-muted` (#887F72, 3.6:1 on #F5F1EB) is used for strokes only; text uses `--color-sub`.

## 4. The fresh review (plan Task 14) and what was done

A fresh reviewer read checkpoint 2 whole. It found no paywall leak and no XSS: every
`innerHTML` writes only constant icons; titles go through `textContent`.

| # | Finding | Done |
|---|---|---|
| 1 | Back restored a popover that was open when the student left | closes on `turbo:before-cache` and at connect; test (opened and left by keyboard), red then green |
| 2 | After any touch, Enter on a step opened the popover instead of navigating | a click with `detail 0` always navigates; any key press ends "touch"; test |
| 3 | A tap: the focus opened a mouse popover and the click closed it | focus during a press belongs to the pointer (no popover, no camera move); test of the tap path |
| 4 | Tab onto an off-screen chip or unlock pill left it hidden | any focused world control is brought into view; test |
| 5 | 701–1279 px: the card covered the bar; the legend spilled | the card moves left of the bar, the legend above it; tests at 1024, 1180, 800 |
| 6 | The hover test couldn't fail on "a drag closes it" | the drag now starts on the node and is checked while over it. That surfaced a real bug: hover reopened the popover mid-drag, and a mouse-focused link kept it open. Fixed. |
| 7 | The layout's bottom fade painted over the overlays | removed |
| 8 | The entrance replayed after a Turbo preview | the preview's URL is remembered across the two connects |
| 9 | The stagger was uncapped on long routes | capped at 40 steps |
| 10 | "Bloqueado, Bloqueado"; the chip's number read twice | de-duplicated; the chip's label built from parts |
| 11 | Escape only worked with focus in the map | Escape closes the popover from anywhere; `I` works from a focused node |
| 12 | The re-place timer wasn't tracked | tracked and cleared on disconnect |

Also from the suites: `journey_fonts_test` had stopped at the first sub-heading inside the
block, so it read no font at all. It now reads every rule whose selector names `.jm`. A mutation
check (DM Sans in `.jm-card__title`) makes it fail.

## 5. My browser pass

Dev server on port 9997 from this branch; a dev-only user and three routes built by
`tmp/wp37b/dev_fixture.rb` (not committed). Real Chrome, 1470 × 779, dark (system) and light.
- Keyboard only: Tab walks chip → steps → reinforcement in route order, each one on screen. Focus opens the popover. Escape closes it. `I` centres the current step at x = 735 of 1470, k = 1.
- Hover: the popover is placed above the node, with its pointer.
- Click: opens a step. Back: drawn once (28 nodes, 33 paths, 5 terrain levels), no entrance replay. The popover under the resting mouse is a live hover: it closes when the mouse leaves.
- **Defect found and fixed:** a locked step's popover said "Disponible · 11 min" over "Se abre al terminar el paso anterior". It now says "Por llegar"; test red then green.
- No console errors.

Reduced motion on and off, and 390 × 844, are covered by the system suite under CDP emulation. A desktop Chrome window can't shrink to 390 px.

## 6. Renders for the owner

`tmp/wp37b/renders/` in the `Learning-routes-cp2` worktree:
`mapa-{7,7+13,43}-{light,dark}-{1440,390}.png` and `mapa-7-light-1440-popover.png`, at true viewport sizes (CDP), to set beside `tmp/wp37b/mapa-*.png`.
- The production shape in dark at 1440 matches the prototype's dark render line for line.
- The visible differences are the counter's place (the top bar, brief §4.1, rather than a bottom glass) and the legend on the phone (hidden, brief §4.1).

## 7. What the tests do not catch

- **Real touch hardware.** The tap path is tested with synthetic pointer events. Chrome Android and iOS Safari focus links on tap differently, so check on a device.
- **VoiceOver / TalkBack activation on touch.** It may still arrive as a touch click and open the popover first.
- **`backdrop-filter`.** Not rendered the same in every browser. `prefers-reduced-transparency` falls back to the opaque card colour.
- **Contrast over the terrain and through glass.** The measurement takes the nearest opaque ancestor (the page background), not the translucent panel or glass composited over contour lines.
- **The entrance's look.** The tests prove it starts, ends and is skipped where it should be. Nothing measures the draw-in itself.
- **solid_cable / Action Cable.** Untouched here.

## 8. WP-37's §0

The owner's post-deploy census `bin/kamal app exec -r job 'bin/rails wp37:reinforcement_parents'`
has not been reported to me, so it is still pending as far as this record goes. Nothing in
WP-37b depends on it.

## 9. STEP 39 PR 2 — the merge and the leash (16 October)

**Branch.** `wp37b-cp2` was pushed for the first time on 16 October (commit messages rewritten to
drop a tool trailer, trees unchanged; a local-only backup branch keeps the old ids). This handoff
was committed onto it first.

**The merge.** `main` merged in, no rebase. Two conflicts, both from #61: the journey header
sentence. The drawn map has no header subtitle — its root carries "N módulos · N temas", which
already counts the topics the map draws — so the view keeps this branch's side, #61's two tests
now check `.jm-root__meta` ("2 módulos · 3 temas", and the singular), and the keys only the old
subtitle used (`subtitle`, `stage_count`, `drag_to_explore`, a second identical `topic_count`)
are gone from es and en. #63/#64/#66's colour sweeps passed on this branch unchanged. Main's
`html_safe` sweep (STEP 37 §6) caught the Continue arrow: it is an `svg_icon` now, and the
engine's helper includes the app's to reach it.

**The leash (STEP 38 §4).** The drawn content plus a 48 px margin is the world. Every camera
move — drag, pinch, keys, double-click, focus, a module chip, resize — passes `clampCamera`, so
the world always covers the screen (or is centred on an axis where it is smaller). Zoom runs from
the fitted scale to 2× it. The page opens fitted with the current step centred; "Encajar" returns
there, and its label and the keyboard help now say so ("Volver a la vista inicial"). A wheel
without Ctrl/⌘ leaves the map alone. There was no inertia. A drag held at the bound restarts
from there, so reversing it moves the map at once. "Arrastra para explorar" is gone.

**Provisional, for the owner:** the fitted scale is fit-to-width **held between the legible floor
(12/13) and 1**. Literal fit-to-width opened a 7-step route on a phone at 0.25 (7 px labels, the
WP-37b legibility rule broken) and at 1440 at 1.44 (everything blown up). With the hold, a phone
opens at the floor with the map wider than the screen (dragging sideways stays on the leash),
and a short route on a wide screen sits at its drawn size. Say if fit-to-width should be literal.

**Titles.** A title with formatting tags showed them as text on the map and in the Continue card.
`RoutesController#plain_title` strips formatting tags only (b, strong, i, em, code, …) and decodes
entities; anything else in angle brackets — `List<String>`, `a<b`, `Vec<i32>` — is the title.

**Tests.** The two system tests STEP 38 §4 names ("a drag of 10,000 px leaves the map within
bounds", "wheel without a modifier does not change the camera"), Ctrl+wheel stopping at both ends
and a reversed drag past the bound — each red on the free camera; `clampCamera`/`leashRange` in
`journey_camera_test.rb`. Tests of the free camera now test the leash ("Encajar returns to the
opening view", "after a resize, Encajar fits the viewport it has now"); panning in tests is a real
CDP drag; the far-zoom fade test is gone (zoom never reaches 0.5 now, so LOD "far"/"mid" are
unreachable — the code and CSS are left for the owner's call). `initialCamera` is gone.

**Suites (clean tree, `11a4d1be`).** `bin/rails test` 1983 runs, 0 failures · engines 436, 0 ·
`test:system` 139, 0 failures, 1 skip (the owner renders, which run with `SCREENSHOT=1`).

**Renders.** 7, 7+13 and 43 nodes × light/dark × 1440/390 (390 as a phone: mobile, scale 2,
`clientWidth` 390), plus the popover, in `tmp/wp37b/mapa-pr2-*.png` beside the prototype's
`mapa-light.png` / `mapa-dark.png` / `mapa-phone.png`. Regenerate with
`SCREENSHOT=1 SCREENSHOT_PREFIX=pr2- bin/rails test test/system/journey_map_test.rb -n "/renders for the owner/"`.

**What the owner will see after the deploy.** Production draws straight lines today because
checkpoint 1 (#49) shipped only the pure modules; this branch is checkpoint 2 — the page itself.
Acceptance is the owner's production screenshot against the prototype.
