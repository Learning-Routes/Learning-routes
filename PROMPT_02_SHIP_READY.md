# PROMPT 02 — Ship-ready: deploy hygiene + wizard fixes

> Run from `~/Documents/Learning-routes` (HEAD `d18b31a`). `AUDIT.md` at the repo root is the
> reference for every claim below — read it before touching anything.

---

## Goal

Produce **one reviewable, deployable PR** that (a) makes it safe to run `kamal deploy` at all, and
(b) fixes the five defects that make `/routes/create` unusable. Nothing else.

After this lands, a human runs the deploy — you do not.

## Hard constraints

1. **Do not deploy.** No `kamal deploy`, `kamal app`, `docker push`, or anything that touches
   `178.156.240.166` or the registry. Building an image locally to inspect it is allowed and
   expected; pushing it is not.
2. **Do not commit `config/credentials/`.** `production.key` is in there. `.gitignore` already
   covers `/config/credentials/*.key` — verify it still does before you finish.
3. **Scope discipline.** Only the items listed in §A and §B. If you find something else, add it to
   a `FINDINGS_WP2.md` file; do not fix it here. A PR that also refactors is a PR nobody can review.
4. **Every change gets a test** unless the change is a config value that no test can observe. Say
   explicitly which changes you could not test and why.
5. Work in phases: **read → research → change → verify**. Do not start editing in phase 1.

---

## PHASE 1 — Read

Read `AUDIT.md` §2 (what is deployed), §3 (all six P0 entries), §5 P2-1, §6 P3-3/P3-6/P3-7, and §10.
Then read, at minimum:

- `app/controllers/route_wizard_controller.rb` in full
- `config/application.rb`, `config/environments/{production,development,test}.rb`
- `app/models/route_request.rb`, `engines/learning_routes_engine/app/models/learning_routes_engine/learning_profile.rb`
- `engines/ai_orchestrator/app/services/ai_orchestrator/curriculum_brain.rb:30-45` — this is the
  reference implementation for the P0-1 fix
- `app/views/route_wizard/new.html.erb`, `app/views/layouts/application.html.erb`
- `config/recurring.yml`, `config/queue.yml`, `config/puma.rb`, `config/deploy.yml`
- `.dockerignore`, `Dockerfile`, `bin/docker-entrypoint`, `.kamal/secrets`
- `test/controllers/route_wizard_controller_test.rb`
- `config/locales/en.yml` and `es.yml` — the `flash:` scope specifically

Confirm each defect still exists at HEAD before you fix it. The previous round wasted three fix
sessions on code that did not exist; do not repeat that. If a defect is already fixed, say so and
skip it.

## PHASE 2 — Research

Search the web for current (August 2026) guidance on exactly these four, and cite what you use:

1. **Kamal 2 `volumes:`** — top-level vs role-level, named volume vs bind mount, and what happens
   to an existing container's data on `kamal deploy`. Verify against the installed gem source
   (`kamal-2.11.0/lib/kamal/configuration.rb` around line 220), not just blog posts.
2. **Kamal 2 secrets from CI** — the current recommended pattern for `.kamal/secrets` when `.env`
   and `config/master.key` are absent from the checkout (GitHub Actions).
3. **Rails 8.1 `action_on_strict_loading_violation`** — confirm the default is `:raise` in 8.1.3 and
   what `:log` actually emits, so we know what to grep for after deploy.
4. **`content_for` with a block returning a non-String** — confirm the `capture` behaviour so the
   P0-5 fix is principled rather than cargo-culted.

---

## PHASE 3 — Changes

### §A · Deploy hygiene (WP-1)

**A1 — P2-1, the deploy blocker.** Add `config/master.key` and `config/credentials/*.key` to
`.dockerignore`. `Dockerfile:61` is `COPY . .` and `gilberga/learning_routes` is a **public**
registry with 1541 pulls. The key is not needed at build time — `Dockerfile:67` already uses
`SECRET_KEY_BASE_DUMMY=1`.

Then **prove it**: build the image locally and show the output of

```bash
docker build -t lr-verify .
docker run --rm --entrypoint sh lr-verify -c 'ls -la /rails/config/credentials/ /rails/config/master.key 2>&1'
```

Paste that output into the PR description. This verification is the deliverable, not the
`.dockerignore` line.

**A2 — P3-6.** `config/puma.rb:49` — `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"]`.
`deploy.yml:56` sets the string `"false"`, which is truthy in Ruby, so a Solid Queue supervisor
runs inside the 512 MB web container in addition to the dedicated `job` container. Change to an
explicit `== "true"` comparison.

**A3 — P3-3.** `config/deploy.yml` has no `volumes:` key, so `web` and `job` cannot see each
other's files: all TTS output is written by `job` (`audio_generator.rb:147`,
`section_audio_generator.rb:61,211`) and read by `web` (`audio_storage.rb:6-7`), and voice uploads
go the other way (`voice_evaluator.rb:36`). `storage/` is also wiped on every deploy. Add a
top-level named volume mapped to `/rails/storage`. Explain in the PR what happens to existing
container data on the next deploy.

**A4 — P3-7.** `.kamal/secrets:9` reads `RAILS_MASTER_KEY=$(cat config/master.key 2>/dev/null)`
and lines 5, 6, 16 grep `.env`. Both are gitignored, so a deploy from GitHub Actions silently ships
an **empty** master key and empty registry/Postgres passwords. Convert to ENV passthrough with a
local-file fallback so both paths work. Also: `.github/workflows/deploy.yml:23` exports
`LEARNING_ROUTES_DATABASE_PASSWORD`, which nothing in the repo reads — reconcile the name.

**A5 — P0-6.** `bin/docker-entrypoint:11` — `./bin/rails db:prepare || echo "WARNING…"`. The `||`
suppresses `set -e`, so the container serves traffic on a half-migrated schema and passes `/up`.
Remove the fallback so the container exits non-zero and Kamal refuses the rollout.

⚠️ **Flag this one prominently in the PR description as requiring a human decision before deploy:**
if the production DB currently needs migrations, this converts a silent boot into a failed deploy.
The operator must run `kamal app exec --reuse 'bin/rails runner "puts
ActiveRecord::Base.connection.migration_context.needs_migration?"'` first. Do not run it yourself.

### §B · Unbreak the wizard (WP-2)

**B1 — P0-1, in two parts.**

*Config.* The chosen policy is:

```ruby
# config/environments/production.rb
config.active_record.action_on_strict_loading_violation = :log

# config/environments/development.rb and test.rb — currently `false`, flip to true
config.active_record.strict_loading_by_default = true
config.active_record.strict_loading_mode = :n_plus_one_only
config.active_record.action_on_strict_loading_violation = :raise
```

Rationale, so you implement it in the right spirit: 101 of 102 associations would raise the same
way in production, and dev/test currently disable the guard — so this class of failure is
structurally invisible until a user hits it. `:log` stops production from 500ing while keeping the
signal in logs and Sentry; turning it **on** in dev/test is what catches the next one before it
ships. Expect a noisy first test run — report what surfaces, fix only what breaks the wizard path,
and list the rest in `FINDINGS_WP2.md` for a later package.

*Call site.* `app/controllers/route_wizard_controller.rb:18` — replace
`current_user.learning_profile` with `LearningRoutesEngine::LearningProfile.find_by(user_id:
current_user.id)`. This is exactly the pattern `curriculum_brain.rb:35-38` already uses, with a
comment explaining why.

**Do not touch line 8.** `current_user.route_requests.pending_or_generating.first` does **not**
raise — a scope chain on a `has_many` issues its own query rather than loading the association.
The audit verified this (`AUDIT.md` §P0-1). Changing it is wasted work.

**B2 — P0-2.** `route_wizard_controller.rb:61` calls bare `tag.div(...)` inside a
`turbo_stream.replace` block where `self` is the controller → `NoMethodError` on **every**
validation failure. Use `helpers.content_tag`, matching
`engines/content_engine/app/controllers/content_engine/notes_controller.rb:20`.

**B3 — P0-3.** `route_wizard_controller.rb:4` uses `t("flash.rate_limited")`, which exists in
neither locale's `flash:` scope (the `rate_limited` keys at `:235` and `:1101` are different
scopes). Either use `flash.too_many_requests`, which exists, or add the key to `en.yml` **and**
`es.yml`. Pick one and say why.

**B4 — P0-4.** `#new:9` treats only `generating?` as in-progress while `#create:23` blocks on
`pending_or_generating`, so a stuck `pending` row shows the user a fresh form that always bounces
to a spinner. Make the two predicates identical, bound them by a time window, and add a recurring
reaper to `config/recurring.yml` (the file already has four jobs to pattern-match). Decide and
justify: does a stale request become `failed`, or is it deleted?

**B5 — P0-5.** `app/views/route_wizard/new.html.erb:2` — `content_for(:hide_navbar) { true }`
stores nothing because `capture` returns `nil` for a non-String block value, so the fixed navbar
renders over the full-screen wizard. Fix per your Phase 2 research.

### §C · Tests

At minimum:

- A controller test that POSTs invalid wizard params **with `as: :turbo_stream`** and asserts 422
  with the error banner in the body. The existing test at
  `test/controllers/route_wizard_controller_test.rb` misses B2 precisely because it omits that
  header and falls into the HTML branch.
- A test that `GET /routes/create` returns 200 for a user **who already has a `LearningProfile`** —
  the current tests pass because the test user has none.
- A test for the B4 predicate symmetry: a stale `pending` request must not render a fresh form.

Run the **full** suite, both paths, and report both numbers:

```bash
bin/rails db:test:prepare test            # the 90 CI currently runs
bin/rails test test engines/*/test        # all 378
```

---

## PHASE 4 — Verify and hand off

Write `WP2_HANDOFF.md` containing:

1. Every change, grouped A/B/C, with file:line and one line of rationale.
2. The `docker run … ls config/credentials` output from A1.
3. Both test counts, before and after.
4. What you could not test, and why.
5. Anything you deliberately did not fix, with a pointer to `FINDINGS_WP2.md`.
6. **A pre-deploy checklist for the human**, including the `needs_migration?` check from A5, the
   rollback tag (`b82338d`), and what to grep for after deploy
   (`kamal app logs | grep StrictLoadingViolationError` should now show entries rather than 500s).

Then stop. Do not deploy.

---

## Reporting back

Print only: the list of changes (one line each), both test counts, the A1 verification output, and
anything that surprised you — especially any defect from §A/§B that turned out to be already fixed
at HEAD. I will read the handoff file myself.
