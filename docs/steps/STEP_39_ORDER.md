# STEP 39 — Order: rescue the map, fewer PRs, design before code

**Base:** `main` at `49b0caf7` (PR #71 merged). **Written:** 16 October 2026, after the owner
stopped the line. His words: things were skipped or lost along the way (*"I still don't see the
new map with smooth lines instead of straight ones"*); too many small PRs where several changes
could travel together; the skills are not being used — *research, brainstorm, then build*; the
site needs a design layer, starting with five pages he finds ugly or improvable; and *"let's
work in order."*

This STEP is the order. It does not add features. It says what exists, where it is, and in
which few PRs the rest ships.

---

## 0. Inventory — measured on 16 October against `origin/main` and the owner's clone

| # | Item | Where it is | State |
|---|---|---|---|
| 1 | **The map drawn** (WP-37b checkpoint 2 + the fresh review: panels, curved routes, terrain, Continue card, popover) | Local branch `wp37b-cp2` at `c4f533ed`, worktree `../Learning-routes-cp2`. **Never pushed. No PR.** | Built and reviewed on 13 October. 8 commits, 11 files, +1,518 / −209. Now 41 behind `main` (merge-base `a54a5d30`). The leash (STEP 38 §4, ruled 14 October) is not in it. **All 7 non-merge commits carry a tool co-author trailer** — pushed as is, they would break the authorship rule and fail `no-tool-attribution`. |
| 1a | Why production still draws straight lines | `app/assets/tailwind/application.css:3410–3413` (`.jm-edge*`) | `journey_map_paths` and `journey_terrain` are pinned in `config/importmap.rb` but nothing on `main` imports them — checkpoint 1 shipped only the pure modules (PR #49). |
| 2 | "Claude" in the landing's integrations list | `config/locales/es.yml:114`, `en.yml:114` | Open. |
| 3 | STEP 37, close the audit | `docs/steps/STEP_37_CLOSE_THE_AUDIT.md`, untracked in the owner's tree | Not started. §1 is the only live danger: `db/seeds/content_delivery_seed.rb:23` runs `route.route_steps.destroy_all` on a real route, and raises a strict-loading error on a fresh `db:prepare`. |
| 4 | STEP 38 | `docs/steps/STEP_38_…`, untracked | Done except §4 (the leash), which moves into PR 2. |
| 5 | STEP 36 §2–§5 | `docs/steps/STEP_36_FOUND_BY_GOOGLE.md` | Not started. No `/es` `/en`, no `hreflang`; `og:image` is the apple-touch icon. |
| 6 | `stash@{0}` "restos del checkout fallido en el puente" | Owner's clone, 2 September, 22 files | Triaged in Step 0 (`tmp/redesign/stash_triage.md`): 32 files, all on `main` via `454a1f01` or superseded; nothing lost. Safe to drop — the owner's call. |
| 7 | 29 worktrees beside the clone | `~/Documents/Learning-routes-*` | Every branch merged except `wp37b-cp2`. This clutter is how #1 got lost. Step 0: 12 entries point at folders already gone (`git worktree prune` clears them); the rest go after PR 2. |
| 8 | Small known bugs on the board | — | One-topic rule should apply on create only; community/feed N+1; AI routes store the subtitle as the subject; the fallback route is named after the checkbox, not what the student typed; hand-written `rgba()` tints that only fit the light theme. |
| 8b | The Postgres rotation runbook (STEP 34 §1.4) | never written | Written by the reviewer on 16 October: `docs/runbooks/rotate-postgres-password.md`, untracked. The owner runs it. |
| 9 | Parked, unchanged | — | WP-40 owner's panel (owner role); WP-36 tasks 17–19 and Manim end to end (AI keys); the two AI-route naming bugs of row 8 (with the AI); paid module generation; refunds; separate builder; STEP 40 history rewrite. |

---

## 1. The rules from now on

1. **One theme → one STEP → one branch → one PR.** Inside the PR, commits stay small and each
   fix carries its red-first test. The PR is what the owner merges and deploys. Everything in §0
   ships in **five PRs**, not twenty.
2. **Nothing lives on one disk only.** A branch is pushed the day it has its first commit; work
   in progress is a draft PR. A worktree is removed the day its PR merges.
3. **Visual work follows research → brainstorm → spec → plan → TDD.** No visual change starts
   without a mockup the owner approved, the way `tmp/wp37b/prototype.html` was approved for the
   map. Name the skill you are using at each phase in your report (brainstorming, writing-plans,
   test-driven-development, systematic-debugging, verification-before-completion,
   requesting-code-review; frontend-design for UI work if installed).
4. **Every PR description lists the §0 rows it closes**, so this table visibly shrinks.
5. The owner merges only after the reviewer says it can merge.

---

## 2. Step 0 — safety and the "before" pictures (no PR, about 30 minutes)

a. **Get `wp37b-cp2` off the single disk, clean.** Work inside `../Learning-routes-cp2`, where
   the branch is checked out.
   1. `git status` there first. If anything is uncommitted or untracked outside `tmp/`, stop and
      report it before touching the branch. Copy its `tmp/wp37b/renders/` (if present) to
      `tmp/wp37b/renders-cp2/` in the main clone.
   2. Keep a local-only backup: `git branch wp37b-cp2-local-backup wp37b-cp2`. Never push it.
   3. Rewrite **messages only** for the commits in `main..wp37b-cp2`, removing every tool
      co-author trailer. Trees and the merge commit stay as they are; no rebase, no merge of
      `main` yet.
   4. Prove it: `git diff wp37b-cp2-local-backup wp37b-cp2` is empty;
      `git log main..wp37b-cp2 --format=%B` has no trailer and no tool name;
      `git rev-list --count main..wp37b-cp2` is unchanged.
   *Ruling, 16 October:* the untracked `docs/handoffs/WP37B_HANDOFF.md` found in the cp2 worktree
   is committed onto `wp37b-cp2` first, as its own `docs(wp37b):` commit with no trailer (STEP 30
   §9.3 asked for it). The backup branch is taken after that commit, and the count to keep is 9.
   5. `git push -u origin wp37b-cp2`. Report the new head.

b. **Render the "before" pictures** for the design phase, with test data only (fixtures or a dev
   database seeded with demo accounts; no real names, emails or routes — the repo is public).
   Pages: the community feed; the journey map (current `main`); a lesson step showing the lesson
   body and a check section; the profile with at least three route cards; the landing, full
   page, including the dark "Así se ve tu ruta" section; plus the dashboard and the wizard.
   Each in light and dark, at 1440 and 390 wide. *Correction, 16 October:* the first 390 set was
   laid out at 500 px (the browser's minimum window width) and cropped; 390 renders must use CDP
   device emulation (`Emulation.setDeviceMetricsOverride`, width 390, mobile, scale 2), as
   `test/system/journey_map_test.rb` does, and `document.documentElement.clientWidth` must read 390. Save as
   `tmp/redesign/before/<page>-<theme>-<width>.png`. Any helper script lives in `tmp/`; nothing
   is committed.

c. **Triage `stash@{0}`**: for each of its 22 files, say whether the change is already on `main`,
   superseded by later work, or present only in the stash — with the evidence (commit or line).
   Write `tmp/redesign/stash_triage.md`. Do not apply or drop the stash.

d. **List the 29 worktrees** with their branch and merged/unmerged status in the same report.
   Remove none; the owner removes them after PR 2 merges.

Stop and report.

---

## 3. The five PRs, in order

**PR 1 — Every known bug** (STEP 37 whole, plus §0 rows 2 and 8, plus the docs). Bugs first.
- STEP 37 §1 seed guard + the strict-loading fix, §2 the seven silent rescues, §6 icons,
  §3 community tests, §4 Google sign-in and sign-up, §5 the three jobs, §7 cable.
- The landing's integrations list without "Claude", both locales, with the test the owner's
  ruling asked for: every provider the landing names is routable in `AiClient`.
- From row 8: the one-topic rule `on: :create`, and the community/feed N+1 (it fits with
  STEP 37 §3).
- Found in Step 0: the landing's ETag ignores the theme (`LandingController#landing_cache_key`
  is locale + user + first node, while the page renders `data-theme` server-side), so a theme
  switch gets a 304 with the old theme. The key covers everything the page varies on, and
  `public: true` applies only to anonymous visitors. Test: switch theme, same URL, new body.
- Found in the design critique: every community post shows a leading blank line and indentation
  (`posts/_post.html.erb:31–33`: `white-space: pre-wrap` on a `<p>` whose body sits on its own
  indented line). Test: the rendered body starts with the post's first character.
- Found in Step 0: `app/controllers/dashboard_controller.rb` has no route (`/dashboard`
  redirects to `/profile`; `admin/dashboard#show` is the admin's). Remove it and its views if
  nothing else renders them, with a test that `/dashboard` still redirects. The `rgba()` tints go to PR 4. The AI subject/subtitle bug and the fallback
  route's name stay parked with the AI, as already decided.
- Commit STEP 37, 38 and 39 under `docs/steps/` and the runbook under `docs/runbooks/`.
- Anything the stash triage proves lost is reported, not restored, unless the owner says so.

**PR 2 — The map** (STEP 30 checkpoints 2–3 + STEP 38 §4).
- On `wp37b-cp2`: **merge** `main` in (keep the reviewed history; no rebase). Resolve against
  #61 (header sentence), #63 (route accent token), #64/#66 (colour tokens in views and JS).
- Add the leash exactly as STEP 38 §4 rules it, with its two system tests ("a drag of
  10,000 px leaves the map within bounds", "wheel without a modifier does not change the
  camera"); drop "Arrastra para explorar".
- Renders at 7, 7+13 and 43 nodes, light and dark, 1440 and 390, placed next to
  `tmp/wp37b/mapa-*.png`. Anything that does not look like the prototype is a defect.
- Seen in the cp2 renders: a title with markup shows its tags as text on the map and in the
  Continue card ("Comparar ‹b›ser‹/b›…"). Titles on the map are plain text with tags stripped,
  never escaped markup; test with that fixture.
- Update `docs/handoffs/WP37B_HANDOFF.md` with the leash and the merge.
- Acceptance: the owner's production screenshot against the prototype.

**PR 3 — Found by Google** (STEP 36 §2–§4). A URL per language with `hreflang`, real titles and
descriptions, Lighthouse numbers. The share image's artwork comes from the design phase (§4),
which runs in parallel with PR 1 and PR 2.

**PR 4 — The design layer, foundations** (STEP 41, written after the brainstorm). Type scale,
spacing, surfaces, the shared components (cards, buttons, chips, empty states), the `rgba()`
tints as tokens in both themes, one icon language — applied to the shared layout and navbar.

**PR 5 — The design layer, the pages** (STEP 41). The whole site, not only five pages. First the
five the owner marked: community feed, lesson page, profile and route cards, the journey (already
redrawn in PR 2, aligned to the foundations here), the landing's "Así se ve tu ruta" redrawn with
the map's own modules. Then every other page brought onto the foundations (dashboard, wizard,
settings, sign-in and sign-up, the public shared route, exams, notifications), and STEP 36 §5's
three public pages built on the new layout. If it is too large to review as one, STEP 41 splits
it into 5a (the owner's five) and 5b (the rest) — never more.

---

## 4. The design phase — the reviewer and the owner; the agent only renders

1. **Research.** A design critique of every "before" render (hierarchy, density, type, colour,
   mobile, consistency with the map prototype), an accessibility and UX-copy pass on the same
   renders, and a short survey of how strong learning products solve the same pages — patterns,
   never copies. The reviewer uses its design-critique, accessibility-review, ux-copy,
   design-system and UI-polish skills here; pages not covered by Step 0's renders are rendered
   on request in the same way.
2. **Brainstorm.** Two or three directions per page as clickable mockups, all derived from the
   map prototype's visual language — the one design the owner has approved "at another level".
   The owner picks per page.
3. **Spec.** STEP 41, written from his picks, with the mockups as the reference.
4. **Build.** PR 4 and PR 5 from STEP 41: plan → TDD, renders side by side with the mockups
   before each PR.

---

## 5. Constraints, unchanged

Nothing in the repo, commits or PR bodies names any AI tool; the authorship check must stay
green. No key, token or password is printed or pasted. Never `git add -A`; never commit
`config/master.key`, `config/credentials/*.key`, `.kamal/secrets` with values, `.claude/`,
`node_modules` or any `.env`. `env -u RAILS_MASTER_KEY` before `bin/rails test`. Every
`kamal app exec` uses `-r job`. No rake task grants the owner role. Never `db:seed` in
production. Screenshots contain test data only. The deploy is the owner's, from his Mac.
All three suites green from a clean tree before each stop; numbers quoted.
