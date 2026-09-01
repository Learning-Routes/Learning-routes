# WP-7 True AI Costs Handoff

**Status:** implemented and verified on `wp15-match-variants`; not pushed, merged, deployed, or applied to production.
**Verification date:** 2026-08-31.

## Commits

- `a6c051a` — exact microcent ledger, billable semantics, aggregation, and spend limits.
- `009359b` — Tavily provider credits with immutable configured rate snapshots.
- `d716908` — OpenAI image costs from provider-reported token usage.
- `4331cb9` — all ElevenLabs TTS paths and Scribe v2 STT metering.
- `d8e9c5e` — direct content-tool GPT calls.
- `011e418` — lesson-assistant parent and image-tool calls.
- `eedf842` — dry-run-first historical reconciliation and unknown-cost reporting.
- `d8c9cb7` — new metered task types explicitly registered as non-cacheable.
- `ccc5b6c` — unknown token usage, multi-call agent aggregation, and metering containment.
- `940f1c9` — historical reconciliation requires authoritative positive usage.
- `0a6990d` — direct text tools preserve absent provider counters.
- `0b3eb8c` — successful Scribe charges finalize before response parsing.
- `8285817` — image charges finalize before local storage and presentation.
- `7c176b3` — unknown provider counters remain null in the ledger.
- `6919dba` — unknown image counters remain null and Scribe metering is exactly once.

## Schema and precision

Migration `20260824000001_add_cost_microcents_to_ai_interactions.rb` adds the canonical non-null
bigint `cost_microcents` and its spend-query index. Migration
`20260831000002_add_provider_pricing_to_ai_interactions.rb` adds integer provider units, Tavily's
integer rate snapshot, `priced`/`unpriced` status, and pricing version. Monetary calculations use
Integer, Rational, or BigDecimal; binary Float is never persisted as monetary truth.

Only completed, non-cached, explicitly priced interactions are billable. Pending, failed,
timed-out, cached, and unpriced rows are excluded from spend while remaining visible in reports.

## Official pricing sources verified 2026-08-31

- OpenAI GPT-5.2: USD 1.75/M input, USD 14/M output — `https://developers.openai.com/api/docs/models/gpt-5.2`
- OpenAI GPT-4.1 mini: USD 0.40/M input, USD 1.60/M output — `https://openai.com/index/gpt-4-1/`
- OpenAI GPT Image 1: USD 5/M text input, USD 10/M image input, USD 40/M output — `https://openai.com/index/image-generation-api/`
- ElevenLabs Multilingual v2: USD 0.10/1,000 characters; Flash/Turbo: USD 0.05/1,000 characters; Scribe v2: USD 0.22/hour — `https://elevenlabs.io/pricing/api?price.platform=api`
- Tavily basic search consumes one provider credit — `https://docs.tavily.com/documentation/api-credits`

Tavily's USD-per-credit figure is account-specific and is not hardcoded. It comes from encrypted
`tavily.usd_per_credit` plus `tavily.pricing_version`, or `TAVILY_USD_PER_CREDIT` plus
`TAVILY_PRICING_VERSION`. Each completion snapshots credits, rate, exact cost, and version.
Missing usage, rate, or version preserves credits in an explicitly unpriced row; the value is
never logged and no plan-name inference occurs.

## Paid-call inventory

| Path | Measurement |
|---|---|
| `Orchestrate` and `AiRequestJob` | Provider input/output tokens |
| Content/lesson agent parent loops | Sum of every assistant response in the tool loop |
| Translate, simplify, diagram, and code tools | Provider input/output tokens; one row per paid call |
| `ImageGenerationService` and lesson-assistant image tool | OpenAI text-input, image-input, and output tokens |
| Full-lesson, section, and tool narration | ElevenLabs `character-cost` header and exact model ID |
| Voice transcription | Local `ffprobe` duration in milliseconds, priced as Scribe v2 time |
| Tavily web search | Provider response `usage.credits` and immutable configured rate snapshot |

The Scribe request sends `model_id=scribe_v2`; focused coverage verifies the multipart contract.
Metering failures do not replace successful generated content, and provider failures are non-billable.

## Reconciliation and unknown history

`bin/rails ai_costs:backfill` is dry-run by default; only `APPLY=1` writes supported rows. No
applying mode ran outside isolated tests. It is idempotent, excludes failed/cached rows, and prints
exact totals. `bin/rails ai_costs:report DAYS=30` groups exact spend and lists unpriced usage.

Legacy text token and ElevenLabs character rows can be priced. Historical image rows lack genuine
provider usage, old Scribe calls lack measured duration, and old Tavily calls lack rate snapshots.
Those costs remain unknown; no historical Tavily rate is invented.

Reconciliation additionally rejects null/blank/all-zero text counters and null/blank/non-positive
legacy TTS character counts. Successful Scribe and image calls finalize their provider charge
before parsing, decoding, storage, metadata, formatting, or downstream evaluation work.
For unpriced images, each absent OpenAI text-input, image-input, or output counter remains null
independently; zero is used only for the non-billable compatibility cost fields.

## Verification

- Final affected image/Scribe tests: 13 runs, 72 assertions, 0 failures, 0 errors (seed 24090).
- Focused WP-7: 103 runs, 430 assertions, 0 failures, 0 errors (seed 35376).
- Cache contract: 8 runs, 36 assertions, 0 failures, 0 errors (seed 18858).
- Main seeds 17801, 17802, 17803: 289 runs, 948 assertions, 0 failures, 0 errors each.
- Combined seeds 17901, 17902, 17903: 605 runs, 1855 assertions, 3 failures, 9 errors each.
  The exact intersection is the pre-existing twelve: four `AudioControllerTest`, four
  `SectionAudioControllerTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`,
  `RouteGenerationJobTest`, and `RouteGeneratorTest`.
- `bin/rubocop`: 441 files, no offenses.
- `bin/brakeman --no-pager`: no vulnerabilities found (8.0.4 noted 8.0.6 available).
- `bundle exec bundle-audit check`: passed with no advisories.
- `bin/importmap audit`: red with 6 pre-existing advisories: DOMPurify (1 moderate) and Mermaid
  (4 moderate, 1 low). Per owner direction, dependency pins were not changed here.

## Limitations and manual checks

- PostgreSQL bigint/index behavior is covered locally; no production migration or backfill ran.
- Scribe requires `ffprobe`; missing duration is explicitly unpriced, not zero-cost billable usage.
- Tavily requires account-specific rate/version configuration.
- Provider usage headers/blocks remain authoritative and must continue to be returned.
- No invoice reconciliation was possible and no provider credentials or paid calls were used.
- Verify migrations and provider usage fields in staging, then compare a small sample against the
  providers' billing dashboards.

No dashboard, owner role, commerce, production data, provider purchase, push, merge, rebase,
branch change, historical backfill application, or deployment occurred.
