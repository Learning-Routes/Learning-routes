# Learning Routes — Full Codebase Audit

**Date:** 2026-08-03 · **Repo:** `/Users/go/Documents/Learning-routes` · **HEAD:** `d18b31a` (2026-07-27)
**Method:** read-only. No application file was modified. Claims carry `file:line` or command output.

> **Note on the audit brief.** PROMPT 01 describes a repo at commit `09bd58c` (2026-04-29) with ~77
> uncommitted files, three uncommitted July migrations, and untracked `rack_attack.rb` / `sentry.rb` /
> `strong_migrations.rb` / `solid_queue_strict_loading.rb`. **That state no longer exists.** The working
> tree is clean apart from two entries, 36 commits have landed since, and all the "uncommitted" work
> described was committed and merged to `main`. Evidence in §2. The leads L1–L30 were therefore treated
> strictly as hypotheses and re-verified against actual code; 19 confirmed, 6 refuted, 5 confirmed with a
> corrected root cause. The refutations matter as much as the confirmations — three of them would have
> sent a fix session at code that does not exist.

---

## 1. Executive summary

1. **You cannot create a route because production is running code from 2026-04-28.** The newest image on
   Docker Hub is `b82338d`, dated 2026-04-28; HEAD is 36 commits ahead. Every fix from July — security,
   tutor, FSRS, assessments, seeds — is committed to `main` and **never deployed**.
2. `GET /routes/create` 500s on `route_wizard_controller.rb:18`, `current_user.learning_profile`.
   `strict_loading_by_default = true` (`config/application.rb:48`) applies in production and
   `action_on_strict_loading_violation` is set nowhere, so Rails defaults to `:raise`. Reproduced.
3. That is not a one-line bug: **101 of 102 associations** in the app would raise the same way. Only
   `Core::User#user_engagement` is exempt. Dev and test both switch strict loading *off*, so this class
   of failure is structurally invisible before production.
4. `POST /routes/create` 500s on *any* validation error — `tag.div` at `route_wizard_controller.rb:61`
   is a view helper called with the controller as `self`. Verified `NoMethodError`.
5. **The AI writes lessons in a vocabulary the app cannot render.** `lesson_content.yml` instructs the
   model to emit `:::code_challenge`, `:::tap_pairs`, `:::speak_sentence` and 8 more. The parser handles
   none of them and the renderer knows 5 block types total, so they reach the student as literal
   `:::code_challenge` text. Proven end-to-end through the real parser and renderer.
6. **Every route is generic.** `curriculum_design` is missing from `AiModelConfig::TASK_TYPES`, so
   `AiInteraction.create!` raises `RecordInvalid`, `CurriculumBrain` swallows it and returns `nil`, and
   100% of routes fall back to the hardcoded 8-step template. Verified.
7. **Deploying is currently unsafe.** `config/credentials/production.key` exists on disk and is absent
   from `.dockerignore`; `Dockerfile:61` is `COPY . .`; `gilberga/learning_routes` is **public**. The
   live image is clean today — the *next* build publishes the production key to the world.
8. CI runs **90 of 378 tests** (24%). The 288 engine tests never execute, and CI green auto-deploys.
9. **Cost to fix:** the P0 set is roughly two focused sessions. The deploy-blocker items (§9 WP-1) are
   under an hour. The pedagogy rebuild (§9 WP-5) is the only genuinely large piece.

---

## 2. What is deployed

### 2.1 The brief's premise is void

| Claim in PROMPT 01 | Reality | Evidence |
|---|---|---|
| HEAD is `09bd58c`, 2026-04-29 | HEAD is `d18b31a`, 2026-07-27; `09bd58c` is 36 commits back | `git log -1`; `git rev-list --count b82338d..HEAD` → 36 |
| ~77 modified/untracked files | 2 entries: ` M .gitignore`, `?? config/credentials/` | `git status --short` |
| 3 uncommitted July migrations | Do not exist. Latest app migration is `20260318192334` | `ls db/migrate \| tail -1` |
| `rack_attack.rb` untracked | Committed and tracked | `git ls-files config/initializers/rack_attack.rb` |
| `sentry.rb`, `strong_migrations.rb`, `solid_queue_strict_loading.rb` untracked | Do not exist anywhere | `ls config/initializers/` |
| `db/schema.rb` at `2026_04_28_000001`, orphan table | Version is `2026_07_08_000001` (a legit engine migration). Orphan table **does** remain | `db/schema.rb:13`, `:538` |

**Bucketing the 77 files is not applicable** — there is nothing meaningful uncommitted. The only two
entries: `.gitignore` adds `/config/credentials/*.key` (correct, keep), and `config/credentials/`
is untracked and contains `production.key` + `production.yml.enc` (see P2-1 — this must **not** be
committed, and must be added to `.dockerignore`).

### 2.2 What production is actually running

I have no SSH key for `178.156.240.166` (`Permission denied (publickey,password)`), so `kamal app
version` could not be run. The registry gave a definitive answer instead. Kamal tags images by git SHA:

| Fact | Value | Evidence |
|---|---|---|
| Site is up | `/up` → 200 | `curl https://learningroutes.com/up` |
| Newest image tag | `b82338da0416…` == commit `b82338d` | Docker Hub tags API |
| `latest` pushed | **2026-04-28T18:06:32Z** | Docker Hub tags API |
| Repo visibility | **public** (`is_private: false`), 1541 pulls, 18 tags | Docker Hub repositories API |
| Commits HEAD is ahead | **36** | `git rev-list --count b82338d..HEAD` |

I pulled `gilberga/learning_routes:latest` and read it. The deployed image contains:

| Check | Deployed image | HEAD | Meaning |
|---|---|---|---|
| `route_wizard_controller.rb:18` `learning_profile` | present | present | **P0-1 is live** |
| `route_wizard_controller.rb:61` `tag.div` | present | present | **P0-2 is live** |
| `db/seeds.rb` env guard | **absent** — `password123` admin unguarded | `Rails.env.local?` guard present | **P2-2 is live** |
| `curriculum_design` in `TASK_TYPES` | absent (0 matches) | absent | **P1-1 is live** |
| `TutorReplyJob` task type | `:lesson_content` | `:tutor_reply` | tutor fix **not live** |
| `config/initializers/rack_attack.rb` | **absent** | present | rate limiting **not live** |
| `config/master.key`, `config/credentials/` | **absent** | n/a | no key leaked *yet* |
| `credentials.yml.enc` | present (encrypted — expected, harmless) | — | fine |

**Answer:** production runs neither HEAD nor a dirty tree — it runs an **older image, `b82338d` of
2026-04-28**. None of the July fixes are live: seeds hardening, gem CVE patches, gap-analysis repair,
FSRS inversion, assessment answer-oracle, tutor IDOR, tutor prompt, OAuth pre-hijacking, rack-attack,
CSP/XSS, and the concurrent-answer race are all committed to `main` and all absent from production.

Because the deployed image predates the credentials directory, **no secret is currently exposed** — but
that is timing, not design. See P2-1.

**Migration state in the production DB is unverified** — see §10.

---

## 3. P0 — Broken in production right now

### P0-1 · `GET /routes/create` 500s — strict loading raises on `learning_profile`

- **Symptom:** the wizard page fails to load; user cannot start a route.
- **Root cause:** `app/controllers/route_wizard_controller.rb:18` — `current_user.learning_profile`.
  `config/application.rb:48` sets `strict_loading_by_default = true` for all environments;
  `action_on_strict_loading_violation` is set in **no** file, and ActiveRecord 8.1.3 defaults it to
  `:raise` (`activerecord-8.1.3/lib/active_record.rb:371`).
- **Reproduced:**
  ```
  user strict_loading? => true
  route_requests: OK (no raise)
  learning_profile RAISED: ActiveRecord::StrictLoadingViolationError
  user_engagement: OK (no raise)
  ```
- **Correction to lead L1:** the hypothesis blamed *both* line 8 and line 18. Line 8
  (`current_user.route_requests.pending_or_generating.first`) does **not** raise — a `has_many` scope
  chain issues its own query rather than loading the association. Only line 18 raises. Fixing line 8
  would waste effort; fixing line 18 fixes the page. `user_engagement` survives only because
  `engines/core/app/models/core/user.rb:12` sets `strict_loading: false` explicitly.
- **Why it never reproduces locally:** `config/environments/development.rb:112` and
  `config/environments/test.rb:67` both set `strict_loading_by_default = false`. The guard is active
  *only* where it can hurt you and disabled everywhere it could warn you.
- **Blast radius:** 101 of 102 associations would raise identically (scan output §10). This is a
  systemic hazard, not a single bad line.
- **Fix sketch** (two parts — do both):
  ```ruby
  # config/environments/production.rb — stop the bleeding, keep the signal
  config.active_record.action_on_strict_loading_violation = :log
  # config/environments/development.rb + test.rb — actually catch these before prod
  config.active_record.strict_loading_by_default = true   # replaces the current `false`
  ```
  Then fix the real N+1 at the call site: `LearningRoutesEngine::LearningProfile.find_by(user_id:
  current_user.id)` — exactly the pattern `curriculum_brain.rb:38` already uses for this reason.
- **Effort:** S · **Risk:** low. `:log` in production is the documented community norm; flipping
  dev/test to `true` will surface violations that are already latent — expect a noisy first run.

### P0-2 · `POST /routes/create` 500s on every validation failure — `tag` is not a controller method

- **Symptom:** submit an invalid wizard form → 500 instead of an inline error.
- **Root cause:** `app/controllers/route_wizard_controller.rb:61` calls bare `tag.div(...)` inside a
  `turbo_stream.replace` block, where `self` is the controller.
- **Reproduced:** `controller responds_to?(:tag) => false`;
  `NoMethodError: undefined method 'tag' for an instance of RouteWizardController`.
- **Why not caught:** the branch only runs on validation failure, and no test covers it (§P3-1).
- **Fix sketch:** the repo already does this correctly elsewhere —
  ```ruby
  render turbo_stream: turbo_stream.replace("wizard-error-banner",
    helpers.content_tag(:div, error_msg, id: "wizard-error-banner", ...))
  ```
- **Effort:** S · **Risk:** none.

### P0-3 · `t("flash.rate_limited")` does not exist — 6th submit shows `Translation missing`

- **Root cause:** `route_wizard_controller.rb:4`. The `flash:` scope has `too_many_requests` but no
  `rate_limited` in either locale. The `rate_limited` at `en.yml:235`/`es.yml:235` is under a
  different scope, as is the one at `:1101`.
- **Evidence:** dumped `flash:` keys for both locales — `rate_limited` absent from both.
- **Fix sketch:** use the key that exists (`t("flash.too_many_requests")`) or add `rate_limited:` to
  the `flash:` scope in `en.yml` **and** `es.yml`.
- **Effort:** S · **Risk:** none. *(`config.i18n.fallbacks = true` at `production.rb:88` does not help —
  the key is missing in the fallback locale too.)*

### P0-4 · A stuck `pending` request locks the user out of the wizard forever

- **Root cause:** asymmetry between two methods. `#new:9` treats only `generating?` as in-progress, so a
  `pending` row renders a fresh form; `#create:23` blocks on `pending_or_generating`
  (`app/models/route_request.rb:28`) and returns the "generating" partial. The user sees a form, submits,
  and is bounced to a spinner that never resolves.
- **No reaper exists:** `config/recurring.yml` defines 4 jobs (`clear_solid_queue_finished_jobs`,
  `daily_streak_reset`, `session_cleanup`, `cost_alert_check`) — none reaps stale `RouteRequest`s.
- **Fix sketch:** make the two predicates identical, and add a recurring reaper:
  ```ruby
  # #new and #create must agree
  existing = current_user.route_requests.pending_or_generating.where(created_at: 30.minutes.ago..).first
  # config/recurring.yml
  reap_stale_route_requests: { class: ReapStaleRouteRequestsJob, queue: low, schedule: every 10 minutes }
  ```
- **Effort:** M · **Risk:** low.

### P0-5 · `content_for(:hide_navbar) { true }` is a no-op — navbar covers the full-screen wizard

- **Root cause:** `app/views/route_wizard/new.html.erb:2`. `capture` returns `nil` for a non-String
  block value, so nothing is stored and `content_for?(:hide_navbar)` at
  `app/views/layouts/application.html.erb:52` is false.
- **Reproduced:** `capture{true} => nil`; `content_for?(:hide_navbar) => false`;
  `content_for?(:other)` with a String block → `true`.
- **Fix sketch:** `<% content_for(:hide_navbar) { "1" } %>`.
- **Effort:** S · **Risk:** none.

### P0-6 · `bin/docker-entrypoint:11` boots on a half-migrated schema and passes `/up`

- **Root cause:** `./bin/rails db:prepare || echo "WARNING: db:prepare failed …"`. A non-zero exit is
  swallowed by `|| echo`, so `exec "${@}"` starts the server anyway. `#!/bin/bash -e` does not save you —
  `||` explicitly suppresses `-e`.
- **Fix sketch:** drop the `||` and let the container fail fast, so Kamal's healthcheck refuses the
  deploy rather than serving a broken schema.
- **Effort:** S · **Risk:** low, but it converts silent corruption into a loud failed deploy — which is
  the point. Pair with P3-4 (schema drift) before enabling.

---

## 4. P1 — Silently wrong

### P1-1 · 100% of routes are generic — `CurriculumBrain` cannot run

- `AiModelConfig::TASK_TYPES` (`ai_model_config.rb:17-36`) lists 18 types and **omits
  `curriculum_design`**. `ai_interaction.rb:38` validates `task_type` against that list.
  `Orchestrate.call` does `AiInteraction.create!(task_type: "curriculum_design")` at `orchestrate.rb:49`
  → `RecordInvalid` → caught by the bare `rescue` at `curriculum_brain.rb:60` → returns `nil` →
  `wizard_route_generation_job.rb:46` falls back to `generate_fallback_route`.
- **Reproduced:**
  ```
  curriculum_design    in TASK_TYPES=false valid=false "is not included in the list"
  lesson_assistant     in TASK_TYPES=false valid=false
  content_agent        in TASK_TYPES=false valid=false
  ROUTING_TABLE keys not in TASK_TYPES -> ["curriculum_design", "content_agent"]
  ```
- `ModelRouter::ROUTING_TABLE:8` *does* route `curriculum_design` — the two lists disagree. **This is the
  single biggest product defect: every route is the same 8-step template regardless of topic.**
- **Fix:** add `curriculum_design` and `content_agent` to `TASK_TYPES`; add a test asserting
  `ROUTING_TABLE.keys - TASK_TYPES == []` so the two can never drift again. Effort S, risk low.

### P1-2 · The AI is told to emit blocks the app cannot render

This is the finding that lead L14 pointed at but described wrongly, and it is worse than L14 claimed.

- `lesson_content.yml` instructs the model to emit: `drag_order` (4×), `output_prediction` (3×),
  `word_bank`, `translate_sentence`, `terminal_exercise`, `tap_pairs`, `speak_sentence`,
  `listen_and_type`, `image_label`, `code_challenge`, `bug_fix`, `flashcards`.
  `curriculum_design.yml:174-175` defines the same controlled vocabulary for `exercise_types`.
- `lesson_section_parser.rb` emits 13 types: `check, concept, example, tip, summary, drag_drop,
  fill_blank, code_playground, simulation, scenario, flashcards, visual, audio`.
- **Overlap between what the prompt orders and what the parser understands: `flashcards`, and nothing
  else.** 11 of 12 instructed exercise types have no parser branch, no partial, no controller.
- `MarkdownRenderer::INTERACTIVE_BLOCKS` (`markdown_renderer.rb:65-71`) knows 5 types; `:119`
  is `next _match unless config`, so unknown blocks pass through verbatim.
- **Proven end-to-end** against the real parser and renderer:
  ```
  parsed section types: ["concept","concept","concept","concept","summary"]
  renderer output contains literal ':::tap_pairs'?      true
  renderer output contains literal ':::code_challenge'? true
  ```
  The parser silently degrades every unknown block to a generic `concept`; the renderer leaks the raw
  `:::` marker to the student.
- **L14 refuted:** `_code_challenge.html.erb`, `_output_prediction.html.erb`, `_speak_sentence.html.erb`,
  `_bug_fix.html.erb` **do not exist** anywhere in the repo — the only mentions of those names are in the
  two prompt YAMLs. There is no inert Stimulus binding to fix. Every action bound by an existing partial
  resolves to a real method (verified for all 9 controllers, §8) — **that wiring is correct and healthy.**
- **Fix:** this is a product decision, not a patch. Either narrow the prompts to the 13 types the parser
  supports (fast, S), or build the missing 11 (large — §9 WP-5). Do the former this week regardless.

### P1-3 · JSON mode is never enabled, and structured output is available but unused

- `ai_client.rb:39` — `merged_params = model_defaults.merge(params).except(:response_format)`. 12 prompt
  templates declare `response_format: json`; all 12 are stripped. **Confirmed.**
- The pinned stack already supports the correct fix: `ruby_llm 1.11.0` defines `with_schema` at
  `lib/ruby_llm/chat.rb:95`, and `ruby_llm-schema 0.2.5` is installed. **Zero call sites use it.**
- **Fix:** replace prose-instructed JSON with `chat.with_schema(...)` per task type. No gem bump needed.

### P1-4 · The JSON extractor breaks on lesson content (but not the way L8 claimed)

- **L8 refuted:** `response_parser.rb:90` is `/(\{[\s\S]*\}|\[[\s\S]*\])/` — **greedy**, not the lazy
  `*?` the lead describes. Nested JSON parses fine. Verified: plain, fenced, and prose-prefixed nested
  quiz payloads all parse.
- **Real defects found instead**, all reproduced:

  | Input | Result | Cause |
  |---|---|---|
  | nested quiz JSON, plain / fenced / prose-before | PARSED | — |
  | JSON followed by prose containing `}` | **FAILED** | greedy match over-runs (`:90`) |
  | fenced JSON whose content contains an inner fence | **FAILED** | `:85` regex is lazy `(.+?)` |
  | raw JSON with a ` ``` ` fence inside a string value | **FAILED** | `:85` fires before `:90` |

- The third case is the damaging one: `lesson_content.yml:386` declares `response_format: json`, and
  lesson bodies routinely contain fenced code blocks. Any such lesson fails to parse.
- **Fix:** subsumed by P1-3 — `with_schema` returns a parsed Hash and removes the extractor from the
  hot path entirely. If keeping the regex, check "is the *whole* response fenced" rather than "does a
  fence appear anywhere", and brace-balance instead of greedy-matching.

### P1-5 · Spanish learners get English quizzes

- Only **3 of 17** prompt templates contain `{{language_directive}}`: `curriculum_design.yml`,
  `lesson_content.yml`, `tutor_reply.yml`.
- `prompt_builder.rb:71-77` computes the directive correctly but applies it with `result.gsub!(...)`,
  which is a no-op when the token is absent. The other 14 templates — `step_quiz`, `exam_questions`,
  `assessment_questions`, `gap_analysis`, `quick_grading`, `exercise_hint`, `explain_differently`,
  `give_example`, `simplify_content`, `reinforcement_generation`, `route_generation`, `code_generation`,
  `voice_narration`, `voice_evaluation` — receive **no locale instruction at all**.
- **Fix:** append the directive when the token is missing rather than only substituting it, and add the
  token to all 17 templates. Effort S. High user-visible value on a Spanish-first product.

### P1-6 · The largest real per-route cost is invisible to every cap

- `cost_tracker.rb:10` — `"elevenlabs" => { flat: 0 }`. `estimate_cost` returns `0` for every TTS call.
- Actual ElevenLabs pricing (Aug 2026): **$0.10 per 1,000 characters** for Multilingual v2. A route with
  ~30k characters of narration is ~$3 — invisible to `check_cost_limit!` (`model_router.rb:136-150`),
  to `CostAlertJob`, and to every dashboard.
- `RATE_LIMITS["elevenlabs"] => 20` (`model_router.rb:35`) is dead config: TTS goes through
  `AiClient#request_elevenlabs` via `audio_generator.rb:86` / `voice_evaluator.rb:80`, and
  `check_rate_limit!` is only invoked from `ModelRouter#execute`.
- **Fix:** price ElevenLabs per character and route TTS through `ModelRouter`.

### P1-7 · Model IDs and prices are stale

Per current OpenAI listings (Aug 2026) the lineup is GPT-5.5 / 5.5 Pro / 5.4 Standard / 5.4 Mini / 5.4
Nano. `gpt-5.2` and `gpt-4.1-mini` do not appear in the current catalogue.

| Where | Hardcoded | Current reality |
|---|---|---|
| `model_router.rb:4-25` | `gpt-5.2`, `gpt-4.1-mini` | superseded by GPT-5.4/5.5 tiers |
| `cost_tracker.rb:5-6` | gpt-5.2 $1.75/$14.00 per 1M | GPT-5.4 Standard $2.50/$15.00; GPT-5.5 $5.00/$30.00 |
| `cost_tracker.rb:7-9` | 3 × `claude-*` priced | **routed nowhere** — dead config (`ROUTING_TABLE` has no Claude entry) |
| `ai_client.rb:94` | `eleven_multilingual_v2` | current; Flash/Turbo is half price ($0.05/1k chars) |

Also contradicts the project's own no-hardcoding rule — these belong in credentials/config.

### P1-8 · Failed lesson generation re-bills on every refresh

- `content_pipeline_job.rb:56` writes `"content_error"` into metadata. **Nothing reads it** — grep across
  `app/`, `engines/`, `.erb`, `.js` returns that single write and no read.
- The student sees a skeleton, then a timeout message; refreshing re-enters `load_step_content` and
  re-enqueues the same failing pipeline, re-paying for the failing calls each time.
- **Fix:** read `content_error` in the view, show a localized failure state, and gate re-enqueue behind a
  backoff/attempt counter.

### P1-9 · No interactive exercise is graded server-side

- **L15 confirmed** for every lesson-block controller. `fetch(` count:
  `drag_drop` 0, `fill_blank` 0, `flashcards` 0, `scenario` 0, `simulation` 0, `lesson_check` 0,
  `code_playground` 0, `step_quiz` 0, `lesson_quiz` 0.
- Results live and die in the DOM: no XP, no mastery signal, no FSRS input, no gap-analysis fuel. The
  FSRS implementation in `spaced_repetition.rb` is therefore starved of the data it was built for.
- *(Nuance: `interactive_lesson_controller.js` and `voice_recorder_controller.js` do issue 2 fetches
  each — the claim "not one of the 17 controllers issues a fetch" is too strong. But none of the nine
  graded-exercise controllers does.)*

---

## 5. P2 — Security & data integrity

### P2-1 · **Deploy-blocker:** the next build publishes the production key to a public registry

- `gilberga/learning_routes` is **public** — `is_private: false`, 1541 pulls.
- `.dockerignore` (28 lines) excludes `.env*` but lists **neither** `config/master.key` **nor**
  `config/credentials/`. `Dockerfile:61` is `COPY . .`.
- `config/credentials/production.key` exists on disk (mode 600, created 2026-07-07) alongside
  `production.yml.enc`. Both would be copied into the image — key and ciphertext together.
- **The live image is clean:** I pulled and inspected it — no `master.key`, no `config/credentials/`,
  no `.env`. It predates the credentials directory. **Nothing is leaked today.**
- **This is why sequencing matters:** the #1 recommendation is "deploy", and deploying as-is is exactly
  what publishes the key. Fix `.dockerignore` *first*. The key is not needed at build time —
  `Dockerfile:67` already builds with `SECRET_KEY_BASE_DUMMY=1`.
- **Fix:** add `config/master.key` and `config/credentials/*.key` to `.dockerignore`; then verify with
  `docker run --rm --entrypoint sh <image> -c 'ls /rails/config/credentials/'` before pushing.

### P2-2 · Live production has a seeded admin with a guessable password

- The **deployed** `db/seeds.rb` creates `admin@learning-routes.com` / `password123` with `role: :admin`
  and **no environment guard** (confirmed inside the pulled image).
- `bin/docker-entrypoint:11` runs `db:prepare` on every server boot, which seeds on database creation.
- HEAD fixes this (`db/seeds.rb` now gates everything behind `Rails.env.local?`) — but HEAD is not
  deployed.
- **Whether the account exists in the production DB is unverified** (§10) — but assume it does until
  checked, and rotate regardless.

### P2-3 · Password reset does not revoke remember-me

- `passwords_controller.rb:40` calls `@user.sessions.destroy_all` but never `user.forget!`. A stolen
  `remember_token` cookie survives the reset and mints a fresh session via
  `recover_session_from_remember_token` (`core/application_controller.rb:110-140`).
- `user.rb:157-158` — `generates_token_for :email_verification` / `:password_reset` have **no
  invalidation block**, so a reset token is replayable for its full 1-hour window even after use.
- **Fix:** call `forget!` alongside `sessions.destroy_all`; add `generates_token_for :password_reset,
  expires_in: 1.hour { password_salt&.last(10) }` so the token dies with the password.

### P2-4 · `/cable` accepts unauthenticated connections

- **L27 confirmed:** `app/channels/` does not exist — no `ApplicationCable::Connection`, so no
  `identified_by` and no rejection. The only access control on private streams is the signed stream
  name, which is long-lived and unrevocable.
- **Fix:** add `ApplicationCable::Connection` with `identified_by :current_user` resolving the user from
  the encrypted session cookie (`cookies.encrypted[Rails.application.config.session_options[:key]]` →
  `Core::Session` → user), and `reject_unauthorized_connection` otherwise.

### P2-5 · Unsanitized LLM/user output in tutor chat

- `_message.html.erb:8` — `message.content.html_safe`. Renders both raw student input and unfiltered,
  prompt-injectable model output. The only unsanitized sink in the app; currently self-XSS and
  CSP-mitigated, but one CSP regression from real XSS. **Note the CSP itself is not deployed** (the
  July CSP commits are among the 36 undeployed), so the mitigation is weaker than it looks.
- **Fix:** `sanitize(message.content, tags: %w[p br strong em code pre ul ol li a])`.

### P2-6 · XP can be farmed by replay

- `XpService.award` (`app/services/xp_service.rb:18`) creates an `XpTransaction` unconditionally — no
  uniqueness guard on `(user, source_type, source_id)`. The `engagement.lock!` protects the counter
  arithmetic from races but does nothing about replay.
- `db/schema.rb:593` — `index_xp_transactions_on_source_type_and_source_id` is **not unique**.
- **Fix:** unique index on `(user_id, source_type, source_id)` + `find_or_create_by!` rescuing
  `RecordNotUnique`. This mirrors the fix already applied to `user_answers` in
  `engines/assessments/db/migrate/20260708000001_add_unique_index_to_user_answers.rb` — same pattern,
  same reasoning.

### P2-7 · Synchronous AI calls can wedge the web container

- `exercises_controller.rb:19` (`get_hint`), `:54` (`submit_answer`) and `answers_controller.rb:84`
  call `Orchestrate.call(async: false)` **in the request thread**.
- The rack-attack AI throttle (`rack_attack.rb:55-59`) matches only `/routes/create`, `*/tutor_chats`,
  `*/generate`. The real paths — `/exercises/:id/get_hint`, `/exercises/:id/submit_answer`,
  `/assessments/:id/answers` — are **not covered**, falling only under the 300-per-5-min backstop.
- Kamal's healthcheck timeout is 60s (`deploy.yml:27`); a saturated Puma pool fails `/up` and the deploy
  is rolled back.
- **Fix:** extend the throttle regex to the three endpoints, and move hint/grading to the existing async
  + Turbo Stream pattern.

---

## 6. P3 — Architecture, dead code, tests, CI

### P3-1 · CI runs 24% of the suite and auto-deploys on green

- `.github/workflows/ci.yml:99` — `bin/rails db:test:prepare test`. Rails' default test path is
  `Rails.root/test`, so `engines/*/test` is never collected.
- **Measured:**

  | Command | Runs | Assertions | Result |
  |---|---|---|---|
  | `bin/rails db:test:prepare test` (what CI runs) | **90** | 240 | 0F 0E |
  | `bin/rails test <all 52 engine test files>` | **288** | 830 | 0F 0E |
  | Total | **378** | 1070 | — |

  **288 tests (76%) never run in CI** — all engine coverage: auth, AI orchestration, assessments,
  content parsing. They are green when run manually; CI simply does not gate on them.
- `ci.yml:134` runs `test:system` against `test/system/`, which **does not exist** → passes vacuously.
- `test/test_helper.rb:51` declares `fixtures :all`; there are **0** fixture files.
- `.github/workflows/deploy.yml:3-17` deploys on `workflow_run` CI success — so a green 24% gates
  production. `config/ci.rb:11` has the same `bin/rails test` gap.
- **Fix:** `bin/rails test test engines/*/test` (or a Rake task globbing both), delete the vacuous
  system-test job or create `test/system/`, drop the empty `fixtures :all`.

### P3-2 · Dead code inventory

| Item | Lines | Status |
|---|---:|---|
| `engines/.../route_generator.rb` | 272 | superseded by `WizardRouteGenerationJob` |
| `ai_orchestrator/.../ai_request_job.rb` | 111 | every caller passes `async: false` |
| `ai_orchestrator/.../content_agent.rb` | 87 | reachable only via `run_agent`, **0 external call sites** |
| `engines/.../content_generation_job.rb` | 82 | superseded |
| `engines/.../route_generation_job.rb` | 29 | superseded |
| `app/jobs/route_generation_placeholder_job.rb` | 8 | **still enqueued** — `core/onboarding_controller.rb:75` |
| `app/controllers/dashboard_controller.rb` | 8 | route is a redirect |
| `Orchestrate.run_agent` (`orchestrate.rb:29-31,74-123`) | ~52 | 0 call sites; source of the `ai_orchestrator ↔ content_engine` circular dependency |
| Stimulus: `combo_counter`, `copy_code`, `confetti`, `xp_toast` | — | **0 view references each** |
| Stimulus: `lesson_nav` | — | **not dead** — 2 view references (L30 wrong on this one) |
| `playing_with_neon` table (`db/schema.rb:538`) | 4 | orphan Neon table; no migration drops it |
| `AiModelConfig` table | — | routing is hardcoded constants; DB lookup always misses |

**~650 lines** of removable Ruby, plus 4 Stimulus controllers. Note `RouteGenerationPlaceholderJob` is
*enqueued on every onboarding* — delete the call site, not just the class.

### P3-3 · Storage is not shared between `web` and `job` (L19 — confirmed)

- `config/deploy.yml` defines **no `volumes:` key** (grep confirms). `web` (`:8-12`) and `job` (`:13-18`)
  are separate containers on the same host.
- All TTS output is written by `job` and read by `web`: `audio_storage.rb:6-7`,
  `audio_generator.rb:147`, `section_audio_generator.rb:61,211`. Voice uploads go the other way
  (`voice_evaluator.rb:36`). Neither can see the other's files, and `storage/` is wiped on every deploy.
- Kamal's own source settles the fix: `kamal-2.11.0/lib/kamal/configuration.rb:220-221` reads
  `raw_config.volumes` at the **top level** and argumentizes `--volume` for all roles. There is no
  role-level `volumes` key.
- **Recommended:** top-level `volumes: [ "learning_routes_storage:/rails/storage" ]` now — it is a
  three-line fix that makes audio work today. Move to S3/R2 via Active Storage only when you need a
  second host; a named Docker volume on a single-box deployment is the right amount of machinery, and
  `production.rb:35` already sets `active_storage.service = :local`.

### P3-4 · Schema drift (L29 — mostly refuted, one real issue)

- **Refuted:** `db/schema.rb:13` is `2026_07_08_000001`, which corresponds to the real engine migration
  `engines/assessments/db/migrate/20260708000001_add_unique_index_to_user_answers.rb`. Schema version is
  the max across all migration paths — this is correct Rails behaviour, not drift.
- **Confirmed:** `db/schema.rb:538` still declares `playing_with_neon`, an orphan from the Neon era. No
  migration drops it, so `db:schema:load` and `db:migrate` still diverge by that table.

### P3-5 · Thread/pool sizing (L22 — largely fixed already)

`deploy.yml:53` now sets `RAILS_MAX_THREADS: "12"` (the lead describes `"3"`). `config/queue.yml`
requests 8 + 3 = 11 worker threads; `database.yml:61` sizes the pool from the same variable. The
arithmetic now works. Remaining concern: `deploy.yml:12,18` caps each container at **512 MB** while
`WEB_CONCURRENCY: auto` spawns one Puma worker per CPU — worth a memory check under load (§10).

### P3-6 · `SOLID_QUEUE_IN_PUMA: "false"` is truthy (L20 — confirmed)

`config/puma.rb:49` — `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"]`. `deploy.yml:56` sets the
**string** `"false"`, which is truthy in Ruby, so a full Solid Queue supervisor runs inside the 512 MB
web container *in addition to* the dedicated `job` container. Fix: `if ENV["SOLID_QUEUE_IN_PUMA"] == "true"`.

### P3-7 · `.kamal/secrets` cannot work from GitHub Actions (L24 — confirmed)

`.kamal/secrets:9` reads `RAILS_MASTER_KEY=$(cat config/master.key 2>/dev/null)` and `:5,6,16` grep
`.env`. Both are gitignored and absent from a fresh Actions checkout, so `2>/dev/null` yields an **empty**
master key and empty registry/Postgres passwords. `deploy.yml:23` also exports
`LEARNING_ROUTES_DATABASE_PASSWORD`, a name nothing in the repo reads.
Fix: `RAILS_MASTER_KEY=$KAMAL_RAILS_MASTER_KEY` style ENV passthrough with a local-file fallback.

---

## 7. What actually works well

Name these explicitly so a later refactor does not destroy them.

| Asset | Why it is good |
|---|---|
| `config/prompts/lesson_content.yml` (386 lines), `curriculum_design.yml` (242) | Genuinely sophisticated pedagogy: Bloom progression, prereq graphs, subject-family branching, per-step exercise selection, explicit translation contracts. The *prompts are not the problem* — the consumers are. |
| `CurriculumBrain` validation (`curriculum_brain.rb:124-192`) | Rigorous structural validation: bloom range, prereq forward-reference and self-reference checks, first-step-not-an-assessment, step count bounds, fail-open with logging. Ready to work the moment P1-1 lands. |
| Stimulus block wiring | Every `data-action` on every existing partial resolves to a real controller method — verified across all 9 controllers. Contradicts lead L14 entirely. |
| `LearningProfile` lookup pattern (`curriculum_brain.rb:35-38`) | Already solves the P0-1 class of bug correctly, with a comment explaining exactly why. Use it as the template. |
| FSRS (`spaced_repetition.rb`) + its test | Real implementation with dedicated coverage; the Hard/Easy inversion was found and fixed. Starved of input only because of P1-9. |
| `community_engine/state_preloader.rb` | Deliberate N+1 elimination. |
| `public/sandbox.html` + explicit meta CSP | Correctly isolated code playground. |
| Security tooling in CI (`ci.yml:21,24,38`) | Brakeman, bundler-audit **and** importmap audit all wired — better than most Rails apps. Undermined only by the test-path gap (P3-1). |
| Auth hardening at HEAD | Session fixation rotation (`core/application_controller.rb:169`), paired `[user_id, raw_token]` remember cookies, PII-conscious logging, `strict_loading: false` used surgically rather than globally. |
| `rack_attack.rb` | Fail2Ban scanner blocking, per-IP and per-email login throttles, notification logging. Just needs the AI paths added (P2-7) — and to be deployed. |

---

## 8. Pedagogy capability matrix

Legend — **FULLY WIRED**: parser → partial → controller → working action. **INERT**: renders but never
graded server-side. **DEAD**: prompt asks for it, nothing renders it. **ORPHAN**: app supports it, prompt
never requests it.

| # | Section type | Parser emits | Partial | Controller | Action exists | Prompt asks | Graded server-side | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `concept` | ✅ `:497` | ✅ | `math-renderer` | ✅ | ✅ | n/a | **FULLY WIRED** |
| 2 | `check` | ✅ `:115` | ✅ | `lesson-check`/`lesson-quiz` | ✅ `select` | ✅ | ❌ | **INERT** |
| 3 | `tip` | ✅ `:136` | ✅ | `math-renderer` | ✅ | ✅ | n/a | **FULLY WIRED** |
| 4 | `example` | ✅ `:131` | ✅ | `math-renderer` | ✅ | ✅ | n/a | **FULLY WIRED** |
| 5 | `summary` | ✅ `:150` | ✅ | `math-renderer` | ✅ | ✅ | n/a | **FULLY WIRED** |
| 6 | `visual` | ✅ `:317` | ✅ | `image-generate` | ✅ `generate` | ❌ | n/a | **ORPHAN** |
| 7 | `audio` | ✅ `:583` | ✅ | `section-audio` | ✅ ×4 | ❌ | n/a | **ORPHAN** (also broken by P3-3) |
| 8 | `drag_drop` | ✅ `:360` | ✅ | `drag-drop` | ✅ ×6 | ❌ | ❌ | **ORPHAN / INERT** |
| 9 | `fill_blank` | ✅ `:369` | ✅ | `fill-blank` | ✅ `checkAnswer` | ⚠️ vocab only | ❌ | **INERT** |
| 10 | `code_playground` | ✅ `:382` | ✅ | `code-playground` | ✅ `run`,`reset` | ❌ | ❌ | **ORPHAN / INERT** |
| 11 | `simulation` | ✅ `:404` | ✅ | `simulation` | ✅ `update` | ❌ | ❌ | **ORPHAN / INERT** |
| 12 | `scenario` | ✅ `:427` | ✅ | `scenario` | ✅ `choose`,`retry` | ❌ | ❌ | **ORPHAN / INERT** |
| 13 | `flashcards` | ✅ `:464` | ✅ | `flashcards` | ✅ `flip`,`rate` | ✅ | ❌ | **INERT** — only true overlap |
| 14 | `tap_pairs` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 15 | `code_challenge` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 16 | `bug_fix` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 17 | `output_prediction` | ❌ | ❌ | ❌ | — | ✅ ×3 | ❌ | **DEAD** |
| 18 | `drag_order` | ❌ | ❌ | ❌ | — | ✅ ×4 | ❌ | **DEAD** |
| 19 | `word_bank` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 20 | `translate_sentence` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 21 | `terminal_exercise` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 22 | `speak_sentence` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 23 | `listen_and_type` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |
| 24 | `image_label` | ❌ | ❌ | ❌ | — | ✅ ×2 | ❌ | **DEAD** |

**Totals:** 4 fully wired (all passive prose blocks) · 9 inert or orphaned · **11 dead**.
**Zero** interactive types are graded server-side. Renderer coverage
(`markdown_renderer.rb:65-71`) is 5 of 24. The prompt vocabulary and the app's capabilities intersect at
exactly one interactive type: `flashcards`.

---

## 9. Recommended sequence

Each package is one Claude Code session. **Do not reorder WP-1 and WP-2.**

| WP | Work | Depends on | Why this order |
|---|---|---|---|
| **WP-1** | **Deploy-blocker hygiene.** Add `config/master.key` + `config/credentials/*.key` to `.dockerignore` (P2-1). Fix `SOLID_QUEUE_IN_PUMA` truthiness (P3-6). Add top-level `volumes:` (P3-3). Fix `.kamal/secrets` for Actions (P3-7). Verify the built image contains no key before pushing. | — | **Deploying without this publishes your production key to a public registry.** ~1 hour. |
| **WP-2** | **Ship the 36 commits.** Then rotate the seeded admin credential and every secret in `production.yml.enc` (P2-2), on the assumption the April image's DB was seeded. | WP-1 | Instantly lands 3 months of security fixes. Highest value per minute in the entire audit. |
| **WP-3** | **Unbreak the wizard.** P0-1 (`:log` in prod + strict loading ON in dev/test + fix the call site), P0-2, P0-3, P0-5. | WP-2 | The user's #1 pain. Small, independent, high confidence. |
| **WP-4** | **Fix CI so it can defend the rest.** P3-1: run engine tests, delete the vacuous system job, drop `fixtures :all`. Add regression tests for P0-1/P0-2 and a `ROUTING_TABLE ⊆ TASK_TYPES` assertion. | WP-3 | Do this before the large refactors, not after — it is what makes them safe. |
| **WP-5** | **Make routes non-generic.** P1-1 (`curriculum_design` in `TASK_TYPES`), then P1-3 (`with_schema`) and P1-4 together, since structured output removes the extractor. | WP-4 | One-line unlock plus the correctness layer that keeps it working. |
| **WP-6** | **Close the prompt↔parser contract.** Short term: narrow prompts to the 13 supported types. Then P1-5 (language directive in all 17 templates) and P1-8. | WP-5 | Stops students seeing raw `:::` markers immediately. |
| **WP-7** | **Money and safety.** P1-6 (ElevenLabs pricing + route through `ModelRouter`), P1-7 (model IDs to config), P2-7 (async AI + throttle paths). | WP-2 | Independent of the pedagogy line; can run in parallel with WP-5/6. |
| **WP-8** | **Security follow-ups.** P2-3, P2-4, P2-5, P2-6. | WP-4 | Each is small; batch them behind a working test suite. |
| **WP-9** | **Delete dead code** (P3-2, ~650 lines + 4 controllers + the `run_agent` circular dependency), drop `playing_with_neon` (P3-4), harden `bin/docker-entrypoint` (P0-6). | WP-4 | Cleanup last, once tests can prove nothing broke. |
| **WP-10** | **Build the 11 dead block types.** Design decision first — see below. | WP-6 | The only genuinely large package. |

**WP-10 technology guidance** (owner has authorised non-Ruby where it genuinely wins):

- `code_challenge` / `bug_fix` / `output_prediction` / `terminal_exercise` — **Pyodide in the existing
  sandboxed iframe**. ~20 MB one-time download, ~0 ms warm start, $0 marginal cost, works offline, and
  `public/sandbox.html` already provides the isolation boundary. Judge0 would mean running and securing
  an execution service on a 512 MB box for no pedagogical gain. Reach for WebContainers only if lessons
  need pandas/numpy or a real filesystem.
- `speak_sentence` — the current `webkitSpeechRecognition` is Chrome-only and gives no pronunciation
  score. ElevenLabs **Scribe** is already contracted and costs $0.22/hour; use it for transcription and
  score against the target sentence server-side.
- **Grade server-side (P1-9) as part of every block you build.** Client-only exercises cannot feed FSRS,
  XP or gap analysis — building 11 more ungraded blocks would multiply the existing problem. The
  evidence base is unambiguous: retrieval practice plus spaced repetition drives retention (medium-to-
  large effect on L2 learning in meta-analysis), and corrective feedback must land before errors
  fossilize. You already have FSRS; it needs a server-side grading endpoint to feed it.
- **english-unlimited / `~/Downloads/english-ai-videos`** — the sibling Python/MoviePy/ElevenLabs
  pipeline is a natural fit for `listen_and_type` and comprehensible-input clips. Treat it as an
  asset-generation service writing into shared storage, not as a runtime dependency of the Rails app.

---

## 10. Unverified / needs runtime evidence

| # | Claim | Exact command |
|---|---|---|
| 1 | Which commit production actually runs (registry inference is strong but indirect) | `kamal app version` · `kamal app details` |
| 2 | Whether the three "uncommitted" July migrations were ever applied to the production DB | `kamal app exec --reuse 'bin/rails runner "puts ActiveRecord::Base.connection.migration_context.needs_migration?"'` |
| 3 | Whether the `password123` admin exists in the production DB (**do not attempt to log in — query it**) | `kamal app exec --reuse 'bin/rails runner "u=Core::User.find_by(email: %q(admin@learning-routes.com)); puts u ? \"EXISTS role=#{u.role} created=#{u.created_at}\" : \"absent\""'` |
| 4 | Live strict-loading violation action | `kamal app exec --reuse 'bin/rails runner "puts ActiveRecord.action_on_strict_loading_violation.inspect"'` |
| 5 | How often P0-1 fires in production | `kamal app logs \| grep StrictLoadingViolationError` |
| 6 | Whether `storage/` is genuinely unshared (P3-3) and audio 404s | `kamal app exec --reuse --role web 'ls -la /rails/storage/audio'` then the same with `--role job` |
| 7 | Whether the Solid Queue supervisor is running inside the web container (P3-6) | `kamal app exec --reuse --role web 'ps aux \| grep -c solid'` |
| 8 | Memory headroom: 512 MB cap vs `WEB_CONCURRENCY: auto` (P3-5) | `ssh <host> 'docker stats --no-stream'` |
| 9 | Real per-route ElevenLabs spend (P1-6) | ElevenLabs dashboard usage export vs `AiInteraction.where(model: "elevenlabs").sum(:cost_cents)` |
| 10 | Whether any published image tag contains credentials (I verified only `latest`) | `for t in $(tags); do docker run --rm --entrypoint sh gilberga/learning_routes:$t -c 'ls config/credentials config/master.key 2>&1'; done` |
| 11 | Whether `RouteRequest`s are actually stuck in `pending` (P0-4) | `kamal app exec --reuse 'bin/rails runner "puts RouteRequest.group(:status).count.inspect"'` |

Also unverified: I could not reproduce an authenticated `GET /routes/create` against production (no
account). P0-1 and P0-2 rest on reproduced local exceptions plus confirmation that the exact lines are
present in the deployed image — strong, but not a production stack trace. Item 5 would close it.

---

## 11. Sources

Repository evidence is cited inline as `file:line`; commands are quoted in place. External sources:

- [RubyLLM — Chat / structured output (`with_schema`)](https://rubyllm.com/chat/)
- [RubyLLM Ecosystem](https://rubyllm.com/ecosystem/)
- [crmne/ruby_llm-schema](https://github.com/danielfriis/ruby_llm-schema)
- [ruby_llm-schema on Ruby Toolbox](https://www.ruby-toolbox.com/projects/ruby_llm-schema)
- [Kamal — Roles configuration](https://kamal-deploy.org/docs/configuration/roles/)
- [Understanding Kamal proxy roles — strzibny](https://nts.strzibny.name/kamal-proxy-roles/)
- [Running multiple apps on a single server with Kamal 2](https://nts.strzibny.name/multiple-apps-single-server-kamal-2/)
- [rails/rails — allow applications to change strict loading violation behavior (PR #40511)](https://github.com/rails/rails/pull/40511)
- [Strict loading in Rails 8 — thoughtbot](https://thoughtbot.com/blog/strict-loading-in-rails-8-a-railsy-way-to-avoid-n-1-queries)
- [Using Rails strict_loading in production — jhollinger](https://jordanhollinger.com/2023/11/11/rails-strict-loading/)
- [Adopt .strict_loading gradually — DEV](https://dev.to/epigene/adopt-strictloading-gradually-5d7b)
- [Action Cable Overview — Rails Guides](https://guides.rubyonrails.org/action_cable_overview.html)
- [ActionCable::Connection::Base — Rails API](https://api.rubyonrails.org/classes/ActionCable/Connection/Base.html)
- [OpenAI API pricing 2026 — CloudZero](https://www.cloudzero.com/blog/openai-pricing/)
- [OpenAI API pricing August 2026 — BenchLM](https://benchlm.ai/openai/api-pricing)
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs — lowered API pricing & PAYG](https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go)
- [Run code in the browser without a server (2026) — Lifo](https://lifo.sh/blog/run-code-in-browser-without-server)
- [Run real Python in browsers with Pyodide — The New Stack](https://thenewstack.io/run-real-python-in-browsers-with-pyodide-and-webassembly/)
- [Running Python in the browser with Pyodide & WebContainer](https://madhudadi.in/blog/posts/running-python-in-the-browser-with-pyodide-webcontainer)
- [The effects of spaced practice on second language learning: a meta-analysis](https://www.researchgate.net/publication/358406370_The_Effects_of_Spaced_Practice_on_Second_Language_Learning_A_Meta-Analysis)
- [Repetition, retrieval, and spaced practice](https://www.researchgate.net/publication/398256768_Repetition_Retrieval_and_Spaced_Practice)
- [Science-backed language learning: retrieval, spacing, interleaving](https://abblino.com/science-backed-language-learning/)
