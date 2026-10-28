# Divergences from v1

STEP 45 first ported v1 so that every case in these fixtures passed as recorded. Each fix decided in ADR 0003 then landed as its own commit, changing only the cases listed here. These are the only edits ever made to a v1 fixture. `divergences.json` lists every changed or added case with its v1 and new output, and pins the SHA-256 of each file as v1 recorded it. `test/divergences.test.ts` undoes the listed changes and requires v1's exact file, so no other case can change unnoticed.

## FSRS: stability 0 on an existing card (ADR 0003, fix 1)

**Done in STEP 45.** `FSRS_STABILITY_FLOOR` is 0.01. A review clamps the stability it starts from to the floor, and never stores a stability below it, so the next review starts at or above the floor too.

- **Cases:** 66 of the 147 `review_sequence` cases in `fsrs.json`. All 18 sequences that raised in v1 are among them; 16 start from the seeded card with stability 0, and 2 reach 0 through repeated lapses. The count is higher than the 56 estimated in STEP 44, because the floor also applies to the stability a review stores.
- **v1 output:** a review from stability 0 raised `FloatDomainError` (NaN). A lapse could store a stability far below 0.01, down to 0.
- **New output:** every review returns a card. Its stability is at least 0.01, and its interval is at least 1 day.
- **Reason:** the v1 lapse formula shrinks stability toward zero until it underflows, so a learner who lapses often enough met the crash on their next correct answer.
- **Confirmed by the owner** in the STEP 45 follow-up: the floor applies to stability on the way in and on the way out, and 66 is the real count.

Each row is one changed case: the starting card, the reviews as `rating@elapsed days`, the first review whose result changed, and that review's result before and after. `divergences.json` holds every value of every review.

| #   | Start          | Reviews                                                        | First changed | v1                            | Now         |
| --- | -------------- | -------------------------------------------------------------- | ------------- | ----------------------------- | ----------- |
| 1   | S 10, reps 3   | 1@0 1@5 4@7 3@30 1@7 3@60 4@45 1@45 4@60 5@0.01                | 2             | S 0.000002554, 1 d            | S 0.01, 1 d |
| 2   | S 0, reps 2    | 2@0 4@3 5@180 2@400 1@0.01 3@365 3@365 1@7 2@365               | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 3   | S 0, reps 2    | 3@0 3@0.01 2@365 2@400 2@21 2@5 2@10 2@90 3@2                  | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 4   | S 0, reps 2    | 3@0 0@3 1@60 5@30 3@3 0@60 5@10 1@30                           | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 5   | S 0.4, reps 5  | 3@0 1@90 5@5 3@60 0@3 5@180 3@45 4@21 3@0                      | 2             | S 0.002955, 1 d               | S 0.01, 1 d |
| 6   | S 0, reps 2    | 4@0 4@7 2@21 3@90 1@180 3@45 4@10 4@3 5@60 1@0.01 1@5 0@0.5    | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 7   | S 10, reps 3   | 5@0 1@2 2@10 3@10 1@10 2@90 1@7 2@2 3@10 4@0.01 3@14           | 7             | S 0.0009369, 1 d              | S 0.01, 1 d |
| 8   | new card       | 1@0.01 0@3 0@7 2@90 4@3 3@1 1@60                               | 2             | S 0.0001943, 1 d              | S 0.01, 1 d |
| 9   | S 0.4, reps 5  | 5@0.01 1@180 5@14 4@10 4@180 3@7                               | 2             | S 0.009835, 1 d               | S 0.01, 1 d |
| 10  | S 0, reps 2    | 1@0.5 4@10 4@90 2@45 0@1 2@0 2@180 4@365 4@400 4@2             | 1             | S 0, 1 d                      | S 0.01, 1 d |
| 11  | S 5, reps 0    | 1@0.5 2@60 1@365 1@14 3@30                                     | 4             | S 2.413e-7, 1 d               | S 0.01, 1 d |
| 12  | S 10, reps 3   | 0@1 1@21 5@365 4@0 1@2 4@10 2@0 3@3 4@1 5@0                    | 2             | S 0.000002554, 1 d            | S 0.01, 1 d |
| 13  | S 0.4, reps 5  | 0@1                                                            | 1             | S 0.0001937, 1 d              | S 0.01, 1 d |
| 14  | S 2.4, reps 1  | 0@1                                                            | 1             | S 0.004662, 1 d               | S 0.01, 1 d |
| 15  | S 0, reps 2    | 0@1                                                            | 1             | S 0, 1 d                      | S 0.01, 1 d |
| 16  | S 0.4, reps 5  | 1@1                                                            | 1             | S 0.0001937, 1 d              | S 0.01, 1 d |
| 17  | S 2.4, reps 1  | 1@1                                                            | 1             | S 0.004662, 1 d               | S 0.01, 1 d |
| 18  | S 0, reps 2    | 1@1                                                            | 1             | S 0, 1 d                      | S 0.01, 1 d |
| 19  | S 10, reps 3   | 2@1 0@0 1@21 3@2 3@5 3@60 1@3 3@2 0@30 1@10                    | 3             | S 0.000006473, 1 d            | S 0.01, 1 d |
| 20  | S 120, reps 12 | 2@1 5@2 0@400 0@21 4@21                                        | 4             | S 0.003147, 1 d               | S 0.01, 1 d |
| 21  | S 0, reps 0    | 2@1 1@21 3@30 2@30 2@180 4@45 4@5 3@7                          | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 22  | new card       | 2@1 4@60 1@0 0@1 4@1                                           | 4             | S 0.00005685, 1 d             | S 0.01, 1 d |
| 23  | S 0, reps 2    | 2@1                                                            | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 24  | S 0, reps 2    | 3@1                                                            | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 25  | S 2.4, reps 1  | 4@1 1@3 1@1 0@60 4@90 1@21 4@180 1@21 0@90 1@21 5@0            | 3             | S 0.000003497, 1 d            | S 0.01, 1 d |
| 26  | S 0, reps 2    | 4@1                                                            | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 27  | S 0, reps 2    | 5@1                                                            | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 28  | S 0, reps 0    | 1@10 2@60 1@0.5 0@7 5@0.5 4@1 4@180                            | 4             | S 2.413e-7, 1 d               | S 0.01, 1 d |
| 29  | S 0, reps 0    | 2@10 1@0.01 4@7 2@5                                            | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 30  | S 0.4, reps 5  | 2@10 0@0.5 0@5                                                 | 2             | S 0.008068, 1 d               | S 0.01, 1 d |
| 31  | S 0, reps 0    | 2@10 3@400 1@3 0@5                                             | 4             | S 0.000007609, 1 d            | S 0.01, 1 d |
| 32  | S 2.4, reps 1  | 1@14 2@3 0@400                                                 | 1             | S 0.004662, 1 d               | S 0.01, 1 d |
| 33  | new card       | 2@14 1@60 3@21                                                 | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 34  | S 2.4, reps 1  | 5@14 5@180 0@2 2@3 0@365 5@180 1@7 1@0 1@0.5 3@3 2@0.5         | 7             | S 0.003804, 1 d               | S 0.01, 1 d |
| 35  | S 120, reps 12 | 1@180 1@400 0@180 0@180 2@0.5 0@1 0@3 2@2 1@30 3@7             | 2             | S 0.001784, 1 d               | S 0.01, 1 d |
| 36  | S 0, reps 2    | 1@180 4@400 2@14 2@10 4@400 4@21 4@0.01                        | 1             | S 0, 1 d                      | S 0.01, 1 d |
| 37  | S 0.4, reps 5  | 1@180 4@5 3@180                                                | 1             | S 0.0001937, 1 d              | S 0.01, 1 d |
| 38  | S 2.4, reps 1  | 4@180 1@5 0@365 2@45 5@0 1@60 2@400 0@45 2@0.01 3@7 1@1 4@1    | 3             | S 0.00108, 1 d                | S 0.01, 1 d |
| 39  | S 0, reps 2    | 5@180 2@10 4@10 0@21 1@0.01                                    | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 40  | S 0.4, reps 5  | 0@2 5@0.01 1@21                                                | 1             | S 0.0001937, 1 d              | S 0.01, 1 d |
| 41  | S 5, reps 0    | 2@2 1@0 3@14 0@10 3@21 4@365 4@10 3@0.01                       | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 42  | S 0, reps 0    | 2@2 4@10 1@7 2@90 4@365 4@3 1@10 4@5 3@2 2@21 1@30 0@0.5       | 12            | S 0.00003384, 1 d             | S 0.01, 1 d |
| 43  | S 10, reps 3   | 2@2 0@30 1@45 0@45                                             | 3             | S 0.000007094, 1 d            | S 0.01, 1 d |
| 44  | S 2.4, reps 1  | 3@21 0@2 1@2 4@45                                              | 3             | S 0.00002223, 1 d             | S 0.01, 1 d |
| 45  | S 10, reps 3   | 4@21 3@365 2@30 2@1 1@60 1@90 0@21 1@14 5@14                   | 7             | S 2.559e-7, 1 d               | S 0.01, 1 d |
| 46  | S 0.4, reps 5  | 4@21 5@5 1@7 1@3 1@10 0@365                                    | 4             | S 0.00005823, 1 d             | S 0.01, 1 d |
| 47  | S 2.4, reps 1  | 2@30 1@365 2@0.5 1@7                                           | 4             | S 0.0001916, 1 d              | S 0.01, 1 d |
| 48  | S 0, reps 2    | 3@30 1@7 1@400 0@21 4@0.5                                      | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 49  | S 0, reps 2    | 4@30                                                           | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 50  | S 120, reps 12 | 0@365 0@45 1@7                                                 | 2             | S 0.001784, 1 d               | S 0.01, 1 d |
| 51  | S 0, reps 0    | 2@365 2@365 4@60 1@30 1@1 4@400 2@90 1@5 2@21                  | 5             | S 0.001492, 1 d               | S 0.01, 1 d |
| 52  | S 10, reps 3   | 3@365 4@14 3@2 0@400 5@5 2@180 1@365 4@30 1@14 2@400 1@2       | 11            | S 0.004807, 1 d               | S 0.01, 1 d |
| 53  | S 10, reps 3   | 3@365 0@365 5@3 1@0.01 2@14 1@3                                | 6             | S 0.000583, 1 d               | S 0.01, 1 d |
| 54  | S 5, reps 0    | 1@400 3@0.01 3@0 2@2 3@0.01 2@180 1@2 3@180 0@400              | 9             | S 0.005418, 1 d               | S 0.01, 1 d |
| 55  | new card       | 2@400 0@1 3@7                                                  | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 56  | S 5, reps 0    | 3@45 4@7 3@90 0@21 0@400 1@1 1@1 3@30 1@7                      | 5             | S 0.0009266, 1 d              | S 0.01, 1 d |
| 57  | S 0, reps 2    | 4@45 1@45 2@21 3@21 2@1                                        | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 58  | S 10, reps 3   | 5@45 5@400 5@0 5@10 0@400 2@14 5@21 0@10 0@0.01 4@60           | 9             | S 0.0004234, 1 d              | S 0.01, 1 d |
| 59  | S 0, reps 2    | 5@45 2@90 3@30 2@0 0@45 5@45 2@5 4@10 5@0.01 1@7 5@7           | 1             | raises FloatDomainError (NaN) | S 0.01, 1 d |
| 60  | S 2.4, reps 1  | 1@5 1@2 3@90 2@30                                              | 1             | S 0.004662, 1 d               | S 0.01, 1 d |
| 61  | S 5, reps 0    | 0@60 3@45 1@400 4@2 3@3 1@1 3@2 1@21 3@180 5@1 3@1 4@0.01      | 8             | S 0.0005841, 1 d              | S 0.01, 1 d |
| 62  | S 0, reps 2    | 1@60 5@45 0@14 1@0.5 4@0.5 4@365 3@400 5@5 2@3 3@2 4@0.5       | 1             | S 0, 1 d                      | S 0.01, 1 d |
| 63  | S 2.4, reps 1  | 3@60 0@14 0@400 1@14 1@0.5 4@5 2@45 3@30 2@60 0@400 0@400 1@21 | 3             | S 0.00007245, 1 d             | S 0.01, 1 d |
| 64  | S 2.4, reps 1  | 1@7 1@60 4@5 5@0.01 5@400 3@3 5@0.5 1@30 3@10 1@1 0@7          | 1             | S 0.004662, 1 d               | S 0.01, 1 d |
| 65  | new card       | 2@7 0@90 2@0.01                                                | 2             | S 0.0004134, 1 d              | S 0.01, 1 d |
| 66  | new card       | 4@90 1@10 4@400 2@0 1@365 3@10 1@90 2@3 1@45                   | 5             | S 0.00275, 1 d                | S 0.01, 1 d |

## Rate limit: refused calls use up slots (ADR 0003, fix 3)

**Done in STEP 45.** `decideSpend` returns `consumesRateSlot: false` for every refusal, so only an allowed call uses a slot. The 5 cases changed exactly as predicted (`first_refused_call` stays 1 in each).

- **Cases:** `spend_limits.json`, `limit: "rate_limit"` with `daily_over: true` (5 cases).

| model, calls, pause   | v1 runs                                       | new runs        |
| --------------------- | --------------------------------------------- | --------------- |
| elevenlabs, 21, 61 s  | daily_budget 20, rate_limit 1, daily_budget 1 | daily_budget 22 |
| elevenlabs, 25        | daily_budget 20, rate_limit 5                 | daily_budget 25 |
| gpt-image-1, 31, 61 s | daily_budget 30, rate_limit 1, daily_budget 1 | daily_budget 32 |
| gpt-image-1, 35       | daily_budget 30, rate_limit 5                 | daily_budget 35 |
| claude-opus-4-5, 45   | daily_budget 40, rate_limit 5                 | daily_budget 45 |
- **Reason:** only an allowed call consumes a slot. A call refused for budget never reached the provider.

## Cost: unknown or under-specified (ADR 0003, fix 4)

**Done in STEP 45.** `estimateCost` returns `{ kind: "known", microcents }` or `{ kind: "unknown", reason }`, and `decideSpend` refuses an unknown cost with reason `unknown_cost` before any other check. The fixture keeps v1's shape for a known cost (the number), so only the unknown cases change.

| Cases in `cost_estimate.json`                 | Count | v1                                                         | Now                                                               |
| --------------------------------------------- | ----- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `unpriced-model`                              | 21    | `0`                                                        | `{ kind: "unknown", reason: "unknown_model" }`                    |
| `scribe_v2` without `audio_seconds`           | 16    | raises `ArgumentError` (`invalid value for convert(): ""`) | `{ kind: "unknown", reason: "missing_audio_seconds" }`            |
| `eleven_multilingual_v2` without `characters` | 16    | `0`                                                        | `{ kind: "unknown", reason: "missing_characters" }`               |
| `eleven_flash_v2_5` without `characters`      | 16    | `0`                                                        | `{ kind: "unknown", reason: "missing_characters" }`               |
| `tavily`                                      | 21    | raises `ArgumentError` (needs provider-reported usage)     | `{ kind: "unknown", reason: "provider_reported_usage_required" }` |

90 cases in all. The owner confirmed in STEP 45 that the ElevenLabs and `tavily` groups belong here.

Added to `spend_limits.json` (`limit: "unknown_cost"`, 9 cases, with no v1 output):

- Refused with `unknown_cost`: an unknown model; `scribe_v2` with no seconds and with seconds that are not a number; `eleven_multilingual_v2` and `eleven_flash_v2_5` with no characters; `tavily`; and `tavily` when the daily ceiling is also reached, which shows the unknown cost is refused first.
- Two controls with a known cost: `scribe_v2` with 59.5 seconds is allowed, and `gpt-4.1-mini` over the daily ceiling is refused with `daily_budget`.

- **Reason:** lesson 10. An unknown cost counted as 0 is spending nobody can see.

## Parser: per-locale title literals (ADR 0003, fix 6)

**Done in STEP 45.** `parseLesson` takes the lesson's `locale`. It names the freeform sections the author left untitled from that locale's set, and leaves the same set out of a generated summary.

| Locale | Before the first heading | First paragraphs | Later paragraphs |
| ------ | ------------------------ | ---------------- | ---------------- |
| es     | Introducción             | Lección          | Continuación     |
| en     | Introduction             | Lesson           | Continuation     |
| pt     | Introdução               | Lição            | Continuação      |
| fr     | Introduction             | Leçon            | Suite            |
| it     | Introduzione             | Lezione          | Continuazione    |
- **Changed cases:** none. Every recorded lesson belongs to a route taught in Spanish, so the 259 recorded cases run with `es` and stay exactly as recorded, the 45 with v1's Spanish titles included.
- **Added cases:** 8 in `lesson_parser.json`, each with a `locale` (en, pt, fr, it). Each locale gets a seven-paragraph lesson ("Lesson", "Continuation", "Continuation" in English) and a lesson with text before its first heading ("Introduction", then the real heading as the only key point). `test/parser-locale.test.ts` checks that each locale's output is the Spanish output with only these names swapped, so the content is the same in every language.
- **`:::concept`:** an untitled `:::concept` fence was titled "Concepto" in every language. That is now per locale too: see the next section.

## Grader: `fill_blank` blanks by position (ADR 0003, answer 1)

**Done in the STEP 45 follow-up.** `grade` compares answer i with blank i. A blank whose expected value is empty is not graded and does not count toward the score; the others keep their positions. `answerable` is false when every expected blank is empty, so such a block never gates.

- **Cases:** 7 of the `fill_blank` cases in `block_grader.json`, all `origin: "edge"`.

| blanks         | answers             | v1                     | Now                        |
| -------------- | ------------------- | ---------------------- | -------------------------- |
| `["", "gato"]` | `["", "GATO"]`      | wrong, 0               | right, 100                 |
| `["", "gato"]` | `["", "gato"]`      | wrong, 0               | right, 100                 |
| `["", "gato"]` | `["wrong", "gato"]` | wrong, 0               | right, 100                 |
| `["", "  "]`   | 4 submissions       | ungradable, answerable | ungradable, not answerable |
- **v1 output:** blank expected values were dropped before comparing, but the answers kept their positions, so the right answer scored 0 and the block gated until its release after 3 failures.
- **Reason:** a block nobody can pass is a trap, not a check (lesson 6).

## Grader: a strict `option_index` (ADR 0003, answer 1)

**Done in the STEP 45 follow-up.** `grade` reads a `check` submission's `option_index` strictly: an integer, or a string of plain digits. Anything else, or an integer out of range, is wrong. It is never option 0.

- **Changed cases:** none. Every recorded `option_index` is an integer or `"1"`.
- **Added cases:** 7 in `block_grader.json`, `origin: "edge"`, with París as option 0 and correct. `"abc"`, `"0abc"`, `""`, `0.5` and `true` are now wrong; v1 read each as option 0 and called it right. `"0"` is still right, and `2` with two options is wrong.
- **Reason:** v1's `to_i` turned a malformed submission into option 0, so it was right whenever the first option was.

## Grader: code answers keep their symbols, and `match` (ADR 0003, answer 1)

**Done in the STEP 45 follow-up.** A `fill_blank` block takes an optional `match`. `"text"`, the default, is v1's normalisation except that it removes only Unicode punctuation (`\p{P}`), never symbols (`\p{S}`). `"exact"` trims the surrounding whitespace and compares case-sensitively, for code, formulas and symbols. The v1 import sets `"text"`. A `check` compares option indexes, never text, so it has no `match`.

- **Changed cases:** 3 in `block_grader.json`, `origin: "normalize"`: with the blank `"C++"`, the answers `"c"`, `"c#"` and `"c+"` were right (100) and are now wrong (0).
- **Added cases:** 10 in `block_grader.json`, `origin: "edge"`, the blank `"C++"` answered with `"C++"`, `"c++"`, `"c+"`, `"c"` and `"c#"`. Under `"text"` only `"C++"` and `"c++"` are right; under `"exact"` only `"C++"`.
- **Reason:** v1's `[[:punct:]]` also removed the ASCII symbols ``$+<=>^`|~``, so a code answer lost the characters that make it code.

## Rate limit: a sliding window (ADR 0003, answer 2)

**Done in the STEP 45 follow-up.** `decideSpend` counts the earlier calls that used a slot from `now - 60 s` up to `now`. An earlier call in the same millisecond as `now` counts, so simultaneous calls cannot pass together. v1's window was fixed: it opened at the first call and closed 60 seconds later.

- **Changed cases:** none. Every recorded situation makes its calls at one instant, then at most one more call 59 or 61 seconds later, and a fixed and a sliding window agree on all of them.
- **Added cases:** 2 in `spend_limits.json`, `limit: "rate_limit"`, with `bursts`: groups of calls, each at its own time.

| model, limit        | bursts (calls @ seconds) | v1's fixed window would allow | Now                                                 |
| ------------------- | ------------------------ | ----------------------------- | --------------------------------------------------- |
| elevenlabs, 20      | 1@0 19@59 20@60 2@60.001 | 40, all but the last 2        | allowed 20, rate_limit 20, allowed 1, rate_limit 1  |
| claude-opus-4-5, 40 | 1@0 39@59 40@60 40@119   | 80, then refuses the 40@119   | allowed 40, rate_limit 40, allowed 1, rate_limit 39 |
- **Reason:** a burst across the edge of a fixed window allowed twice the limit within a second.

## Parser: the `:::concept` default title per locale (ADR 0003, answer 3)

**Done in the STEP 45 follow-up.** An untitled `:::concept` fence takes its title from the same per-locale set as the freeform sections, and like them it is left out of a generated summary.

| Locale | Untitled `:::concept` |
| ------ | --------------------- |
| es     | Concepto              |
| en     | Concept               |
| pt     | Conceito              |
| fr     | Concept               |
| it     | Concetto              |
- **Changed cases:** none. No recorded lesson has an untitled `:::concept` fence. A fence takes its first line as its title, so only an empty one is untitled.
- **Added cases:** 5 in `lesson_parser.json`, one per locale, each with an empty `:::concept` fence before a titled section. The summary's key points are the real title alone; v1 also listed "Concepto" there.
- **Reason:** the same defect as the freeform titles: a Spanish name in a lesson taught in another language.

## Kept as v1 (no fixture change)

- The FSRS variant (fix 2): `fsrs.json` stays as recorded. It is a known departure from FSRS v4: see ADR 0003.
- A wrong retry after a pass, and a right answer after a release (fix 5): `attempt_rating.json`, the "check: right, then wrong" and "check: released, then right" histories stay as recorded.
