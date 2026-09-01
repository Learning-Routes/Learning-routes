# WP-7 Findings

## Pending security debt

`bin/importmap audit` remains red on 2026-08-31 with six advisories from dependency pins that
predate WP-7: DOMPurify has one moderate advisory; Mermaid has four moderate and one low advisory.
The owner excluded `config/importmap.rb`, Mermaid, and DOMPurify changes from this branch.
Brakeman and Bundler Audit are green. Upgrade and compatibility testing remain separate work.

## Historical costs that cannot be recovered

- Legacy GPT Image rows contain request-derived placeholders rather than provider usage.
- Legacy Scribe calls have no authoritative audio-duration measurement.
- Legacy Tavily calls have no immutable account rate snapshot and may lack reported credits.

Reconciliation keeps these rows explicitly unpriced and does not invent values.
Null, blank, zero, or otherwise absent historical counters are also preserved as unknown; only
authoritative positive usage is eligible for reconciliation.

## Operational limitations

- The application has no invoice-level reconciliation credential or verified billing export.
- Scribe metering depends on `ffprobe`; failures become unpriced usage.
- Tavily requires an account-specific rate and version in encrypted credentials or narrowly named
  runtime variables.
- `AiRequestJob` has no active async caller, but uses the exact ledger if re-enabled later.

## Review corrections completed

- Direct paid text tools retain absent token counters as null and explicitly unpriced.
- Scribe usage is finalized immediately after HTTP success, before sanitized response parsing.
- Image usage is finalized before decoding, storage, metadata, or output formatting.
- Later local failures do not relabel or erase an incurred provider charge.
- Missing OpenAI image counters remain null independently, including image-input metadata.
- Scribe success, parse failure, missing text, downstream failure, unknown duration, and provider
  failure tests each assert exactly one interaction and reject duplicate status rows.
