# STEP 37 — close the audit of 14 October

**Mandate from the owner (14 October):** *"Audit the code, land everything properly, finish what is
started, keep moving."* **Branch:** `audit-oct14`, from `main` at `38033428` or later. **Rules:**
STEP 34 §0 (stop only for a secret, a merge, or a product decision), §5 (evidence), §6 (constraints).

## 0. What the audit found (measured on `main` at `38033428`)
| # | Finding | Where | Weight |
|---|---|---|---|
| 1 | `db:seed` in production **destroys the first learning route's steps** when any profile exists (`route.route_steps.destroy_all`), then replaces them with sample content. The demo-user block is gated to `Rails.env.local?`; this block is not. | `db/seeds/content_delivery_seed.rb:23` | high |
| 2 | `community_engine` — feed, posts, comments, likes, follows, notifications, shared routes (public `show` by token, `clone`, `destroy`) — **1,127 lines, zero tests**. | `engines/community_engine` | high |
| 3 | Google sign-in (`omniauth_callbacks_controller.rb`: creates accounts, links to existing ones, rotates passwords on an unverified local account) and sign-up (`registrations_controller.rb`) have **no test**. | `engines/core/app/controllers/core/` | high |
| 4 | Seven `rescue` clauses swallow the error without a log line: `tracked_text_call.rb:34`, `section_audio_generation_job.rb:67`, `lessons_controller.rb:142`, `lesson_section_parser.rb:593`, `tools/web_search.rb:87`, `voice_evaluator.rb:96`, `image_generation_service.rb:179`. | see left | medium |
| 5 | Three jobs without a test: `daily_streak_check_job`, `core/session_cleanup_job`, `learning_routes_engine/background_content_generation_job`. | jobs | medium |
| 6 | Seven SVG icons rendered through `html_safe` in `route_wizard/_wizard_card.html.erb` and `landing/_how_it_works.html.erb`. They come from constants today (no injection), so this is hygiene. | views | low |
| 7 | The automatic deploy workflow runs after every green CI and **fails at "Set up SSH agent"**: `secrets.SSH_PRIVATE_KEY` is empty; it also expects `KAMAL_REGISTRY_USERNAME`, `KAMAL_REGISTRY_PASSWORD`, `RAILS_MASTER_KEY`, `LEARNING_ROUTES_DATABASE_PASSWORD`. Five red runs since 13 October. | `.github/workflows/deploy.yml:49` | medium |
| 8 | `solid_cable 3 → 4` (major) merged with no suite exercising it (test uses `adapter: test`); the tutor chat and every Turbo Stream depend on it. | `Gemfile.lock`, `config/cable.yml` | medium |

What the audit confirmed is fine (no work): no SQL built from data (one advisory lock with a constant),
no `permit!`, no open redirect, AI markdown through the sanitizer, payment webhooks verify signature
and replay, CSP without `unsafe-eval`, zero TODO/FIXME, engine tests run in CI, node 24 in CI so the
TypeScript-stripping tests run there.

## 1. The seed (finding 1) — first, it is one line and a test
Wrap `seed_content_delivery` so it runs only when `Rails.env.local?` **and** the found route belongs
to a demo account (`student@learning-routes.com`); otherwise print "skipped: production data" and
return. Red first: a test that creates a real user with a route, runs `Rails.application.load_seed`
in the test environment with `Rails.env` stubbed to production semantics (or calls the method with a
stubbed env), and asserts the route's step count is unchanged.

## 2. The seven silent rescues (finding 4)
For each: decide between "log with context and continue" and "re-raise". The rule: a rescue may
continue only if the caller can do something sensible without the result, and then it logs one
line with the class, the message, and the identifying id (step id, section index, interaction id).
A class-preventing test: a sweep over `app/` and `engines/*/app` that fails on any `rescue` whose
body does not call `Rails.logger`, `raise`, `report`, or `Sentry`/`ErrorReporter` — seen red with
the seven, then green. Keep the sweep.

## 3. Community engine tests (finding 2)
Integration tests per route, in `engines/community_engine/test/`:
- feed (index, following, trending): signed-out → redirect; signed-in → 200 and only visible posts.
- posts create/destroy: an owner deletes their own; another user gets 404/403; a destroyed post's
  comments and likes go with it (or not — read the model and assert what it does).
- comments create/update/destroy: same ownership rules; `simple_format` output escapes `<script>`.
- likes toggle: idempotent; count correct.
- follows create/destroy: cannot follow self; duplicate is a no-op.
- notifications index / mark_read / mark_all_read / unread_count: only your own.
- shared routes: `create` only for your own route; public `show` by token renders without a session
  and escapes the description; `clone` requires a session and copies the route into the cloner's
  profile without touching the original; `destroy` only by the sharer; an unknown token is 404.
Each test red first where the behaviour is wrong, or green with a commit message saying it
documents existing behaviour. Any authorization hole found is fixed in the same PR with its test.

## 4. Google sign-in and sign-up (finding 3)
With `OmniAuth.config.test_mode` and a mock auth hash: (a) a new Google user is created, verified,
with a random password, and signed in; (b) an existing verified account with the same email is
linked (`provider`, `uid` set) and its password is **not** changed; (c) an existing **unverified**
local account with the same email gets its password rotated and is linked (the controller's own
comment describes the attack it prevents — the test proves it); (d) a failure path logs
`[OAUTH FAILURE]` without the email. Sign-up: creates an unverified account, sends the verification
mail through `ActionMailer::Base.deliveries`, duplicate email is refused, password rules apply.

## 5. The three jobs (finding 5)
One test each with the case that matters: the streak job marks only users whose last activity is
older than the window and never resets a streak twice in a day; the session cleanup deletes
sessions idle for 30 days and keeps a 29-day one; the background content generation job enqueues
exactly the expected child jobs for a route and is idempotent on a second run.

## 6. Icons (finding 6)
A helper `svg_icon(name)` reading from a frozen hash of SVG strings and returning `.html_safe`
only there; the two views call it. Test: a sweep that fails on `html_safe`/`raw(`/`<%==` in any
view or helper except `markdown_renderer.rb` and `svg_icon` — red with the seven, then green.

## 7. Cable (finding 8)
A system test that proves a Turbo Stream arrives over Action Cable with the real adapter in test
(solid_cable against the test database, not `adapter: test`): the tutor's reply reaches the page
without a reload. If the test adapter must stay for the rest of the suite, this one test boots
its own cable config. The owner's live check after the deploy is still required.

## A. The automatic deploy (finding 7) — only if the owner says yes
If the owner decides to keep deploying by hand, change the workflow to `workflow_dispatch` only,
so a merge no longer produces a red run, and stop here. If he says yes:
1. Owner, on his Mac: `ssh-keygen -t ed25519 -f ~/.ssh/learning_routes_deploy -N "" -C "github-actions-deploy"`;
   then `ssh root@178.156.240.166 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < ~/.ssh/learning_routes_deploy.pub`;
   then in GitHub → Settings → Secrets and variables → Actions: `SSH_PRIVATE_KEY` = the private key
   file's content, `KAMAL_REGISTRY_USERNAME`, `KAMAL_REGISTRY_PASSWORD` (the **new** Docker Hub
   token), `RAILS_MASTER_KEY` (production key), `LEARNING_ROUTES_DATABASE_PASSWORD`. Never paste
   any of these in chat.
2. You: the runner's checkout is a **detached HEAD**, so `.kamal/hooks/pre-build` refuses it
   ("on '', not main"). Make the hook accept a detached HEAD whose commit **is** `origin/main`'s
   commit (compare commits, not branch names; keep refusing any other branch or any dirty tree),
   with the test case added to `test/deploy/pre_build_hook_test.rb`, red first. Also add
   `KAMAL_REGISTRY_USERNAME`/`PASSWORD` login on the runner if `kamal deploy` needs it there.
3. Prove it: one real automatic deploy after a merge, green, and `bin/kamal app details` from the
   owner showing the merge commit. Then the owner stops deploying by hand.

## Handoff
`docs/handoffs/STEP37_HANDOFF.md`: each finding with before/after, the test names, suite numbers
from a clean tree, and what remains. PRs: §1+§2+§6 together (small, safe); §3 alone; §4+§5
together; §7 alone; §A alone. Each stops for the reviewer.
