# Golden fixtures

v1's behaviour, captured from the Rails code and used to check the port (ADR 0003). Each file is `{ unit, source, captured_at, cases: [{ input, output }] }`. `source` is the `path:line` of the Ruby code, and `captured_at` is the frozen time every unit runs at (2026-10-26 12:00 UTC).

## Where each file comes from

All eight were written by `lib/tasks/characterize.rake` in Learning-Routes/Learning-routes at commit `1e01220`, the merge of #100 on `main` (the same code as `bcec7c74` on its branch), with:

```sh
cd Learning-routes
bin/rails characterize:all OUT=tmp/characterization
```

Each task runs in a transaction that always rolls back, enqueues no job and calls no network.

| File                  | Rails unit                                                          | Cases                                                                            |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `block_registry.json` | `ContentEngine::LessonBlocks`                                       | 1                                                                                |
| `block_grader.json`   | `LearningRoutesEngine::BlockGrader#call` and `.answerable?`         | 547                                                                              |
| `gating.json`         | `BlockGrader.gradable?`, `.gating?`, engagement only                | 18 (16 types, 2 unknown)                                                         |
| `fsrs.json`           | `LearningRoutesEngine::SpacedRepetition`                            | 211 (147 review sequences, 48 retrievability, 16 intervals); 66 changed by fix 1 |
| `attempt_rating.json` | `BlockAttempt#fsrs_rating`, replayed through `BlockAttemptRecorder` | 189 (176 rating branches, 13 histories)                                          |
| `lesson_parser.json`  | `ContentEngine::LessonSectionParser`                                | 259 (712 unique sections); 8 added by fix 6                                      |
| `cost_estimate.json`  | `AiOrchestrator::CostTracker.estimate_microcents`                   | 252 (11 models and 1 unknown, × 21 mixes); 90 changed by fix 4                   |
| `spend_limits.json`   | `AiOrchestrator::SpendGuard`                                        | 145 (49 daily, 63 per user, 33 rate); 5 changed by fix 3, 9 added by fix 4       |

In `block_grader.json`, `input.origin` says where a section came from:

- `recorded`: a section stored in a lesson in the dev database;
- `edge`: a section built by the task to probe a rule (missing fields, unknown types, every type bare);
- `normalize`: a `fill_blank` built to probe the answer normalization (accents, case, spaces, punctuation).

Only `recorded` sections must import as a stored Block; `edge` ones are malformed on purpose.

## What changed after capture

The counts above are v1's. The only edits since are the ADR 0003 fixes, made in STEP 45: `DIVERGENCES.md` describes each one with its before and after values, and `divergences.json` lists every changed or added case with its v1 and new output. `test/divergences.test.ts` undoes those edits and requires each file to match the SHA-256 that `divergences.json` pins for v1's original, so no other case can change unnoticed. The original files stay in git history at the STEP 44 merge.

## The data behind them

The fixtures that read the database (`block_grader.json`'s recorded sections and `lesson_parser.json`'s lesson bodies) read the developer's local database, which is not a copy of production:

- `config/database.yml` points `development` at `learning_routes_development` on `localhost`, unless `DB_HOST` is set, and it was not set when the fixtures were made.
- The repository has no script that copies production into development. The only command in the repo that reaches the production database is the password rotation in `docs/runbooks/rotate-postgres-password.md`.
- That database holds 7 accounts, all made while building v1: proof and demo accounts on `example.com` and `example.test`, and one developer account. Its 12 routes are test routes (Portuguese for Spanish speakers, and three "Mapa" demo routes).

## Personal data

The scan before committing looked for:

- names: every account name and email in the dev database, whole and split into words, matched against all eight files;
- emails, phone numbers, and signed or tokenised URLs;
- learner answers.

The results:

- **Names:** 4 words matched, all of them content words: "example" (a block type), "Motion" (a block type), "test" and "Mapa". None of them identifies a person.
- **Emails:** none.
- **Phone numbers:** none; the only digit runs that looked like phones were dates.
- **URLs:** two, both synthetic. `https://media.example/lesson-audio.mp3` replaces every real audio URL at capture time, and `https://ex.com/i.png` comes from a parser test. The one long encoded string is an inline "Image unavailable" SVG.
- **Learner answers:** none. Every grader payload and attempt history is built by the task from the section it grades.

Nothing needed replacing.

## Regenerating

1. In Learning-routes, on a checkout whose `lib/tasks/characterize.rake` you want to capture, with the dev database migrated:

   ```sh
   bin/rails characterize:all OUT=tmp/characterization
   ```
2. Copy `tmp/characterization/*.json` here.
3. Update the commit and the counts above.

To check that v1 still produces what these fixtures were recorded from, with the Rails app's development database migrated (the app is the repository root, around `platform/`):

```sh
pnpm golden:check
```

It runs the rake task into a temporary directory and compares each file with the v1 digest in `divergences.json`, which is how it tells v1's output from the fixes made on purpose. It says what it needs when Learning-routes is not next door (or pass the path: `scripts/check-golden.sh <path>`). It is not in CI, because it needs v1's Ruby, gems and database. Running it in CI needs a seeded database both repositories can rebuild; that is left for a later STEP.
