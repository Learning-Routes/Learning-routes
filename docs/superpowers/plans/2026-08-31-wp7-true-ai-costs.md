# WP-7 True AI Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every paid AI-provider call at sub-cent precision and make billing, reporting, and spend limits consume the same truthful billable ledger.

**Architecture:** Keep `AiInteraction` as the canonical usage ledger, add integer microcent precision, and centralize provider-specific calculations in `CostTracker`. Paid text, image, speech synthesis, and transcription paths must persist provider usage without making successful content generation fail when metering fails. Historical correction is an explicit dry-run-first rake task; WP-16, quotes, payments, and route attribution columns remain separate work.

**Tech Stack:** Rails 8.1, PostgreSQL, Active Record, Minitest, Net::HTTP, OpenAI Images API, ElevenLabs TTS/STT APIs.

**Spec:** `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`

**Execution status (2026-08-31):** Tasks 1–5 are implemented and verified with the documented
pre-existing combined-suite failures and importmap security debt. Tavily was added as
credit-priced usage with an immutable configured rate snapshot; missing rates remain explicitly
unknown. The final command evidence, commit map, limitations, and pending importmap security debt
are recorded in `WP7_HANDOFF.md` and `FINDINGS_WP7.md`.

## Global Constraints

- Work from the current WP-15B head and verify `d33768d` and `1a6c4b7` are ancestors before editing.
- Inspect `825ac45`, `2c60024`, and `bd38b50` as historical evidence only. Do not cherry-pick them.
- WP-7 includes exact metering, transcription, spend limits, reconciliation tools, and tests. It excludes `/admin`, owner roles, commerce, quotes, Lemon Squeezy, module locks, and deployment.
- Verify every active provider rate against the provider's official pricing documentation on the execution date. If an official rate differs from this plan or cannot be expressed from stored usage, stop and report the mismatch before encoding it.
- Known OpenAI rates verified 2026-08-31: `gpt-5.2` USD 1.75/M input and USD 14/M output; `gpt-4.1-mini` USD 0.40/M input and USD 1.60/M output; `gpt-image-1` USD 5/M text input, USD 10/M image input, and USD 40/M image output.
- Monetary persistence uses integers. `cost_microcents` means 10,000 microcents per USD cent. Never use binary floats as stored monetary truth.
- Cached, failed, timed-out, and pending interactions are non-billable. Unknown and legacy-unrecoverable usage must remain explicit rather than becoming zero-cost billable usage.
- Do not make live paid provider calls, mutate production data, push, merge, rebase, deploy, or run an applying backfill.
- Commit every meaningful independently verifiable block. Before each commit, review `git diff` and run its focused tests. Do not amend or squash.

---

## File Map

- `engines/ai_orchestrator/db/migrate/*_add_cost_microcents_to_ai_interactions.rb`: exact ledger precision and query index.
- `engines/ai_orchestrator/app/models/ai_orchestrator/ai_interaction.rb`: billable scope, exact dollar view, completion metering contract.
- `engines/ai_orchestrator/app/services/ai_orchestrator/cost_tracker.rb`: provider rate table, exact calculators, exact aggregations and rounded compatibility views.
- `engines/ai_orchestrator/app/services/ai_orchestrator/model_router.rb`: spend-cap comparison using exact values.
- `engines/ai_orchestrator/app/services/ai_orchestrator/ai_client.rb`: image API usage capture; no ledger writes.
- `engines/content_engine/app/services/content_engine/image_generation_service.rb`: persist image usage returned by the provider.
- `engines/content_engine/app/services/content_engine/audio_generator.rb`: persist full-lesson TTS usage.
- `engines/content_engine/app/services/content_engine/section_audio_generator.rb`: persist section TTS usage.
- `engines/content_engine/app/services/content_engine/voice_evaluator.rb`: persist STT duration/usage separately from text evaluation.
- `engines/content_engine/app/services/content_engine/tools/web_search.rb`: persist Tavily provider-reported credits with an immutable configured rate snapshot.
- `lib/tasks/ai_costs.rake`: dry-run backfill and reconciliation report.
- Focused tests live beside the affected engines plus `test/services/ai_orchestrator/` for cross-engine billing paths.

## Task 1: Exact canonical ledger and spend limits

**Interfaces:**
- Produces `CostTracker.estimate_microcents(model:, input_tokens: 0, output_tokens: 0, image_input_tokens: 0, characters: nil, audio_seconds: nil) -> Integer`.
- Produces `AiInteraction.billable`, `AiInteraction#cost_dollars`, and exact aggregation methods ending in `_microcents`.
- Keeps existing cents-returning methods as rounded compatibility views.

- [ ] Write failing model/service tests proving: fractional text cost is preserved; cents use normal rounding rather than ceiling; `cost_dollars` reads exact precision; only completed non-cached rows are billable; all exact aggregates exclude non-billable rows; daily and per-user caps compare microcents against the configured cent limits multiplied by 10,000.
- [ ] Add a non-null `bigint :cost_microcents, default: 0` migration and an index supporting `(user_id, created_at, cost_microcents)`. Run `env -u RAILS_MASTER_KEY bin/rails db:migrate db:test:prepare`.
- [ ] Implement the exact calculator with integer/rational arithmetic. Convert published USD-per-unit rates into integer microcents-per-unit constants; do not calculate persisted money with Float.
- [ ] Update `mark_completed!` to write exact microcents and the rounded `cost_cents` compatibility value in the same update. Cached completions must write both values as zero.
- [ ] Update `daily_cost`, `weekly_cost`, `monthly_cost`, `cost_by_model`, `cost_by_task`, `cost_by_user`, summaries, alerts, and `ModelRouter#check_cost_limit!` so money-critical comparisons originate from billable microcents. Keep existing outward cents keys only where compatibility requires them and derive them from exact totals.
- [ ] Run the focused model, tracker, and router tests. Review the migration, schema, and diff.
- [ ] Commit as `fix(costs): add exact billable AI ledger`.

## Task 2: Provider-reported Tavily credit usage

**Interfaces:**
- Tavily successful responses persist provider-reported credits, a configured USD-per-credit snapshot, exact microcent cost, and a pricing version/effective-date identifier.
- The rate comes only from encrypted credentials or `TAVILY_USD_PER_CREDIT`; it is never inferred from a plan name.
- Missing rate produces an explicitly unpriced completed interaction, not a zero-cost billable row.

- [ ] Write failing tests for one-credit and multi-credit responses, provider credits overriding request assumptions, missing-rate unknown cost, failed/cached non-billable rows, immutable rate snapshots, and exact integer aggregation.
- [ ] Add the minimum ledger fields needed to distinguish priced and unpriced usage and snapshot provider units/rates/version without Float persistence. Run the migration and test preparation.
- [ ] Persist one interaction for each completed Tavily request. Preserve provider-reported credits even when the rate is absent; never log the configured rate, provider body, query, or user data.
- [ ] Extend reporting and reconciliation so unpriced Tavily rows are counted as unknown and historical calls are never assigned an invented rate.
- [ ] Run focused Tavily, ledger, tracker, and reconciliation tests. Review `git diff` and `git diff --check`.
- [ ] Commit as `fix(costs): meter Tavily credits with rate snapshots`.

## Task 3: Provider-reported OpenAI image usage

**Interfaces:**
- `AiClient#chat` for `gpt-image-1` returns `content`, `content_type`, `input_tokens`, `image_input_tokens`, `output_tokens`, and `latency_ms` from the API response.
- `ImageGenerationService` persists those counters and calculates the row through `CostTracker`.

- [ ] Write failing HTTP-stubbed tests for a successful base64 image response with a `usage` block, a non-2xx response, invalid JSON, timeout, missing image data, and missing usage. Missing usage must not silently create a zero-cost billable row.
- [ ] Replace the RubyLLM image path only if the installed gem still cannot expose both `quality` and provider usage. Match the existing ElevenLabs `Net::HTTP` boundary, read keys from credentials/environment, set explicit configured quality, preserve timeouts, and never log secrets or full provider bodies.
- [ ] Add service tests proving the provider counters, rather than prompt length or a flat per-image guess, are persisted and priced. Preserve content storage behavior.
- [ ] Run focused AI client and image-generation tests and `git diff --check`.
- [ ] Commit as `fix(costs): meter images from provider usage`.

## Task 4: Meter every ElevenLabs TTS and STT path

**Interfaces:**
- TTS uses actual billed character count and the verified model-specific character rate.
- STT creates its own `AiInteraction` with a registered transcription task type, audio duration/seconds in structured metadata, and exact cost; it is separate from the later text-evaluation interaction.

- [ ] Inventory every direct call to ElevenLabs and write a test that fails if a paid path completes without one corresponding billable row. Cover section narration, full-lesson narration, and voice-response transcription.
- [ ] Verify the exact ElevenLabs model IDs used by the code and their official current units/rates. Encode separate rate keys when multilingual/Flash/Turbo/Scribe differ; never use one generic flat `elevenlabs` price to hide model differences.
- [ ] Replace the removed `scribe_v1` request model with `scribe_v2` and prove the multipart request contract in a focused HTTP-stubbed test.
- [ ] Make full-lesson and section TTS persist actual characters and exact cost once—no duplicate row when the call already passed through `Orchestrate`.
- [ ] For STT, determine audio duration from the stored file or provider response using an existing supported library. Persist the duration and rate version. If duration cannot be measured, mark the interaction unpriced/unknown rather than billable at zero.
- [ ] Register the transcription task type through the existing `AiModelConfig::TASK_TYPES` and model validation contracts. Ensure provider failure produces a failed non-billable interaction without masking the original failure.
- [ ] Run focused audio, voice evaluator, task-type, and billable interaction tests.
- [ ] Commit as `fix(costs): meter speech synthesis and transcription`.

## Task 5: Safe historical reconciliation and final verification

**Interfaces:**
- `bin/rails ai_costs:backfill` is dry-run by default; only `APPLY=1` writes.
- `bin/rails ai_costs:report DAYS=30` reports exact billable totals, unknown rows, and totals by model/task without exposing prompts or personal data.

- [ ] Write failing rake-task/service tests for dry-run immutability, explicit apply, idempotence, cached/failed exclusion, recoverable text/TTS rows, and refusal to invent image/STT usage absent from historical rows.
- [ ] Implement the backfill in batches. Print counts and before/after totals; label unrecoverable rows explicitly. Never read or modify production as part of WP-7 verification.
- [ ] Add a handoff documenting official rate URLs and verification date, every metered call path including Tavily, precision rules, unknown historical rows, migrations, and remaining risks. Do not include provider keys, prompts, user data, invoice data, or account rate configuration.
- [ ] Run focused tests, then the main Rails suite with three seeds, then the combined app/engine suite with three seeds, RuboCop, Brakeman, Bundler Audit, and importmap audit. Compare failures by exact test name to the known baseline; never describe a red command as passing.
- [ ] Commit as `docs(wp7): record true-cost verification`.

## Review Gates

After each task, perform a requirements review and a code-quality review before starting the next task. Critical and important findings are fixed in a new focused commit; minor findings are recorded explicitly. The final handoff must list every commit hash, command, seed, run/assertion/failure/error count, official pricing source, unpriced historical category, and manual verification still required.
