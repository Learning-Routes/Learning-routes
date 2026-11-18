# ADR 0011: Worker budgets for the community

**Status:** accepted, 17 November 2026.

Platform STEP 17 adds the community to the API: posts, replies, follows, the feed, notifications and their moderation, as 18 actions in `core` and their Postgres repositories. The API and agent Workers both carry the whole action registry, so both grew, and both went over the budgets the owner set in Platform STEP 12 (ADR 0004).

## The numbers

Gzip, as `wrangler deploy --dry-run` reports it on CI:

| Worker | main before STEP 17 | with STEP 17 | Old budget | New budget |
| --- | --- | --- | --- | --- |
| API | 307.92 KiB | 314.74 KiB | 310 KiB | 315 KiB |
| Agent | 607.41 KiB | 613.93 KiB | 610 KiB | 615 KiB |
| Web | unchanged | unchanged | 255 KiB | 255 KiB |

The community adds about 5 KiB gzip to each. Shortening its SQL and its action descriptions saved 0.55 KiB, and the rest is code the community needs.

## Decision

The owner raises the API Worker's budget to 315 KiB and the agent Worker's to 615 KiB. The web Worker stays at 255 KiB, and the MCP Worker at 500 KiB.

## Alternatives not taken

- **Give the agent only the actions it calls.** That saves about 2.4 KiB on the agent and nothing on the API, so the agent is still over 610 KiB. It is worth doing on its own, in a separate change.
- **Move the community's queries into database functions.** About 1.8 KiB on each Worker: not enough alone, and it moves rules out of the code that tests them.

## Consequences

Cloudflare's own limits are still far away: 64 MiB uncompressed and 1 s of startup. The size check keeps failing the build on any growth past the new budgets, and the next raise needs the same record: the before and after numbers, and why.
