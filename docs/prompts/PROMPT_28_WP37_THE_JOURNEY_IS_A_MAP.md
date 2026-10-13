# WP-37 — The journey is a map, not a scroll

Branch: `wp37-journey-map`, off `main` at `39f7fa2` or later. **Independent of `wp36-narrated-scenes`**
(no shared files: this package touches the journey view, its controller, its geometry module and
their tests; WP-36 touches `app/motion`, the parser, `_motion.html.erb` and `AiClient`). It can run in a
second session in parallel and merge after WP-36.

The owner's words, 12 September, looking at production at 9/43: *"a node connects to a node, and so
on for every super-node — they spread sideways or downward depending on how many there are. More a map
than a scroll-down."* WP-35 §4 made the journey stop overlapping; it did not make it a map. This
package does.

House rules, unchanged: every fix ships with the test that prevents its class, shown red first; every
claim in the handoff is something you ran; **a block the student cannot read is a defect, not a style
choice** — measure what the student sees (pixels, contrast, legible text), not what the DOM contains.
English throughout. Work it with the superpowers skills in the same order as WP-36: `brainstorming` →
spec (owner's yes) → `writing-plans` → `executing-plans` with `test-driven-development` →
`verification-before-completion` → `requesting-code-review`.

---

## §0 — Before any code: the data is wrong, and the layout must be judged on the right data

The screenshot shows 43 steps, of which some 36 read `Rei… Rev…`, `Rei… Gui…`, `Rei… Re-…`: the
reinforcement triplets WP-29 §4 stopped creating and whose **cleanup has never been run**
(`lib/tasks/wp29_reinforcement_cleanup.rake`: `wp29:census` read-only, `wp29:cleanup` deletes only
untouched ones). The owner runs both on the production box before this package's browser check, so
that the map is judged on the route's real shape — roughly seven primary steps plus the reinforcement a
student actually touched — and not on a pathology the fix for which already shipped. **Do not design
for 43 peers. Design for the hierarchy below, and make 43 a stress test, not the target.**

## §1 — The hierarchy the map draws

Four levels, from the data that already exists:

1. **Route** — one root: `learning_route.title`.
2. **Module** (super-node) — `route_modules` ordered by `position`; `access_state` `preview` /
   `locked` / `purchased`. Locked modules keep the WP-35 masking (shape, no titles, no links).
3. **Step** — primary steps of the module in `position` order: those **without**
   `metadata["reinforcement"]`.
4. **Reinforcement** — steps with `metadata["reinforcement"] == true`, drawn as **children of the
   primary step they follow**, not as peers. `AdaptiveDifficulty#insert_reinforcement!` writes them at
   `current_position + 1 + idx` in the triggering step's module, so the parent is **the nearest
   preceding primary step in the same module**; the metadata carries `trigger_score`, not a parent id.
   Add `triggering_step_id` to the metadata that method writes from now on (one line, tested), and
   fall back to the position rule for what already exists. Say in the handoff how many existing
   reinforcement steps in the seeded data resolve by position.

`RoutesController#journey` already produces `@stages` (modules) with `topics` (steps) and a
`reinforcement` flag; it grows a `parent_id` per topic and the route root. Nothing else changes on the
server: the map is a rendering of the same JSON.

## §2 — Layout: a tidy tree that spreads by count, on a pannable canvas

**Pure geometry in `app/javascript/lib/journey_map_layout.js`**, next to WP-35's `journey_layout.js`,
no DOM, tested under node at 1 / 7 / 8 / 20 / 43 steps and at 1 / 2 / 5 modules. Implement the
Reingold–Tilford tidy tree (Buchheim's linear-time variant is fine and short) rather than pulling in
d3-hierarchy: the repo vendors nothing it can write in 150 lines and test, and the CSP allowlist gains
nothing new. Orientation is decided **per node by its child count**, which is what the owner asked
for: a module with ≤ 4 primary steps lays them out in one row to the side; more than that wraps into
rows below, with the tidy tree keeping subtrees from overlapping. Reinforcement children hang under
their step in a compact fan. Modules connect along a spine (previous → next), steps connect in route
order, a step connects to each of its reinforcement children — **every edge is drawn**, node to node,
with a path element, so the picture reads as connections and not as scattered circles.

The canvas: one SVG for edges and one absolutely-positioned HTML layer for nodes (they are links),
inside a viewport that **pans and zooms** — pointer drag, wheel, pinch; a Fit button; the initial
camera **fits the current module and centres the current step**. The page itself does not scroll. Keep
the existing rail as a module index (click → camera to module). Node size is constant — legibility
does not shrink with count because the camera is what changes. `prefers-reduced-motion`: no camera
animation, no satellite entrance animation; the picture is complete at first paint.

`journey_layout.js` and its tests are **deleted** when this lands; one layout module, not two.

## §3 — Legibility is the acceptance criterion

The 44px circle with a 28px text box gives the student "Rei…" / "Gui…" — the screenshot is the proof.
Every node shows its **full title** in a label beside or below the node (two lines, ellipsis after
that, full title in `title` and `aria-label`, as today), at a minimum of 12px on screen at the initial
zoom. Status is encoded in form and colour (done / current / locked / reinforcement) from the app's CSS
tokens — read at mount with `getComputedStyle`, as `route_journey_controller.js:108` already does —
and works in both themes.

The system test measures, it does not trust: at 7 and at 43, in `data-theme="light"` and `"dark"`,
(a) no two node **label** boxes intersect (measured `getBoundingClientRect`), (b) every node's label has
computed font-size ≥ 12px and contrast ≥ 4.5 against its backing, (c) the current step's node is inside
the viewport at first paint, (d) every step is reachable by Tab in route order, (e) a locked module
leaks no titles, (f) with `prefers-reduced-motion: reduce` emulated, the first paint is the final
picture. The pure-module tests assert no subtree box intersects another at every count.

## §4 — What stays

The list view (`Vista de lista`) stays and keeps its tests. The module/level tag, colours per level,
progress rings on nodes, the "done" check — reuse, do not redesign. Locked masking from WP-35 stays
and is re-asserted. The journey route, the layout, `journey.html.erb`'s targets — rename only what the
new structure forces.

---

## The tests that prevent the classes

1. **"A node the student cannot read."** The measured legibility test of §3, red today (labels
   clipped at 28px, no dark-theme tokens in the geometry).
2. **"A reinforcement drawn as a peer."** A fixture route with one primary step followed by three
   reinforcement steps renders **one** primary node with three children and three edges to it; the
   controller's `parent_id` is asserted, and the position fallback is asserted for a legacy step without
   `triggering_step_id`.
3. **"Subtrees overlap."** Node tests on the pure layout at every count and module count; the system
   test's measured no-intersection at 7 and 43.
4. **"The current step is off-screen."** Initial camera contains the current node, at 7 and at 43.
5. **"Two layout modules."** A test that `app/javascript/lib/journey_layout.js` no longer exists.

## Order

1. §0 — the owner runs `wp29:census` and `wp29:cleanup` on production; paste both outputs in the
   handoff's first section. Not code, but it is the first step.
2. §1 server side (`parent_id`, `triggering_step_id`), red first.
3. §2 pure layout with node tests, then the canvas and camera.
4. §3 legibility test red → green, both themes.
5. §4 regression pass; delete `journey_layout.js`.

## Verification

Three suites, three runs each, from a clean base; RuboCop clean. In a browser against dev: the seeded
route at 7 and a fixture at 43, both themes, reduced motion on and off; pan, zoom, Fit, rail click;
screenshots of all four in the handoff. Then the owner looks at production after deploy — the
acceptance is his: *does it read as a map?*

## Not in this package

The journey's data model (modules, steps, gates). Task 8. Any change to how reinforcement is
generated beyond writing `triggering_step_id`. The list view's design. The mascot (parked since 6c).
