# PROMPT 12 — WP-19: cerrar las cuatro fugas de gasto, cada una con su red

> Run from `~/Documents/Learning-routes`. Branch off `main` as `wp19-spend-leaks`.
> **Do not build on `wp18-route-purchases`** — that branch is finished and awaiting deploy;
> keeping these separate means either can ship without the other.
> Reference: `ROADMAP_v3.md` §1, `AUDITORIA_2026_09` (the artifact), `WP18_RESUME.md`.

---

## What this package is

Four defects that spend real money on OpenAI and ElevenLabs **today**, in production, with no
paying customers and WP-18 not deployed. None of them is a commerce bug.

The owner's instruction for this package: *"trabajar ordenado y con bases fuertes."* So each fix
ships with the test that makes its **class** of defect impossible to reintroduce — not just a
test that the specific line now behaves.

That is not extra scope. Three of the four fixes converge on **two techniques that already exist
in this codebase**, and the reason the defects exist is that the technique was applied in one
place and not its sibling:

- `ContentPrefetcher.claim` — an atomic `UPDATE … RETURNING` with `jsonb_set`, so a claim and
  the read of who-won are one statement.
- `AiClient#initialize(model:, task_type:, user:)` — already carries everything the spend guard
  needs, but the guard lives one layer up.

**Two product decisions, already made by the owner. Do not re-litigate them:**

1. A reinforcement step **inherits the module of the step that triggered it.** Paid module →
   paid reinforcement. Preview module → free reinforcement.
2. The four fixes come first, each with its class-level test. The wider safety net (WP-4) is the
   next package, not this one.

---

## §A · The 3-second poll re-enqueues the lesson

**Evidence, verified:**

```ruby
# steps_controller.rb:224 — request_content_generation!
if metadata["content_generating"]
  @content_generating = true
  return
end
...
LearningRoutesEngine::ContentPipelineJob.perform_later(@step.id)
```

```ruby
# content_pipeline_job.rb:20-22
return if @step.metadata&.dig("content_ready")
...
mark_generating!          # the flag is written HERE — when the job STARTS
```

```erb
<%# _step_content_frame.html.erb:9 %>
data-content-poll-interval-value="3000"
```

`content_status` → `load_step_content` → `request_content_generation!`. The flag that decides
whether to enqueue is only written once the job starts running. With three worker threads
(`config/queue.yml`) and a full queue during route creation, enqueue-to-start is tens of seconds.
Every poll inside that window enqueues another pipeline for the same step, and the job guards
only on `content_ready`, never on `content_generating`. Every duplicate runs and every duplicate
bills.

**The seam.** `steps_controller.rb:150-160` already documents this exact race and announces the
fix — and the fix exists, in `ContentPrefetcher.claim`, serving `prefetch_upcoming_steps!`. The
path for the step the student is *looking at* kept the read-check-write the comment describes as
the bug.

**One thing you must handle.** `ContentPrefetcher.claim` bakes the preview filter into its SQL:

```sql
AND modules.access_state = 0
```

so it will refuse to claim a **paid** step. `request_content_generation!` must be able to claim
any step the caller is already authorized for. Do not copy the SQL — parameterise the filter (or
extract the claim with the module predicate as an argument) so there is exactly **one** atomic
claim in the codebase. Task 8 needs the same widening; leaving two copies guarantees they drift.

**The class-level test:** no request path may enqueue `ContentPipelineJob` without going through
the atomic claim. Assert it by driving concurrency, not by reading code: two simultaneous requests
for the same ungenerated step must produce exactly one enqueue.

**Cost avoided:** 2.33¢ per duplicate, 3.16¢ max, up to ~10 duplicates per step.

## §B · Reinforcement steps land in the free module

**Evidence, verified:**

```ruby
# results_controller.rb:68 — OUTSIDE the generation gate, which starts at :77
LearningRoutesEngine::AdaptiveDifficulty.new(route, @result).adjust!
```

```ruby
# adaptive_difficulty.rb:161 — no route_module: passed
@route.route_steps.create!(position: …, title: …, description: …, level: …, …)
```

```ruby
# route_step.rb:35,146
before_validation :assign_preview_module, on: :create
self.route_module = RouteModule.find_by(learning_route_id: learning_route_id, access_state: :preview)
```

Score < 60 inserts reinforcement steps into the **preview** module — which is exactly the filter
`ContentPrefetcher` uses to decide what to generate for free. And there is no ceiling:
`AssessmentsController#start` mints a fresh `AssessmentResult` whenever the previous one has a
score, so submit → start → submit repeats indefinitely. This needs no bad faith: a student who is
genuinely struggling and retries does it by himself.

**What to build.** `AdaptiveDifficulty` is constructed as `new(route, @result)`, so the step that
triggered the assessment is reachable as `@result.assessment.route_step` — that is the module to
inherit. Eager-load it; `strict_loading_by_default` is on.

Decide and justify two edges in the handoff:

- The triggering step has no module, or a module that has since changed state. What then?
- `skip_ahead!` is the mirror branch (score ≥ 90) and does not create steps — confirm that, and
  say so, rather than assuming symmetry.

**The class-level test:** every `RouteStep` creation path outside route generation must name its
module explicitly. `assign_preview_module` should stop being a silent default for callers that
simply forgot — make the fallback loud (in dev/test) or make the module a required argument for
these paths, and defend the choice. A test that a reinforcement step on a paid route is *not*
free is the specific case; the general case is that no caller can create a billable step into the
free module by omission.

**Cost avoided:** ≈4.66¢ per iteration, unbounded, and it stops inflating the free module while
the price stays flat.

## §C · All voice spend bypasses the only cost ceiling

**Evidence, verified:**

```ruby
# model_router.rb:50-51 — the ONLY place these are called
check_rate_limit!(primary)
check_cost_limit!
```

```ruby
# audio_generator.rb:118 and section_audio_generator.rb:175
client = AiOrchestrator::AiClient.new(model: "elevenlabs", task_type: :voice_narration, …)
```

Both TTS paths construct `AiClient` directly and never pass through `ModelRouter`, so the
5,000¢/day ceiling, the 500¢ per-user/day ceiling and the 20 rpm ElevenLabs limit are never
consulted for any audio. `CostAlertJob` runs hourly and only reports after the money is gone.

**The seam, and why this one is the real "base".** `AiClient#initialize` already takes
`task_type:` and `user:` — precisely what `check_cost_limit!` reads. The guard is one layer too
high. Move it to where every paid call actually passes: extract the two checks into a single
object (`SpendGuard` or similar) that `AiClient` invokes before any outbound request, and have
`ModelRouter` call the same object rather than its own copy.

Get this right rather than fast:

- `ImageGenerationService:29` calls `validate_cost_budget!` — a third, separate guard. Fold it in
  or say why it must stay distinct.
- Do not double-count: a call that goes `ModelRouter → AiClient` must be checked once.
- A guard that raises must not leave a half-written `AiInteraction` row.
- The ceiling is a business limit, not an error condition. Decide what the student sees when it
  trips, and make sure it is not an infinite skeleton.

**The class-level test:** a test that enumerates every construction of `AiClient` in the codebase
and asserts each one is subject to the guard. If the guard lives inside `AiClient`, that test
reduces to "no paid provider is reachable without it" — which is the point.

## §D · The media prefetch overwrites what was already paid for

**Evidence, verified:**

```ruby
# media_prefetch_job.rb:18
@step = LearningRoutesEngine::RouteStep.includes(…).find(route_step_id)
# …1-5 minutes of image and TTS generation across 6 threads…
# media_prefetch_job.rb:189
metadata = @step.metadata || {}
# media_prefetch_job.rb:242
@step.update!(metadata: metadata.merge("parsed_sections" => parsed, …))
```

`grep -n reload media_prefetch_job.rb` returns nothing. The whole jsonb blob is rewritten from a
copy read minutes earlier, so anything written in between is erased: the `image_url` a student
just generated by hand (`section_image_job.rb:55`), `step_quiz_generated`
(`step_quiz_generation_job.rb:75`), `audio_sections` (`section_audio_controller.rb:159`). The
generated file survives in storage; its URL does not. The student regenerates and you pay again.

**The seam.** `ContentPrefetcher.claim` already demonstrates the technique: `jsonb_set` writes one
key without touching the rest of the blob. `apply_results!` should write only the keys it owns,
not merge a stale whole.

While you are here: `step_quiz_generation_job.rb:75` and `assessment_generation_job.rb:70` have
the identical shape — a `step.metadata.merge` from a copy read before a multi-second AI call. Fix
all three; they are one defect.

**The class-level test:** a concurrent test — write a key from one path while another holds a
stale copy, and assert the first key survives. Then a test that no job writes `metadata` with a
whole-blob `merge` after an AI call. That second one is the class.

**Cost avoided:** 4.26¢ per lost image, 3.07¢ per lost narration.

---

## Hard constraints

1. **Do not deploy.** A human deploys.
2. **Do not touch WP-18 commerce code.** If a fix appears to need it, stop and write it in
   `FINDINGS_WP19.md`.
3. Do not "fix" the four known engine failures. Report the count before and after, measured as
   the intersection of 3 runs.
4. `env -u RAILS_MASTER_KEY` before every `bin/rails test`, and **one suite per process** — two
   concurrent `bin/rails test` runs share a database and manufacture an 18% false failure rate
   (`98e2fd1` root-caused this; do not rediscover it).
5. Every new query eager-loads. `strict_loading_by_default` only logs in production.
6. Every new user-facing string goes through I18n in both locales.
7. One commit per fix, each independently revertable, each naming the cost it stops.

## What to print when you are done

Only this:

- For each of §A-§D: the seam you used, in one sentence, and whether it was the existing
  technique or a new one — and if new, why the existing one did not fit.
- The four class-level tests, one line each, and for each: **what you deleted from production
  code to watch it fail.** A class-level test that has never failed is a claim, not a net.
- Both suite counts, before and after.
- Anything in §C you folded together or deliberately left separate.

Everything else goes to `WP19_HANDOFF.md`.

**Verify your report against the code before printing it.** Three reports in this project have
stated things that were not true, and one of them was the owner's own assistant quoting a cost
figure it had not measured.
