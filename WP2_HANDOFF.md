# WP-2 handoff — deploy hygiene + wizard fixes

**Branch:** `wp2-ship-ready` · **Base:** `d18b31a` · **Commits:** `aaca38c` (§A), `a85c3ba` (§B/§C)
**Nothing was deployed.** No `kamal` command touched `178.156.240.166` or the registry.

Reference: `AUDIT.md` §2, §3, §5 P2-1, §6 P3-3/P3-6/P3-7, §10.
Deferred work: `FINDINGS_WP2.md`.

---

## 1. Changes

### §A — Deploy hygiene (commit `aaca38c`)

| # | File:line | Change | Why |
|---|---|---|---|
| A1 | `.dockerignore:10-17` | Exclude `config/master.key` and `config/credentials/*.key` | `Dockerfile:61` is `COPY . .` and the registry is **public**; the next build would have published the production decryption key. Proof in §2. |
| A2 | `config/puma.rb:49-53` | `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"] == "true"` | ENV values are strings; `"false"` is truthy in Ruby, so a Solid Queue supervisor was running inside the 512 MB web container as well as the `job` container. |
| A3 | `config/deploy.yml:58-77` | Top-level `volumes: ["learning_routes_storage:/rails/storage"]` | `web` and `job` exchange TTS output and voice uploads through `Rails.root/storage`; without a shared volume each saw only its own empty directory. |
| A4 | `.kamal/secrets` (rewritten) | ENV-first with local-file fallback; key path corrected | See the correction note below — this was more broken than the audit recorded. |
| A4 | `.github/workflows/deploy.yml:22-29` | Export `POSTGRES_PASSWORD`, not `LEARNING_ROUTES_DATABASE_PASSWORD` | `database.yml:59` reads `POSTGRES_PASSWORD`; the old name is read nowhere, so the Postgres password was empty on every Actions deploy. |
| A5 | `bin/docker-entrypoint:8-16` | Drop `\|\| echo "WARNING…"` after `db:prepare` | `\|\|` suppresses `set -e`, so a failed migration still booted and passed `/up`. **Requires a human check before deploy — see §5.** |

> **A4 correction — worse than AUDIT.md said.** The audit reported that `.kamal/secrets`
> resolves `RAILS_MASTER_KEY` from a gitignored `config/master.key`. In fact **`config/master.key`
> does not exist in this repo at all.** This app uses per-environment credentials: in production
> Rails reads `config/credentials/production.yml.enc` with the key at
> `config/credentials/production.key` (confirmed via
> `Rails.application.config.credentials.key_path`). So `RAILS_MASTER_KEY` was resolving to an
> **empty string on every deploy path, local included** — not just from CI. The env var name is
> still `RAILS_MASTER_KEY` for per-env credentials (`railties-8.1.3/lib/rails/application.rb:516`),
> so shipping `production.key`'s contents under that name is correct.

### §B — Wizard (commit `a85c3ba`)

| # | File:line | Change | Why |
|---|---|---|---|
| B1 | `config/environments/production.rb:90-101` | `action_on_strict_loading_violation = :log` | 101 of 102 associations have no opt-out; any lazy traversal was a 500. |
| B1 | `config/initializers/strict_loading_notification.rb` (new) | Re-emit violations at WARN | **Not in the brief, but B1 does not work without it** — see §4. |
| B1 | `config/environments/development.rb:109-124` | Guard ON, mode `:n_plus_one_only` | Was `false`: active only where it could hurt, disabled where it could warn. |
| B1 | `config/environments/test.rb:55-73` | Guard ON, mode **`:all`** | Per your decision. `:n_plus_one_only` does **not** raise for a `has_one` on a single record — verified — so only `:all` gates this bug class. |
| B1 | `app/controllers/route_wizard_controller.rb:24-30` | `LearningProfile.find_by(user_id:)` | Same pattern as `curriculum_brain.rb:35-38`. **Line 8 untouched**, as instructed. |
| B2 | `route_wizard_controller.rb:65-73` | `helpers.content_tag`, and return 422 | `tag` is a view helper; `self` is the controller → `NoMethodError` on every validation failure. |
| B3 | `route_wizard_controller.rb:3-9` | `t("flash.too_many_requests")` | **Chose the existing key over adding one**: it exists and is already translated in both locales with an equivalent message ("Too many requests. Please try again later." / "Demasiadas solicitudes…"). Adding a near-duplicate `rate_limited` would create two strings meaning the same thing that can drift apart. |
| B4 | `app/models/route_request.rb:27-44` | `STALE_AFTER`, `.active`, `.stale` scopes | One predicate, used by both actions, time-bounded. |
| B4 | `route_wizard_controller.rb:12-17, 34-36` | Both actions use `.active` | They disagreed; `#new` checked only `generating?`. |
| B4 | `app/jobs/reap_stale_route_requests_job.rb` (new) + `config/recurring.yml` | Reaper every 10 min | **Marks `failed`, does not delete** — see §4. |
| B5 | `app/views/route_wizard/new.html.erb:1-6` | Block returns `"1"` | `capture` returns `nil` for non-String block values (`actionview capture_helper.rb:58-66`), so nothing was stored. |
| — | `engines/content_engine/.../media_prefetch_job.rb:12-21` | Eager-load route/profile/user | **Out of the stated scope** — see §5. |

### §C — Tests

All five regression tests were verified to **fail against the old code**; a test that passes
both ways proves nothing.

| Test | Verified failure when reverted |
|---|---|
| `create with invalid params renders the error banner as turbo_stream` | `NameError: undefined local variable or method 'tag'` |
| `new renders for a user who already has a learning profile` | `ActiveRecord::StrictLoadingViolationError` |
| `new hides the app navbar` | `Failure: expected no match for "app-mobile-menu"` |
| `new shows the generating state for a recent in-flight request` | `Expected /generating-state/ to match` (rendered a fresh form) |
| `new offers a fresh form once an abandoned request has gone stale` + `create is not blocked by a stale abandoned request` | predicate symmetry, both directions |

Plus `test/jobs/reap_stale_route_requests_job_test.rb` (5 tests: stale pending, stale
generating, in-flight untouched, terminal statuses untouched, user unblocked).

`test/jobs/wizard_route_generation_job_test.rb` — `rr.reload` → `reload_for_assertions(rr)`,
a helper that opts that one record out of strict loading. These tests traverse the
association the job *assigned*, which is behaviour verification, not an N+1; scoping the
exemption to the assertion keeps the suite-wide guard meaningful.

---

## 2. A1 verification output

```
$ docker build -t lr-verify .
$ docker run --rm --entrypoint sh lr-verify -c 'ls -la /rails/config/credentials/ /rails/config/master.key 2>&1'
ls: cannot access '/rails/config/master.key': No such file or directory
/rails/config/credentials/:
total 12
drwxr-xr-x 2 rails rails 4096 Aug  3 20:26 .
drwxr-xr-x 6 rails rails 4096 Aug  3 20:26 ..
-rw-r--r-- 1 rails rails 1452 Aug  3 20:26 production.yml.enc

$ docker run --rm --entrypoint sh lr-verify -c 'find /rails -name "*.key"'
(no output — no key files anywhere in the image)
```

**Negative control** — the same build with the two `.dockerignore` lines removed, to prove
the fix is what does the work and not some incidental path change:

```
$ docker run --rm --entrypoint sh lr-negative-control -c 'find /rails -name "*.key"; ls /rails/config/credentials/'
/rails/config/credentials/production.key      <-- the key WOULD have shipped
production.key
production.yml.enc
```

Encrypted `*.yml.enc` payloads still ship, which is correct and safe — they are inert
without the key.

`config/credentials/` remains untracked and ignored:
```
$ git check-ignore -v config/credentials/production.key
.gitignore:70:/config/credentials/*.key   config/credentials/production.key
$ git ls-files | grep '\.key$'
(no output)
```

---

## 3. Test counts

| Path | Before | After |
|---|---|---|
| `bin/rails db:test:prepare test` (what CI runs) | 90 runs, 240 assertions, **0F 0E** | **101 runs, 266 assertions, 0F 0E** |
| `bin/rails test test engines/*/test` (everything) | 378 runs, 1070 assertions, **0F 0E** | **389 runs, 1076 assertions, 5F 9E** |

`bin/rubocop` on `app/ config/ test/`: 61 files, no offenses.

> **Read the second row before merging.** CI is green and this PR does not break it. But the
> full suite is now red: enabling the guard in `test.rb` surfaced 14 pre-existing lazy
> traversals in engine code. They are **not** new production breakage — production now runs
> `:log`, which is strictly safer than the `:raise` that was live before. They are catalogued
> in `FINDINGS_WP2.md` §1 and **must be fixed in WP-4, before CI is widened to run the engine
> suite**, or CI will go red and block the auto-deploy. Eight of the nine errors are one
> repeated ownership check in the audio controllers.

---

## 4. Judgement calls you should sanity-check

1. **An initializer not in the brief.** `:log` alone would have been a no-op in production.
   ActiveRecord's built-in subscriber logs this event at **DEBUG**
   (`active_record/log_subscriber.rb:16`) and production runs at `info` (`deploy.yml:46`), so
   the violations would have been dropped before reaching the log — `:log` would have meant
   `:ignore`, trading a 500 for no signal. `config/initializers/strict_loading_notification.rb`
   re-emits at WARN, and only when the app is actually in `:log` mode.
2. **Stale requests are marked `failed`, not deleted.** `#status` already has a `failed`
   branch returning a localized message, so a browser still polling gets a real answer instead
   of a request that never resolves; and the user's answers plus the failure reason survive for
   support. Deletion loses both.
3. **B3 used the existing key** rather than adding `flash.rate_limited` — rationale in §1.
4. **One file outside the stated scope.** `media_prefetch_job.rb` had a genuine lazy traversal
   that the newly-enforced test guard turned into a hard error in `test/`, i.e. in CI's path.
   The suite has to be green for this PR to be mergeable and deployable, so I fixed it: one
   `.includes(...)`, behaviour-identical, same pattern as B1. Every other newly-surfaced
   violation was left alone and documented.
5. **Interpretation of the B4 test.** The brief asked that "a stale `pending` request must not
   render a fresh form". With a time-bounded predicate the correct behaviour is the opposite
   for genuinely stale rows — they *should* release the user. I tested both directions: a
   **recent** in-flight request must not render a fresh form, and a **stale** one must.

## 4b. What I could not test

| Item | Why |
|---|---|
| A2 `SOLID_QUEUE_IN_PUMA` | `config/puma.rb` is read by the Puma binary, not the Rails test env. Verified by inspection only: `ENV["x"] == "true"` is false for `"false"`. |
| A3 `volumes:` | Requires a real `kamal deploy` against the host. Verified against gem source instead: `Configuration#volume_args` (`kamal-2.11.0/lib/kamal/configuration.rb:219`) feeds `Commands::App` (`commands/app.rb:29`), which builds `docker run` for **every** app role; there is no role-level `volumes:` key for app roles. |
| A4 `.kamal/secrets` | Evaluating it runs real command substitution and would surface live secrets. Verified by reading Kamal's parser (`Kamal::Secrets` → Dotenv + `InlineCommandSubstitution`, so `$( )` runs through a shell and bash `${VAR:-default}` works inside it) and Rails' key resolution. **Please dry-run `kamal secrets print` locally before deploying.** |
| A5 entrypoint | Only observable in a container whose migrations fail. |
| `config/recurring.yml` | Solid Queue reads it at supervisor boot; not exercised by the suite. The job class itself has 5 tests. |
| B1 production `:log` behaviour | Production-only config. The `:raise` path is covered by the test suite. |

---

## 5. Pre-deploy checklist

Run in order. **Steps 1 and 2 are blocking.**

1. **⚠️ A5 — check migration state FIRST.** `bin/docker-entrypoint` no longer swallows a failed
   `db:prepare`. If the production DB needs migrations and they fail, the container now exits
   non-zero and Kamal refuses the rollout — which is the point, but you want to know before,
   not during:
   ```
   kamal app exec --reuse 'bin/rails runner "puts ActiveRecord::Base.connection.migration_context.needs_migration?"'
   ```
   `false` → safe. `true` → review the pending migrations before deploying.
   The three July migrations named in the original brief **do not exist**; the latest app
   migration is `20260318192334` (`AUDIT.md` §2.1).

2. **Confirm secrets resolve.** `.kamal/secrets` now prefers ENV. Locally:
   ```
   kamal secrets print          # RAILS_MASTER_KEY and POSTGRES_PASSWORD must be non-empty
   ```
   For the Actions path, the GitHub secret `RAILS_MASTER_KEY` must contain the contents of
   `config/credentials/production.key` — **not** a `master.key` value. If it currently holds an
   old master key, production credentials will fail to decrypt. The `POSTGRES_PASSWORD` env var
   is now populated from the existing `secrets.LEARNING_ROUTES_DATABASE_PASSWORD` GitHub secret;
   confirm that secret is set and correct, or rename it and update the workflow.

3. **Note the rollback tag: `b82338d`.** That is what is live now (2026-04-28). Roll back with
   `kamal app boot --version=b82338d`.

4. **Expect first-boot noise on the volume.** `learning_routes_storage` is created empty on the
   first deploy. Existing container-local `storage/` contents are **not** migrated into it — the
   old data was already being discarded on every deploy, so nothing new is lost, but previously
   generated audio will regenerate on demand (a one-off ElevenLabs cost). If you want to keep
   anything, copy it out before deploying.

5. **This deploy ships 36 commits**, including the seeds fix. Once it lands, rotate the
   `admin@learning-routes.com` credential — the currently-live image seeds it with `password123`
   and no environment guard (`AUDIT.md` §P2-2). Check whether the account exists first:
   ```
   kamal app exec --reuse 'bin/rails runner "u=Core::User.find_by(email: %q(admin@learning-routes.com)); puts u ? \"EXISTS role=#{u.role}\" : \"absent\""'
   ```

6. **After deploy — verify the wizard and the new logging.**
   ```
   kamal app logs | grep StrictLoadingViolationError   # expect NOTHING — :log no longer raises
   kamal app logs | grep '\[StrictLoading\]'           # expect entries — this is the new signal
   ```
   That inversion is the point: the 500s become WARN lines. Each one is a real lazy traversal
   worth fixing; feed them into WP-4.

7. **Confirm the shared volume took effect.**
   ```
   kamal app exec --reuse --role web 'ls -la /rails/storage'
   kamal app exec --reuse --role job 'ls -la /rails/storage'
   ```
   Both must show the same directory. Generate one lesson with audio and confirm `web` serves it.

8. **Confirm Solid Queue is no longer inside the web container.**
   ```
   kamal app exec --reuse --role web 'ps aux | grep -c "[s]olid"'   # expect 0
   ```
