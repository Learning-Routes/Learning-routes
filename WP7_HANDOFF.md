# WP-7 True AI Costs Handoff

**Status:** implementation in progress on `wp15-match-variants`; not deployed or pushed.
**Verification date:** 2026-08-31.

## Pricing sources

- OpenAI GPT-5.2: USD 1.75/M input and USD 14/M output —
  `https://developers.openai.com/api/docs/models/gpt-5.2`
- OpenAI GPT-4.1 mini: USD 0.40/M input and USD 1.60/M output —
  `https://openai.com/index/gpt-4-1/`
- OpenAI GPT Image 1: USD 5/M text input, USD 10/M image input, USD 40/M image output —
  `https://openai.com/index/image-generation-api/`
- ElevenLabs Multilingual v2: USD 0.10/1,000 characters; Scribe: USD 0.22/hour —
  `https://elevenlabs.io/pricing/api?price.platform=api`
- Tavily basic search: one provider credit; the USD-per-credit rate varies by account plan —
  `https://docs.tavily.com/documentation/api-credits`

## Tavily rate snapshots

Tavily cost is never inferred from a plan name. Each successful response records the
provider-reported credit count. A billable row additionally requires both
`tavily.usd_per_credit` and `tavily.pricing_version` in encrypted credentials, or the narrowly
named `TAVILY_USD_PER_CREDIT` and `TAVILY_PRICING_VERSION` runtime variables. The decimal rate
is converted directly to integer microcents without Float persistence and snapshotted with the
row. Configuration changes affect only later calls.

Missing usage, rate, or pricing version produces a completed `unpriced` row that preserves any
reported credits. Failed and cached interactions are non-billable. Historical Tavily calls are
reported as unknown and reconciliation refuses to invent a rate.

## Baseline before WP-7 implementation

- Focused: 62 runs, 263 assertions, 0 failures, 0 errors.
- Main seeds 17001, 17002, 17003: 252 runs, 821 assertions, 0 failures, 0 errors each.
- Combined seeds 17101, 17102, 17103: 560 runs, 1677 assertions, 3 failures, 9 errors each.
- The combined intersection is the known twelve: four `AudioControllerTest`, four
  `SectionAudioControllerTest`, `GapAnalysisJobTest`, `ReinforcementJobTest`,
  `RouteGenerationJobTest`, and `RouteGeneratorTest`.

## Commits

- `a6c051a` — exact microcent ledger, billable aggregation, and exact spend limits.
- Tavily metering commit: pending.
