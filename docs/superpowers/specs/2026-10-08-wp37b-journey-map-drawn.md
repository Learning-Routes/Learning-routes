# WP-37b — The map, drawn at another level: spec addendum

**Source of truth:** `STEP_30_WP37B_THE_MAP_DRAWN_AT_ANOTHER_LEVEL.md` (the brief) and the
approved prototype `tmp/wp37b/prototype.html` with its renders. This addendum does not restate
them. It records **the decisions the brief leaves open**, the interfaces the plan builds to, and
the rulings the owner makes at checkpoints. Section numbers like "brief §3" refer to the brief.
WP-37's spec (`2026-10-02-wp37-journey-map-design.md`) still holds wherever this addendum is
silent.

## A. Base

The brief names `main` at `b907fea9` as the base. At that commit `main` does **not** contain
WP-37's final review fixes (`1fca4a8e`: a done current step keeps its check, and a resize keeps
the student's view) or the §0 handoff commit (`2798bacf`). Those are on `wp37-journey-map`
(`7396de2f`), which fast-forwards `main`. The branch `wp37b-journey-map-drawn` starts from
`7396de2f`, so it does not lose them. Its merge-base with `main` is still `b907fea9`, so the
brief's checkpoint 3 review range is unchanged.

## B. Layout additions (brief §2)

- `DEFAULTS` gains `wave: 0`, `moduleLabelWidth: 168` and `rootX: -180`. With every default, the
  output is byte-identical to WP-37's.
  - **Pinned by digests, not by a frozen copy of the old file.** The test carries a SHA-256 per
    named shape of `JSON.stringify(layoutJourney(buildTree(...)))` as WP-37 (`b907fea9`) produced
    it. The regeneration command is in the test's comment.
- `moduleLabelWidth` sets the module node's `w`, and `spineHalf = max(moduleLabelWidth,
  moduleDiameter) / 2`. `labelWidth` no longer touches the spine column.
- `rootX` is the root box's left edge, and the root's `cx` is `rootX + rootWidth / 2`. The spine
  edge still starts at x = 0: the spine is the module column, not the root's centre.
- The root `rootX` is not covered by "no two boxes overlap": the root sits above the first module
  (`rootGap`), so any `rootX` keeps it clear.
- **Option sets the invariants run over:** `[{}, { wave: 16 }, VIEW]`, where `VIEW` is brief
  §2.4 verbatim. The brief asks for the first two. The third is what ships.

## C. `journey_map_paths.js` (brief §3): interfaces

```js
import { buildPaths, samplePath, PATH_DEFAULTS } from "journey_map_paths"
const paths = buildPaths(layout, tree, currentTopicId, opts)
```

- **`opts`** is the layout's options (the same object passed to `layoutJourney`) plus
  `panelPad = 18`, `bendRadius = gutter / 2 − 4`, `traceRadius = 9` and `tension = 0.55`. `gutter`
  and `reinforcementDiameter` are required; a non-finite value throws. The module imports
  nothing, because importmap's digested assets do not resolve a relative import between two
  pinned files.
- **`currentTopicId`** is the id of the topic with `current: true`, or `null`.
- **Return shape.** Every path entry is an object rather than a bare string, so the view and the
  tests can tell which module it belongs to and colour it. This deviates from brief §3's
  wording; the content is the same.
  ```
  panels:          [{ moduleId, box, level, locked }]
  spine:           [{ moduleId, d }]
  spineTravelled:  [{ moduleId, d, level }]
  route:           [{ moduleId, d, level }]   // readable modules
  routeLocked:     [{ moduleId, d, level }]   // locked modules
  travelled:       [{ moduleId, d, level }]   // d is a string prefix of that module's route d
  chevrons:        [{ moduleId, x, y, angle }] // angle in degrees
  trunk:           [{ from, d }]
  branch, branchOn:[{ from, to, d }]
  origin:          { x: 0, y: rootY + 10 }
  current:         { nodeId, headId, moduleId } | null
  ```
- **No current** (`currentTopicId` null or unknown):
  - nothing is travelled;
  - every readable curved segment gets its chevron;
  - `current` is `null`.

  The page does not draw a Continue card in this case (brief §5.1).
- **A current reinforcement under the anchor (an orphan):** its "parent head" is the anchor, the
  travelled path ends at the anchor's centre, and its branch is `on`.
- **The spine** runs from the origin diamond's centre (`rootY + 16`) to the first module disc's
  top. Each later piece runs from 2 px below the previous module's label box to the next disc's
  top. So the spine never crosses a module label.
- **Path grammar.** Absolute `M L C Q A` only, numbers separated by single spaces, one `M` per
  path. `samplePath(d, step)` parses exactly this grammar and throws on anything else, so a new
  command cannot pass the tests unsampled.

## D. What "continuous, never a corner" means in the tests

Each route path is parsed into commands. Each command must start where the previous one ended,
and every arc must be a quarter circle: the chord is `r·√2`. The tangent leaving each command
must equal the tangent entering the next (unit vectors, within 1e-6). That last rule is the
literal form of "never a corner". The route's last point is the last head's centre.

## E. `journey_terrain.js` (brief §4.3)

```js
import { contours } from "journey_terrain"
contours({ x, y, w, h }, { seed = 37, cell = 18, levels = [-0.32, -0.16, 0, 0.16, 0.32] }) // → string[]
```

- **The grid fits the rectangle exactly.** It uses `n = ceil(w / cell)` columns of width `w / n`,
  so no point falls outside `{ x, y, w, h }`. The prototype's grid overshot the right and bottom
  edges by up to one cell.
- **Output format:** each level is `M x yL x y` segments with one decimal, clamped to the rect.
- **Noise:** Perlin with seeded permutation, octaves `0.6 / 0.3 / 0.1` at `460 / 190 / 85` px, as
  in the prototype.

## F. Initial camera (brief §2.3, §5.4)

`initialCamera({ moduleBox, alsoBox, node, safe, minScale, padding })`:
- **Union first.** When the union of `moduleBox` and `alsoBox` fits at `k ≥ minScale`, it returns
  `k = min(1, fit)` centred on the union.
- **Otherwise today's rule, byte for byte.** `alsoBox` that is `null` or absent changes nothing.

## G. Rulings recorded at checkpoints

(Filled in as the owner rules.)
