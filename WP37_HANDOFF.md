# WP-37 — The journey is a map

The journey page stops being a scrolling list of satellites and becomes a pannable map: route →
module → primary step → reinforcement, laid out as a tidy tree, with one camera, one safe area, and
labels measured for size and contrast in both themes.

Branch `wp37-journey-map`, forked from `main` at `5e07c80f`, with **`main` (`55725b74`, which
includes `ci-engine-tests`) merged in** at `a3e06a57`. Nothing is pushed. The owner
fast-forwards `main`.

---

## §0 — The data the map is judged on

- **`wp29:census` / `wp29:cleanup`** ran in production on **21 September** (the owner's run):
  reinforcement **36 → 13**; the real route has **20 steps — 7 primary, 13 reinforcement**. The
  outputs, as the owner supplied them from his terminal:

  > **wp29:census, before** — reinforcement steps, total: 36 · untouched (locked/available): 23
  > · touched (in progress/completed): 13 · routes carrying any: 1 · worst routes:
  > 60452d4b-bda4-4934-9228-9aaa91e22ed7 36 steps · routes whose steps are ALL untouched: 0.
  >
  > **wp29:cleanup** — "deleting 23 untouched reinforcement steps..." followed by 24
  > [StrictLoading] WARN lines (Assessments::Assessment#questions / #assessment_results,
  > lazily loaded during the destroy cascade, production is :log), then "deleted 23;
  > recounted total_steps on 1 routes. There is no undo for this. The touched steps were
  > left alone." Note: it ran twice concurrently (kamal app exec without -r job runs once
  > per role); idempotent by construction, same result both times.
  >
  > **wp29:census, after** (with -r job) — total: 13 · untouched: 0 · touched: 13 · routes
  > carrying any: 1 · worst: 60452d4b… 13 steps.
- **Owner's post-deploy step** (read-only census of map parents; its numbers belong to that run,
  not to this handoff):

  ```
  bin/kamal app exec -r job 'bin/rails wp37:reinforcement_parents'
  ```

---

## 1. The legibility triple, together

Change one, re-measure the others.

| | |
|---|---|
| `labelWidth` | **168 px** (`app/javascript/lib/journey_map_layout.js:24`) |
| Label font | **13 px**, two lines then ellipsis; ≥ 12 px on screen at initial zoom (asserted) |
| Ellipsized at 7 | **5/11** — step 5/9, module 0/2 |
| Ellipsized at 43 | **5/47** — step 5/9, **reinforcement 0/36**, module 0/2 |

Light and dark measure the same. The 9 steps are 7 primary steps plus the 2 masked steps of the
locked module. Reinforcement topics carry production's three titles (the `es` locale's
`learning_engine.reinforcement.*.title`, longest *"Refuerzo: repasa los conceptos clave"*, 36
chars). All three fit, the longest on two full lines. Primary fixture titles are 40–70 chars,
one of them a single 65-char word.

For comparison, the satellite label on the old page measured **11.2 px** (Task 8, `da32082b`).

---

## 2. Suites

At `234138c1`, from a clean tree (`git status --short` empty before and after), one suite at a
time:

```
app 1:    1123 runs, 11608 assertions, 0 failures, 0 errors, 0 skips
app 2:    1123 runs, 11608 assertions, 0 failures, 0 errors, 0 skips
app 3:    1123 runs, 11608 assertions, 0 failures, 0 errors, 0 skips
engine 1:  385 runs,  1599 assertions, 0 failures, 0 errors, 0 skips
engine 2:  385 runs,  1599 assertions, 0 failures, 0 errors, 0 skips
engine 3:  385 runs,  1599 assertions, 0 failures, 0 errors, 0 skips
system 1:   98 runs,  2129 assertions, 0 failures, 0 errors, 0 skips
system 2:   98 runs,  2129 assertions, 0 failures, 0 errors, 0 skips
system 3:   98 runs,  2129 assertions, 0 failures, 0 errors, 0 skips
```

`bundle exec rubocop`: 625 files inspected, no offenses detected.

The engine suite reads 385/0 because `ci-engine-tests` is now merged. The four failures listed in
the plan are gone.

**A first set of nine runs at `a3e06a57` had the app suite at 1 failure, the same in all three
runs:** `MotionBuildFreshnessTest`. Task 10 had repointed a comment in
`app/motion/src/lib/cues.ts` from the deleted `journey_layout.js` to `journey_map_layout.js`, and
`app/motion` is hashed into `vendor/javascript/mc.js`'s freshness header. Rebuilding a vendored
bundle for one comment is not this package's job, so `234138c1` reverts the comment and the runs
above were redone from scratch. **That comment still names a file that no longer exists** (see §5).

---

## 3. Screenshots

Taken after Task 10a (they show the step numbers), in the main checkout's git-ignored `tmp/`:

```
tmp/wp37-handoff/wp37-journey-7-light.png
tmp/wp37-handoff/wp37-journey-7-dark.png
tmp/wp37-handoff/wp37-journey-43-light.png
tmp/wp37-handoff/wp37-journey-43-dark.png
tmp/wp37-handoff/wp37-journey-phone.png
```

The Checkpoint 3 set (before the numbers) is in `tmp/wp37-cp3/`.

---

## 4. What changed

- **For a buyer:** a purchased module is readable on the journey and on the list view (Task 2,
  `6cf9b87b`). Before, the journey and the list asked `access_preview?`, so a student who had
  paid still saw the module locked; readability now comes from `ModuleAccessPolicy.module_reader`.
- **For everyone:** the journey is a map (§1–§3 of the spec). Pan by drag or wheel, pinch or
  ctrl-wheel to zoom, + / − / *Encajar* (Fit), the module rail, and Tab, which brings an
  off-screen node into view.
- **Direction cue (Task 10a, the owner's call):** every primary step that is not done shows its
  1-based place among **its module's** primary steps inside its circle. The done step keeps its
  check; the current step keeps its ring and also shows its number. Reinforcement and masked
  steps show none. A right-to-left row now reads 7 ← 6 ← 5. The layout computes `ordinal`, and
  the controller only draws it. Red first: 23 layout shapes and 5 system cases. Two mutations
  were caught (numbering done steps; counting reinforcement in the ordinal). **One reading to
  confirm:** the note said "route position" but specified the test as *position among the
  module's primary steps*. I built the latter, so a purchased second module counts from 1
  again, and a test pins that.
- **One layout module:** `journey_layout.js`, its node test, the satellite system test and its
  importmap pin are deleted (Task 10), and a test guards against their return.

---

## 5. Not done, and what the tests do not catch

Handoff minors from Checkpoint 3:

1. **Phone: the rail dots overlap the right-edge label.** Visible in `wp37-journey-phone.png`:
   the dots sit on step 4's label. The rail is an overlay, but labels near it are not kept
   clear of it. Only the current node is.
2. **The route title appears twice:** in the top bar and as the root node.
3. **The 43 view opens with the root and the module off the left edge.** That is §3.4 working
   as written: the initial camera centres on the current step at a legible scale, not on the
   whole tree. **The answer is *Encajar* (Fit)**, which puts all 47 nodes in the safe area. I
   checked this in the browser.

From the browser pass (dev server restarted from the worktree; a throwaway user with a 7-step
and a 43-step route, created for the pass and deleted after it):

4. **The subtitle line has no backing.** The top bar blurs what passes under it, but
   `.jm-subtitle` (*"Camino personalizado · 2 etapas · …"*) is transparent. After a pan,
   reinforcement circles and labels show through its text. It is in the safe-area overlays, so
   the current node is never put under it, but any other node can be.
5. **The rail dots are 8 × 8 px**, well under a 24 px touch target (WCAG 2.5.8). They do work:
   a click on dot 2 brought *Módulo avanzado* into view.
6. **Not checked by hand:** the phone size (the Chrome window would not resize below the
   desktop size, so the phone is covered only by the system test and its screenshot);
   `prefers-reduced-motion` (covered by the system tests through CDP emulation, not toggled by
   hand); trackpad pinch. Checked and working: drag, wheel pan (scale unchanged), +, Fit, a rail
   click, Tab and Shift+Tab with a visible focus ring, light and dark.
7. **`app/motion/src/lib/cues.ts:4`** still names `app/javascript/lib/journey_layout.js` as its
   example of a node-tested module. Fix it the next time `bin/motion-build` runs for a real
   reason (§2).
8. **Not in this package** (spec §5): the journey's data model (modules, steps, gates); any
   change to how reinforcement is generated beyond writing `triggering_step_id`; the list
   view's design; the mascot.

---

## 6. Merge context

- Forked from `main` at `5e07c80f`. `main` at `55725b74` is merged in (`a3e06a57`) with no
  conflicts, so the branch is a fast-forward of `main`.
- `.github/workflows/deploy.yml` deploys on green CI on `main`.
- After deploy, run the `wp37:reinforcement_parents` command in §0.
- Acceptance is the owner's, in production: his own screenshot at 7 primary steps (the real
  route of 20) answering *does it read as a map?*
