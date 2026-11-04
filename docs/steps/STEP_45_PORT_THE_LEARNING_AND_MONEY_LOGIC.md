# STEP 45: Port the learning and money logic to `core`

Written by the reviewer, 26 October 2026. Do it as one batch in this repository (`Learning-Routes/platform`).

## 0. Context

STEP 44 laid the foundations and captured v1's behaviour in eight golden fixtures (`packages/core/test/golden/`). This STEP ports the logic behind them into `packages/core` as plain TypeScript. Every golden case must pass as recorded first. Then the decided fixes land one commit at a time, as `DIVERGENCES.md` describes. Nothing here touches a database, a network, Workers or React; that is STEP 46 and later.

**Owner decisions closed in this STEP** (add them to ADR 0003 in the first code commit):
- **FSRS floor: 0.01.** Confirmed. It matches the floor FSRS-5 used. FSRS-6 implementations such as ts-fsrs use 0.001, but our variant is v4-based and a higher floor keeps lapse-heavy cards from collapsing to near-zero intervals. Name it `FSRS_STABILITY_FLOOR`.
- **Unknown cost covers all three groups.** Confirmed: an unknown model, `scribe_v2` without `audio_seconds`, `eleven_multilingual_v2` and `eleven_flash_v2_5` without `characters`, and `tavily` without provider-reported usage. All of them return the explicit unknown result, and the gate refuses them. Pre-call estimates for usage-priced tools stay unknown until a price is configured; that is a STEP 46+ decision, not a guess here.
- **Golden README commit:** name `1e01220` (the merged commit on Learning-routes `main`, identical code to `bcec7c74`).

## Batch rules

- Branch `step-45` from `origin/main`. This STEP file is the first commit. Then one commit per item below, each with a test that fails first.
- One PR. `main` is protected: it needs a PR and the green `check` job.
- Same rules as before: no tool or AI attribution anywhere, no secrets, exact pins for any new dependency, no skipped or weakened tests. The seven `it.skip` placeholders in `golden.test.ts` become real tests; none stays skipped at the end.
- `core` stays pure: no `Date.now()`, no `Math.random()`, no I/O. Time, randomness and stored state come in as arguments. The Biome boundary rule stays as it is.
- Money is an integer in microcents (lesson 10). Use `number` only while values stay inside `Number.MAX_SAFE_INTEGER`, and assert that in the cost module.
- Port behaviour, not Ruby structure. Small modules, clear names, and a JSDoc line on each exported function that says what v1 file it replaces.

## 1. Port v1 exactly (every golden case green)

Layout suggestion. Keep it if it holds up; change it if the code says otherwise, and say why in the PR.

```
packages/core/src/
  learning/registry.ts   block types, gradable/gating/engagement-only (block_registry.json, gating.json)
  learning/grader.ts     grade(block, submission) and answerable(block) (block_grader.json)
  learning/fsrs.ts       review, retrievability, interval (fsrs.json)
  learning/attempt.ts    attempt → FSRS rating and release (attempt_rating.json)
  content/parser.ts      v1 lesson markdown → v1 sections (lesson_parser.json)
  credits/cost.ts        estimateMicrocents (cost_estimate.json)
  credits/spend.ts       decideSpend: a pure verdict from limits + counters + the estimate (spend_limits.json)
```

Items, one commit each, in this order:

1. **registry and gating.** One source of truth for the 16 types and their roles (lesson 8: declare a vocabulary once). Test that the registry, the `Block` union in `blocks.ts` and the fixtures agree.
2. **grader.** `grade` and `answerable` match all 547 cases, including the `edge` and `normalize` origins. Grade against the block, never against a client score (lesson 12).
3. **fsrs.** All 147 review sequences, 48 retrievability cases and 16 intervals. The 18 v1 raises are reproduced as a typed error, the TypeScript equivalent of `FloatDomainError`, so the fixture still passes before fix 1. Compare floats with a tolerance of 1e-9 relative, and write down why in the test.
4. **attempt rating.** The 176 rating branches and 13 histories.
5. **parser.** All 259 cases. This is the largest port (v1's `lesson_section_parser.rb` is about 1,050 lines). Split it by section kind and keep each function small. Input is the v1 body plus metadata and audio URL. Output is v1's section JSON, exactly as recorded. Model output is untrusted input (lesson 18): the parser never throws on malformed markdown; it returns what v1 returned, error shape included.
6. **cost.** All 252 cases, with v1's 0s and raises reproduced as recorded, so fix 4 can change them later.
7. **spend.** All 145 cases. `decideSpend` takes the limits, today's spend (global and per user), the recent call timestamps for the rate window, the estimate and `now`, and returns `{ verdict, reason, consumesRateSlot }`. The caller (STEP 46) will store the counters. Reproduce v1's ordering bug as recorded, so fix 3 can change it.

Also, in one more commit: a **v1 → stored mapping** test. Every recorded parser section turns, through `importV1Block`, into a valid stored `Block` with a deterministic id, and two imports give the same ids.

## 2. The decided fixes (one commit each, after §1 is green)

Each commit changes code and exactly the fixture cases that `DIVERGENCES.md` names, then records the real before/after values in `DIVERGENCES.md`. These are the only edits ever made to a v1 fixture. Keep the original v1 files untouched in git history, and add a test that the edited cases are exactly the listed ones, no more.

1. **FSRS floor.** Clamp incoming stability to `FSRS_STABILITY_FLOOR` (0.01) before every update. No review ever raises or returns NaN.
   Add a property test (pin `fast-check` exactly): for random valid cards, ratings and elapsed days,
   - stability stays at or above the floor and finite;
   - difficulty stays within v1's bounds;
   - the interval is at least 1 day.
2. **Rate slots.** Only an allowed call consumes a slot. These are the 5 `daily_over` rate cases.
3. **Unknown cost.** Return `{ kind: "unknown", reason }` for all the groups in §0. Known costs return `{ kind: "known", microcents }`. `decideSpend` refuses unknown with reason `unknown_cost`. Add spend cases for that refusal.
4. **Per-locale title literals.** The parser takes the lesson's locale. Use these literal sets, so the content stays the same in every language:
   - es: Introducción · Lección · Continuación
   - en: Introduction · Lesson · Continuation
   - pt: Introdução · Lição · Continuação
   - fr: Introduction · Leçon · Suite
   - it: Introduzione · Lezione · Continuazione

   The recorded Spanish cases stay as they are, with locale `es`. Add new cases for en, pt, fr and it.

## 3. Housekeeping

- Update the golden README to commit `1e01220`, and add the decisions from §0 to ADR 0003.
- `scripts/check-golden.sh` stays out of CI, because it needs v1's database. Add a `pnpm golden:check` script that runs it locally with a clear message when Learning-routes is not next door, and mention it in the README.
- Remove the `.turbo/*.log` files from git if any were committed, and make sure `.turbo` is ignored.
- Add the reviewer's lesson to `LESSONS_FROM_V1.md` only if this port finds a new one; do not pad.

## Done when

- [ ] Every golden case passes; no `it.skip` remains in `packages/core`.
- [ ] The four fixes are separate commits, `DIVERGENCES.md` has their real before/after values, and a test proves only the listed cases changed.
- [ ] The FSRS property test runs in CI.
- [ ] `core` has no `Date.now`, `Math.random`, I/O or platform imports. Biome passes.
- [ ] A clean clone passes `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build`, and CI is green.
- [ ] The PR description lists:
  - the module layout;
  - test counts per unit;
  - anything in v1 that surprised you that STEP 44 did not list;
  - questions for the owner. Write them in the PR and keep going; don't stop to ask.

Stop once, at the end, with the PR open and green. Do not merge it; the reviewer reviews it first.
