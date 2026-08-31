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

## Operational limitations

- The application has no invoice-level reconciliation credential or verified billing export.
- Scribe metering depends on `ffprobe`; failures become unpriced usage.
- Tavily requires an account-specific rate and version in encrypted credentials or narrowly named
  runtime variables.
- `AiRequestJob` has no active async caller, but uses the exact ledger if re-enabled later.
