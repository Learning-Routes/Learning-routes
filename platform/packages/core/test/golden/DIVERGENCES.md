# Divergences from v1

STEP 45 first ports v1 so that every case in these fixtures passes as recorded. Each fix decided in ADR 0003 then lands as its own commit, which changes only the cases listed here. A case is named by its file and its `input`. "New output" is the rule the fix commit must produce. That commit records the exact values here and in the fixture, which is the only time a v1 fixture changes.

## FSRS: stability 0 on an existing card (ADR 0003, fix 1)

- **Cases:** `fsrs.json`, `kind: "review_sequence"`, every sequence in which a review starts from an existing card (`fsrs_reps > 0` and not `fsrs_new`) whose stability is below the floor. With a floor of 0.01 that is 56 of the 147 sequences. The 18 sequences whose output ends in `{ "error": "FloatDomainError" }` are among them; 16 of those start from the seeded card with stability 0, and 2 reach 0 through repeated lapses.
- **v1 output:** a review from stability 0 raises `FloatDomainError` (NaN), and the sequence stops there. Reviews from stabilities below the floor use the tiny value as it is.
- **New output:** the incoming stability is clamped to the floor before the update, so every review returns a card, and none raises. The values for each changed review are recorded by the fix commit.
- **Reason:** the v1 lapse formula shrinks stability toward zero until it underflows. A learner who lapses often enough meets the crash on their next correct answer.
- **Open:** the floor value. 0.01 is the working choice; 0.1 would change 64 sequences, and 0.001 would change 49.

## Rate limit: refused calls use up slots (fix 3)

- **Cases:** `spend_limits.json`, `limit: "rate_limit"` with `daily_over: true` (5 cases).

| model, calls, pause   | v1 runs                                       | new runs        |
| --------------------- | --------------------------------------------- | --------------- |
| elevenlabs, 21, 61 s  | daily_budget 20, rate_limit 1, daily_budget 1 | daily_budget 22 |
| elevenlabs, 25        | daily_budget 20, rate_limit 5                 | daily_budget 25 |
| gpt-image-1, 31, 61 s | daily_budget 30, rate_limit 1, daily_budget 1 | daily_budget 32 |
| gpt-image-1, 35       | daily_budget 30, rate_limit 5                 | daily_budget 35 |
| claude-opus-4-5, 45   | daily_budget 40, rate_limit 5                 | daily_budget 45 |
- **Reason:** only an allowed call consumes a slot. A call refused for budget never reached the provider.

## Cost: unknown or under-specified (fix 4)

- **Cases:** `cost_estimate.json`:
  - `model: "unpriced-model"`: 21 cases. v1 returns `0`.
  - `model: "scribe_v2"` without `audio_seconds`: 16 cases. v1 raises `ArgumentError`.
- **New output:** an explicit unknown result, never `0` and never a raise. Its shape is fixed by the fix commit. `spend_limits.json` gains cases where the gate refuses a call whose cost is unknown.
- **Reason:** lesson 10. An unknown cost counted as 0 is spending nobody can see.
- **For review in STEP 45:** two more groups fit the same rule, but ADR 0003 does not name them:
  - `eleven_multilingual_v2` and `eleven_flash_v2_5` without `characters` (32 cases, v1 returns `0`);
  - `tavily` (21 cases, v1 raises because it needs provider-reported usage).

  The fix commit lists them here if the owner confirms.

## Parser: per-locale title literals (fix 6)

- **Cases:** none of the recorded cases changes. The 45 `lesson_parser.json` cases that contain "Introducción", "Lección" or "Continuación" come from Spanish-language lessons. Every lesson body in the dev database belongs to a route taught in Spanish (`route_locale` unset, which v1 treats as Spanish). With the lesson's locale set to `es`, they stay as recorded.
- **New output:** the parser input gains the lesson's locale. New cases cover en, pt, fr and it, where the generated titles and the names left out of a generated summary come from that locale's set.
- **Reason:** v1 put Spanish titles into lessons in every language.

## Kept as v1 (no fixture change)

- The FSRS variant (fix 2): `fsrs.json` stays as recorded. It is a known departure from FSRS v4: see ADR 0003.
- A wrong retry after a pass, and a right answer after a release (fix 5): `attempt_rating.json`, the "check: right, then wrong" and "check: released, then right" histories stay as recorded.
