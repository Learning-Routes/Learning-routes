# WP-12 handoff

**Branch:** `main` · **Commit:** `59301e8` · **Not deployed** (my changes; §0's were already live).

Two of the three sections turned out to be already-solved or already-built. Both are
documented with the evidence, because "already fixed" is only useful if you can check it.

---

## §0 — no action needed: the three commits were already deployed

The premise was that the deploy died on a buildx error and production was on `3d3aa80`.
It is not.

| Check | Result |
|---|---|
| Images on Docker Hub | `0c20012`, `b47671d`, `fbb35fb` all pushed; `latest` 2026-08-14T19:02:29Z |
| Running containers | `learning_routes-web-0c200124…` and `-job-0c200124…`, **up 10 minutes** |
| `fbb35fb`'s fix inside the running container | `grep -c image_description _visual.html.erb` → **5** |
| `b47671d`'s theme fix inside it | `grep -c "var(--color"` → **8** |

So the buildx failure was an earlier attempt that was retried successfully. I did **not**
re-deploy — production is already at `main`'s previous head. My WP-12 commit is the only
thing now undeployed.

## §B — the gaps are gone; skipped as instructed

Measured, not read. A real lesson (15 sections, the full block mix — concept ×4, check ×4,
visual ×2, drag_drop, fill_blank, example, flashcards, tip, summary) loaded in a headless
browser against the deployed code. Each section revealed in turn and every text-bearing
leaf element compared against its effective background:

```
sections: 15
total elements whose text colour == their background: 0
elements with height > 20px and no text at all:       0
```

Per-section: `0 concept h=351 text=320 invis=0`, `1 concept h=754 text=574 invis=0`,
`3 concept h=327`, `4 visual h=340`, `5 drag_drop h=401`, `7 concept h=943`,
`8 example h=414`, `10 tip h=324`, `11 visual h=340`, `12 fill_blank h=179`,
`14 summary h=525` — no invisible text and no empty-tall element anywhere.

`b47671d` (29 hardcoded light-theme hex values → theme variables) is what fixed it: text
was being painted the colour of the page. **§B needs no work.**

*(The `check` sections measure h=0 — they are collapsed until the stepper activates them.
Zero height, so not a gap.)*

---

## §A — the client gate, wired

**The bug, both halves confirmed.** `interactive_lesson_controller.js:371` read
`this._locked = isCheck && !isAnswered`, so only `check` ever locked navigation — a
student pressed Continuar straight past an untouched `drag_drop`, `fill_blank`,
`scenario` or `flashcards`. And `block_submission.js:50` had been dispatching
`block:graded` since WP-10 with no listener anywhere.

**The wiring.** The server now publishes the policy per section — `data-gating` from
`BlockGrader.gating?` and `data-block-satisfied` from `BlockAttempt`, both rendered in
`_lesson.html.erb`, with `@satisfied_sections` loaded once per render rather than per
section. `_detectQuizLock` reads those two attributes instead of testing for `check`, so
every gating type locks; `_handleBlockGraded` listens for `block:graded` and unlocks when
the server says `satisfied`. Navigation follows **`satisfied`, never `correct`**, so a
block released after three failures unlocks while still recording `correct = false` —
the WP-10 distinction is load-bearing here and is tested in both directions. A blocked
press now also renders the localized `learning_engine.blocks.required` beside the button
instead of only shaking it. The JS holds no list of block types; if `GATING_TYPES` gains
one, the page follows without a second edit. `RouteStep#outstanding_blocks_for` is
untouched, so a student who bypasses the JS is still refused by `StepsController#complete`.

**Verified in a real browser**, not only by test:

```
concept    idx=0  gating=false satisfied=false -> _locked=false
drag_drop  idx=5  gating=true  satisfied=false -> _locked=true    (never locked before)
fill_blank idx=12 gating=true  satisfied=false -> _locked=true    (never locked before)
check      idx=2  gating=true  satisfied=false -> _locked=true
drag_drop  after block:graded{satisfied:true}          -> _locked=false
fill_blank after block:graded{satisfied:true,correct:false,released:true} -> true -> false
```

---

## §C — the architecture existed; it was not safe

`pregenerate_content!` (3 steps at creation), `BackgroundContentGenerationJob` (the rest)
and `prefetch_upcoming_steps!` (2 ahead) were all already there. The defect was
underneath them.

**`ContentPipelineJob`'s idempotency guard is `return if content_ready`. It does not
check `content_generating`.** So enqueuing a step that is *still in flight* runs a second
full pipeline and pays for a second `lesson_content` call. Of the three enqueue paths:

| Path | Claim | Safe? |
|---|---|---|
| `StepsController#prefetch_upcoming_steps!` | atomic UPDATE on **both** flags | ✅ |
| `WizardRouteGenerationJob#pregenerate_content!` | plain `update!` then enqueue | ❌ |
| `BackgroundContentGenerationJob` | rejected `content_ready` only | ❌ |

The third is the expensive one: it fires **30s** after route creation, and the first
three pipelines take ~20s median running two at a time — so it lands inside the window
where they are often still generating and re-enqueues them.

**Fix: `ContentPrefetcher` is now the only way content is enqueued.** One atomic
`UPDATE … WHERE content_ready IS DISTINCT FROM 'true' AND content_generating IS DISTINCT
FROM 'true' … RETURNING id`, using `jsonb_set` so a 100-300KB `parsed_sections` blob is
not rewritten to flip a flag. A caller that loses the race enqueues nothing.

### The numbers, with their cost

Measured from 11 real completed `lesson_content` interactions:
**median 3¢, mean 3.09¢, max 4¢; latency median 19.2s, max 23.7s.**

| Decision | Value | Justification |
|---|---|---|
| Batch at route creation | **3 steps ≈ 9¢** (12¢ worst case) | A "good part" of an 8-18 step route. At ~20s each, two at a time, all three are ready in ~40s — long before a student finishes step 1. Full 8-step route ≈ 24¢. |
| Rolling window | **2 ahead** (unchanged) | The owner's requirement is depth 1 ("al llegar al 2 se genera el 3"); 2 gives a step of margin. Deeper spends 3¢/lesson on steps that may never be reached. |
| Concurrency bound | **2 in flight per route** | `ContentPipelineJob` runs on `default`, whose pool is **3 threads shared with `low` and `low_priority`** — mailers, streaks, the reaper. Letting one route take all three starves the box (512MB, 2 CPUs). Two leaves a thread for everything else. |
| Background fill | **self-rescheduling**, 45s recheck, 40-pass cap | The old version dumped every remaining step on a 5s stagger, which spreads arrivals without bounding depth. Rescheduling bounds actual concurrency and still finishes. |

**Idempotency confirmed rather than assumed** — `content_ready` alone was never enough,
which is the whole finding. Tests cover: an in-flight step is not re-claimed; a second
claim of the same steps returns `[]`; prefetching twice enqueues once; `jsonb_set`
preserves `parsed_sections` and other keys; a finished step frees its slot; one route's
budget does not consume another's.

---

## Test counts

| Path | Before (`0c20012`) | After |
|---|---|---|
| `env -u RAILS_MASTER_KEY bin/rails db:test:prepare test` | 207 runs, 0F 0E | **227 runs, 653 assertions, 0F 0E** |
| `env -u RAILS_MASTER_KEY bin/rails test test engines/*/test` | 500 runs, 3F 9E | **520 runs, 1478 assertions, 3F 9E** |

**Red engine tests: 12 before, 12 after** — measured as the intersection of 3 runs, and
all three runs were identical (`3 failures, 9 errors`). Same 12 names as WP-10.
`bin/rubocop`: 373 files, no offenses.

20 new tests: 11 `ContentPrefetcherTest`, 9 `BlockNavigationGateTest`.

---

## What surprised me

1. **Two of the three sections were already done.** §0's commits were deployed and §B's
   symptom was already fixed by them. Building either would have been work against a
   problem that no longer existed — which is exactly what the brief warned about, and it
   applied to the brief's own premise.
2. **§C's architecture was right and its safety was not.** The prompt said "the
   architecture is right; it never got ahead because each pipeline took minutes." True,
   but the more expensive problem was that two of three enqueue paths could double-bill,
   and the 30s background timer is tuned to land exactly inside the window where that
   happens.
3. **I deleted three methods with a careless edit.** Replacing `prefetch_upcoming_steps!`
   by slicing from its `def` to the next comment removed `content_retry_due?`,
   `derived_fsrs_rating` and `request_content_generation!` (WP-2 and WP-10 work) as
   collateral. A test caught it — `NameError: undefined local variable or method
   'derived_fsrs_rating'` — and I reverted the file and re-applied against exact anchors.
   I then diffed the method list against HEAD to confirm only `load_satisfied_sections!`
   was added. Worth noting given the warning about reports that do not match their diffs:
   I verified each §A claim against `git diff` before writing this.
4. **The real `drag_drop` pair shape is `{term:, definition:}`**, not a tuple. My first
   fixtures used tuples; grading passed anyway because `BlockGrader` matches on indices
   and is shape-agnostic, but the partial raised. A grading test can be green against
   data the view cannot render.
5. **`content_type: "review"` renders a different partial entirely** — no
   `.lesson-section` nodes — so my first navigation test asserted against a page that
   contained none of what it was checking. Lesson steps for DOM assertions, review steps
   for completion assertions.
