# STEP 35 — merge what is stuck: every branch that is ahead of `main`, into `main`

**Mandate from the owner (13 October):** *"Let's merge and push to main everything that is stuck."*

**Base:** `main` at `e8e63a1f`, which is what production runs (confirmed with
`bin/kamal app details`). **Standing order:** STEP 34 §0 and §5 apply — you stop only for a
secret, a merge (the reviewer verifies each PR before it lands), or a product decision.

## 0. The inventory — measured on 13 October against the local clone, not remembered

| Branch | Head | vs `main` | What it is | Action |
|---|---|---|---|---|
| `wp37b-journey-map-drawn` | `3e39c020` | 6 ahead / 13 behind (merge-base `7396de2f`) | WP-37b checkpoint 1, verified and approved by the reviewer on 9 October. Four pure modules, their node tests, spec + plan. Only `config/importmap.rb` overlaps `main`. | **Merge first** (§2) |
| `wp36-narrated-scenes` | `41b813fa` | 12 ahead / 82 behind (merge-base `9c9e19e4`, 11 September) | STEP 27 tasks 1–16: ElevenLabs word timings stored on `audio_sections`, section audio endpoints serve them, the motion scene follows the voice, prefetch only for purchased modules. Never merged. Touches `app/motion/src` (5 files), `vendor/javascript/mc.js`, both locales, `tailwind/application.css`. | **Rebuild, prove, merge** (§3) |
| `wp40-owner-panel` | `f929de5b` | 0 ahead | Starting point only; the census is already in `main`. | Nothing to merge; keep |
| `mail-resend` | `d4ed2d35` | 0 ahead | Starting point only; no Resend work exists yet. | Nothing to merge; keep |
| `wp38-pre-purge` | `aca88065` | 28 ahead | Deliberate backup of the tree before WP-38 untracked `app/motion/dist`. | **Not a candidate.** Tag `backup/wp38-pre-purge`, then delete the branch |
| `wp38-backup-before-motion-purge` | `6fae8b20` | 18 ahead | Same, earlier. | Tag `backup/wp38-before-motion-purge`, delete the branch |
| `codex/security-reliability-hardening` | `209582aa` | 0 ahead / 359 behind | Fully in `main` long ago. | Delete; prune its worktree (`/private/tmp/learning-routes-security-hardening`) |
| `wp37-journey-map` | `7396de2f` | 0 ahead | Merged. | Delete; the owner removes `Learning-routes-wp37/` |
| `ci-green`, `landing-signed-in` | | 0 ahead | Merged as PR #46 and #47. | Delete; the owner removes `Learning-routes-ci/`, `Learning-routes-landing/` |
| `dependabot/*` | | 13 local, ~30 on `origin` | Dependency bumps, many superseded. | **Sweep** (§4) |
| Untracked at the root | | | `STEP_30` … `STEP_34` (the earlier STEPs are tracked); local tool folders | Commit the five STEPs on `main` in one `docs:` commit. local tool folders is never committed |

Verify this table yourself before acting (`git rev-list --count main..<branch>` and
`<branch>..main`); if a row is wrong, say so in the handoff and act on what you measured.

## 1. The rules for every merge
- A PR against `main`; CI green **on the PR**; the reviewer's verification (STEP 34 §5: merge-base,
  commit range, suite numbers, the evidence named below) before it lands; merge commit or
  fast-forward, **never squash** — the commit history is the handoff.
- After each merge the owner deploys by hand (`source .env.deploy && bin/kamal deploy`; the
  Deploy workflow has never deployed anything — 148 skipped runs) and confirms with
  `bin/kamal app details`. You do not deploy.
- Production behaviour does not change unless the PR says it does. For §2 and §3 the claim is
  **"nothing visible changes"**, and a claim is proven, not stated.
- Branches shared with the reviewer are merged into, not rebased: `git merge main` on the branch.

## 1a. Order — changed by the owner on 13 October, evening
**§3 goes first, then §3b, then §2.** Production is `main`, and `main` predates the dark-theme fix
that lives only on `wp36-narrated-scenes` (`1c92e4a2`, with its red-first tests `3cdb4707`), so
today every `motion` scene in production is invisible in the dark theme. That is a bug students
can see; the map's checkpoint 1 is not. Bugs before features. Do §3, open the PR, and while the
reviewer verifies it do §3b; §2 after both are merged.

## 2. `wp37b-journey-map-drawn` — after §3 and §3b
1. `git merge main` on the branch. The only conflict is `config/importmap.rb`: keep **both** —
   `main`'s bumped pins (`katex@0.18.11`, `mermaid@11.16.1`, `dompurify@3.4.17`) and the branch's two
   new pins (`journey_map_paths`, `journey_terrain`, with their comment).
2. Prove nothing visible changes: the branch's own test that `journey_map_layout.js` defaults are
   byte-identical to WP-37 (run it, quote it); `grep -rn "journey_map_paths\|journey_terrain" app/views app/javascript/controllers engines/*/app/views` returns nothing (the page does not import them yet);
   `bin/importmap audit` clean; the three suites from a clean tree, numbers quoted.
3. PR: merge-base, commit range, the grep output, the suite numbers. Stop for the reviewer.
4. After the merge: checkpoint 2 continues on a **new** branch `wp37b-cp2` cut from `main`, per
   STEP 30 and STEP 34 §2. Delete `wp37b-journey-map-drawn` once it is merged; the owner
   removes `Learning-routes-wp37b/`.

## 3. `wp36-narrated-scenes` — tasks 1–16, rebuilt on today's `main`
1. `git merge main` on the branch (82 commits). Expect conflicts in `config/locales/{en,es}.yml`,
   `app/assets/tailwind/application.css`, and under `app/motion/src` — WP-38 later untracked
   `app/motion/dist`, vendored `vendor/javascript/mc.js`, and `ci-green` added
   `test/services/content_engine/motion_build_freshness_test.rb`, which hashes the comment in
   `app/motion/src/lib/cues.ts` into `mc.js`'s header. **Read that test before touching the motion
   tree**, and read `234138c1` (why `cues.ts` must stay byte-identical).
2. Rebuild the bundle the way the freshness test expects (`bin/motion-build`), commit the rebuilt
   `vendor/javascript/mc.js` in its own commit, and make the freshness test pass without editing it.
3. Exactly **one** visible change is allowed, and it is a fix: `main` (= production) predates
   `3cdb4707` and `1c92e4a2`, so today a `motion` scene is invisible in the dark theme (fixed ink
   on a transparent ground). After the merge the branch's contrast test must report ≥ 4.5 in both
   themes (it measured 12.97:1 dark / 17.38:1 light on 16 September) — quote the numbers.
   Everything else must render and play exactly as it does now: production has no word timings
   in the database and the ElevenLabs key is burned. Red first: a system test "a section with no
   stored timings plays with no cue sync, no retry loop and no console error"; the branch's own
   `motion_scene_test.rb`, `motion_scene_narration_retry_test.rb` and `motion_sync_test.rb` green;
   the metering test `41b813fa` fixed stays green.
4. PR: merge-base, commit range, the conflict list and how each was resolved, the suite numbers,
   the new test's name. Stop for the reviewer. Tasks 17–19 stay on STEP 34 track B1 and wait
   for the key — they are **not** part of this merge.
5. After the merge and the owner's deploy, the owner's acceptance is a screenshot of a `motion`
   scene in production **in the dark theme**, on the same step where it was invisible.

## 3b. The hook that makes "production runs main" a rule, not a habit
How `9c9e19e` reached production on 12 September: `kamal deploy` builds whatever the local checkout
is, and the checkout was the branch. Nothing refused it. Branch `deploy-guard`, from `main`.

1. `.kamal/hooks/pre-build` (tracked, executable), built from Kamal's own `pre-build.sample`, which
   already checks clean tree, remote present, branch pushed, and `KAMAL_VERSION` == remote head.
   Add the one check the sample lacks: **the branch is `main`**. Two adjustments to the sample:
   `git status --porcelain --untracked-files=no` (untracked files never enter the image — Kamal
   clones HEAD — and the owner's checkout always has some), and the comparison against
   `origin/main` specifically, not "the first remote's copy of whatever branch this is".
   Escape hatch: `KAMAL_ALLOW_BRANCH_DEPLOY=1` skips only the branch check, prints a loud line
   saying which branch is being deployed, and is documented as "for a hotfix the owner has
   decided on, never by default".

   ```sh
   #!/bin/sh
   # Refuses to build unless the checkout is main, clean, and equal to origin/main.
   set -e
   if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
     echo "pre-build: tracked files are modified; commit or stash before deploying" >&2
     git status --porcelain --untracked-files=no >&2; exit 1
   fi
   branch="$(git branch --show-current)"
   if [ "$branch" != "main" ] && [ "$KAMAL_ALLOW_BRANCH_DEPLOY" != "1" ]; then
     echo "pre-build: on '$branch', not main. Production runs main. (KAMAL_ALLOW_BRANCH_DEPLOY=1 to override, on purpose.)" >&2; exit 1
   fi
   [ "$branch" = "main" ] || echo "pre-build: WARNING — deploying branch '$branch' by explicit override" >&2
   local_head="$(git rev-parse HEAD)"
   remote_head="$(git ls-remote origin "refs/heads/$branch" | cut -f1)"
   if [ -z "$remote_head" ]; then echo "pre-build: '$branch' is not on origin; push first" >&2; exit 1; fi
   if [ "$local_head" != "$remote_head" ]; then
     echo "pre-build: local HEAD $local_head != origin/$branch $remote_head; pull or push first" >&2; exit 1
   fi
   ```

   Why `git rev-parse HEAD` and not `KAMAL_VERSION`: read `Kamal::Git.uncommitted_changes` in the
   installed gem — if it counts untracked files, `KAMAL_VERSION` becomes `<sha>_uncommitted_<hex>`
   whenever a stray file sits in the checkout, and the sample's comparison would refuse a perfectly
   clean deploy. Record what you found in the handoff, and if `KAMAL_VERSION` does carry
   `_uncommitted_` on a tree with no tracked changes, say so in the hook's warning line rather
   than refusing.
2. **Red first**, as a Minitest file that shells out (`test/deploy/pre_build_hook_test.rb`): build a
   throwaway git repo in `Dir.mktmpdir` with a bare `origin`, and run the hook with
   `KAMAL_VERSION` set, asserting exit status and the stderr line for each case: on `main`, clean,
   pushed → 0; on a branch → 1 with "not main"; with the override → 0 and the WARNING; modified
   tracked file → 1; untracked file only → 0; local ahead of origin → 1. Six cases, seen red
   before the hook exists.
3. Prove it against the real repo without deploying: `KAMAL_VERSION=$(git rev-parse HEAD) sh .kamal/hooks/pre-build; echo $?` on `main` (expect 0) and on the branch (expect 1) — quote both.
4. PR; stop for the reviewer. One paragraph in `README`/`DEPLOY_CHECKLIST.md`: what the hook refuses
   and the override. After the merge the owner's next `bin/kamal deploy` runs through it — that is
   the acceptance.

## 4. The Dependabot sweep — one afternoon, one deploy at the end
1. `gh pr list --author app/dependabot --state open --limit 100` (if `gh` is not authenticated,
   the owner pastes it). For each PR, one of three outcomes, written in the handoff:
   - **Superseded** — a newer bump of the same package is open, or `main` already carries ≥ that
     version (`rails-8.1.3` ← `main` runs 8.1.3.1; `thruster-0.1.20` ← `0.1.25` is open;
     `solid_queue-1.4.0` ← `1.6.0`; `selenium-webdriver-4.43.0` ← `4.49.0`; `simplecov-1.1.1` ←
     `1.3.0`; `ruby_llm-1.14.1` ← `1.16.0`; `actions/cache-5` ← `cache-6`; check the rest):
     close it with a one-line comment naming the successor.
   - **Patch or minor, CI green** — `@dependabot rebase` if stale, wait for green, merge, next.
     One at a time; never two bumps in flight.
   - **Major** (`puma 8.0.0`, `actions/checkout 7`, `actions/cache 6`, `actions/upload-artifact 7`,
     `bootsnap 1.25`, any other major): read the changelog, write the breaking changes in the PR,
     run the suite that exercises it (for puma: the system suite and a local `bin/rails s` boot
     with `WEB_CONCURRENCY=auto`), merge only if green and understood; otherwise leave it open
     with a comment and list it in the handoff. `omniauth-google-oauth2` and `bcrypt` are
     security-relevant: do those first among the minors.
2. After the sweep, from a clean tree: `bundle outdated --strict`, `bin/bundler-audit`,
   `bin/importmap audit`, `bin/brakeman --no-pager` — all quoted in the handoff.
3. One manual deploy by the owner at the end of the sweep, not one per bump.

## 5. Branch hygiene — last
`git branch --merged main` → delete every merged local branch; `git worktree prune`; list for the
owner the worktree directories he can now remove. Delete the remote branches of merged PRs, and
ask the owner to turn on "Automatically delete head branches" in the GitHub repository settings
so this does not accumulate again. Do not delete `wp40-owner-panel`, `mail-resend`, or the two
`backup/` tags.

## 6. Handoff
`MERGE_HANDOFF.md` at the root: the table from §0 with a "before / after" column per branch, each
PR number and its CI run, the deploy commit the owner confirmed after each merge, every Dependabot
PR with its outcome and reason, and what remains open and why.

## 7. Constraints, unchanged
STEP 34 §6: `env -u RAILS_MASTER_KEY bin/rails test`; never commit `config/master.key`,
`config/credentials/*.key`, local tool folders, `.kamal/secrets` with literal values, `node_modules`, or any
`.env`; no `git add -A`; never print a key, a token or a password; every `kamal app exec` with
`-r job`; one branch per track; worktrees as now.
