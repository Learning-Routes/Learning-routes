# PROMPT 34 — finish what is floating: the map, the videos, the panel

**Mandate from the owner (13 October):** *"Let's land the ideas we have — the route view and the
videos with Manim and ElevenLabs — neither is finished. Finish everything that was left floating,
improve it, and do not stop until you have seen it all working. Test it."*

This prompt is the standing order for the next days. It does not replace PROMPTS 30–33; it
sequences them, removes the pauses that were waiting on the owner, and sets the bar for "done".
Read it, then read the prompt of the track you are on.

## 0. The rule that changes: when to stop
Until now you stopped at every checkpoint. From now on you stop only for one of three reasons:
1. **A login, key or secret only the owner has** (§1 lists them; ask once, with the exact
   command, and move to another track while you wait).
2. **A merge to `main`**: a branch is merged only after the reviewer's verification (§5) —
   open the PR, post the evidence, continue on the next track.
3. **A product decision** the briefs leave open. Name the options and your recommendation,
   take the recommended one provisionally, and keep going; the owner can reverse it.

Everything else — a failing test, a render that does not match the prototype, a browser
pass that shows a defect, a missing locale string, a flaky job — you fix, with the test that
catches its class, and go on. "Done" is never a claim; it is the evidence in §4.

## 1. The owner's part — what only he can do (one sitting, ~30 minutes)
Hand him this list verbatim when you start; nothing below it can finish without it.

1. **Merge PR #46** (`ci-green`, `d4ed2d35`) so `main` is green and deploys; then PR #47
   (`landing-signed-in`) once it is rebased on the new `main`.
2. **Docker Hub**: make `gilberga/learning_routes` private; create a new access token;
   put it in `.env.deploy` (`KAMAL_REGISTRY_PASSWORD`) **and** in the GitHub secret
   `KAMAL_REGISTRY_PASSWORD`; revoke the old token. Before the next deploy.
3. **One credentials session** — `EDITOR=nano bin/rails credentials:edit --environment production`
   (the key `config/credentials/production.key` is on his machine; it never goes anywhere
   else): a new OpenAI key (the old one's prefix is quoted in the public `FINDINGS_WP9.md`),
   a new ElevenLabs key (the old one is burned since February), the Resend key, and
   `studio: { api_token: <64 hex from SecureRandom.hex(32)> }`. Then the same ElevenLabs key
   and studio token in the **development** credentials. Commit `production.yml.enc` (and the
   development `.enc`), push, let it deploy. Revoke the old OpenAI and ElevenLabs keys.
4. **Postgres password**: you write the runbook (`docs/runbooks/rotate-postgres-password.md`:
   `ALTER USER` on the accessory, `.env.deploy`, the GitHub secret
   `LEARNING_ROUTES_DATABASE_PASSWORD`, `kamal env push` / redeploy, the order that avoids an
   outage); he executes it.
5. `english-ai-videos/.env`: `LR_BASE_URL=https://learningroutes.com` and `LR_STUDIO_TOKEN=`
   the same token as step 3.
6. `rm .env.deploy.bak`. Stop the local server on port 9999 (it was yours).
7. After the deploy: the WP-40 census (`-r job`), and `owner:promote` if it prints `owner=0`.

## 2. Track A — the map (WP-37b, PROMPT 30)
Checkpoint 1 is verified and approved (9 October). Run checkpoints 2 and 3 **back to back**:
build the page, the system tests and the renders; have a fresh reviewer read the whole branch
(merge-base `b907fea9`) and fix what it finds; then do your **own browser pass** on the dev
server with a real route — light and dark, 1440 and 390 (CDP device emulation), reduced motion
on and off, keyboard only — and compare each render with `tmp/wp37b/mapa-*.png` side by side.
Anything that does not look like the prototype is a defect, not a difference. Open the PR with
the renders attached and the comparison; stop there for the reviewer (§5). The owner's
acceptance is the production screenshot, after the deploy.

## 3. Track B — the videos
Two things were left floating. Both become real only with the keys from §1.3 and §1.5.

**B1 — WP-36, narrated scenes (PROMPT 27).** Tasks 1–16 are done; 17–19 waited for a real
ElevenLabs key. With the key in development credentials: run the narration round-trip for
real (one scene, one paid call, timestamps stored under lock, cue sync measured in the
browser), finish 17–19 with their red-first tests, the system test that measures sync drift
(≤ 120 ms), and the handoff. Then the fresh reviewer, the PR, and after the deploy the owner
**hears** it in production on one step of his route.

**B2 — Manim lessons published from the studio (english-ai-videos + WP-38).** The pipeline
exists (`experiments/manim_voiceover_poc`: render → `gen_audio.py` with ElevenLabs → `publish.py`
to `POST /admin/api/steps/:id/video`) and has never run end to end against production because
the studio token did not exist. With the token: render **one real lesson** for one real step of
the owner's route (he names the step), with voice and `.srt`, and publish it. Then prove, in
production, with screenshots and log lines: the player appears in that step; subtitles show;
the video streams with Range (206); an anonymous request to the media URL is refused; the audit
row exists; re-publishing replaces it; deleting removes it. Fix whatever breaks on either side,
each fix with its test (Python tests in that repo, Rails tests here). Write
`docs/studio-publish.md`: the ten commands from a cold start to a published lesson. Then
**triage the floating files** in `english-ai-videos` (`ANIMATION_UPGRADE_PROMPTS.md`,
`EDUCATIONAL_REDESIGN_PLAN.md`, the `FIX_*_PROMPT.md` set, `_to_delete/`): for each, done /
not done / obsolete, with evidence, in `english-ai-videos/STATUS.md`, and propose the order of
what remains. Do not start any of them without the owner's word.

## 4. Track C — the owner's panel (WP-40, PROMPT 31)
After the census: settle §3, build the queries and the dashboard, merge that as the first
slice; then the index and the timeline; then the digest. Three PRs, three deploys, each one
visible to the owner at `/admin` before the next starts.

## 5. What "it works" means — the evidence you post, every time
- All three suites green, run from a clean tree, numbers quoted.
- The system tests of the track, named, with the measured values (contrast, drift, ellipsis,
  line-vs-label samples) — not "passed".
- Screenshots or renders in `tmp/<track>/renders/`, and for anything in production, the
  screenshot the owner can reproduce by clicking.
- Log lines or SQL counts for anything that happened on the server (a publish, an audit row,
  a 206, a 401).
- The fresh reviewer's findings and what you did with each.
The reviewer (Claude in the owner's Cowork session) verifies each PR against the branch with
his own tooling before the merge, as he did for WP-37b's checkpoint 1. Post the PR, state the
merge-base and the commit range, and go on to the next track.

## 6. Constraints, unchanged
`env -u RAILS_MASTER_KEY bin/rails test`; never commit `config/master.key`,
`config/credentials/*.key`, `.claude/`, `.kamal/secrets` with literal values, `node_modules`, or
any `.env`; no `git add -A`; never print a key, a token or a password — not in a log, a test
fixture, a screenshot or a report; every `kamal app exec` with `-r job`; a production-only task
ships before it is asked for. One branch per track; worktrees as now.
