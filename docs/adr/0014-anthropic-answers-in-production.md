# ADR 0014: Anthropic's own API answers the assistant and the tutor in production

Date: 2026-11-21. Status: accepted.

## Context

Every model call went through OpenRouter, and the Anthropic provider was for local runs only (STEP
11-prep §A1b). OpenRouter has no credit, so in production the assistant says it is not switched on
and the tutor answers 503. The owner has credit with Anthropic and wants the product to work end to
end now, without waiting for OpenRouter.

## Decision

- `MODEL_PROVIDER` "anthropic" is allowed in every environment. Production's config names it
  (`apps/api/wrangler.agent.jsonc`), and the key is the Worker secret `ANTHROPIC_API_KEY`.
- The "scripted" provider and `MODEL_TIER_OVERRIDE` stay development only.
- A provider asked for by name never falls back to another one's key: with no Anthropic key, no one
  answers, and the assistant and the tutor say so.
- The assistant keeps its two models, both Anthropic's. The tutor, which used `openai/gpt-5-nano`,
  uses `anthropic/claude-haiku-5.5` when Anthropic answers.
- Nothing above the fetcher changes: every call still goes through the one gate, is priced before
  it is sent, refused over a budget, and metered after, with the table's prices applied to the
  tokens Anthropic reports.

## Consequences

- The tutor costs more per answer than on the small OpenAI model. Its limits do not move: ten
  questions a person a day, the per-person day of spend and the platform's day.
- Route images are not part of this. Anthropic's API makes no images, so they stay off until a
  provider that does has credit.
- CI still never runs a real model: no workflow names the provider or its key, and a test holds
  that.
- Going back to OpenRouter is removing `MODEL_PROVIDER` from the config and deploying.
