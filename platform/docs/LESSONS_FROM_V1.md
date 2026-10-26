# Lessons from v1

v1 is the Rails app in `Learning-Routes/Learning-routes`. Each lesson below is a rule for this repository, followed by what happened in v1 and where it shows. Paths are in the v1 repository.

## 1. Claim a paid job atomically before it starts; a poll never enqueues a second one

v1 set the "generating" flag only when the job started running. While the job waited in the queue, every 3-second poll from the lesson page enqueued another paid pipeline, up to about ten per step, and the exam generator did the same. The fix is one `UPDATE … RETURNING` that claims the work, and every early return in the job releases the claim.

- `engines/learning_routes_engine/app/controllers/learning_routes_engine/steps_controller.rb` (`request_content_generation!`)
- `engines/learning_routes_engine/app/jobs/learning_routes_engine/content_pipeline_job.rb`
- `engines/learning_routes_engine/app/services/learning_routes_engine/content_prefetcher.rb`
- `docs/roadmap/ROADMAP_v3.md` §1a, `docs/audits/AUDIT_2026-09-07.md` §2.4

## 2. Every paid model call goes through one gate that checks cost and rate limits, exactly once

The limits lived in `ModelRouter#execute`, and both text-to-speech paths built their client directly, so no audio call ever met a ceiling. Later the lesson assistant and the speech evaluator also called providers directly. The gate moved to the one client every provider goes through. Checking in two places would have halved every model's rate limit, because the limiter increments a counter.

- `engines/ai_orchestrator/app/services/ai_orchestrator/spend_guard.rb`, `ai_client.rb`, `model_router.rb`
- `engines/content_engine/app/services/content_engine/audio_generator.rb`
- `docs/roadmap/ROADMAP_v3.md` §1c, `docs/audits/AUDIT_2026-09-07.md` §3.1 and §3.2

## 3. A background job updates only the fields it owns

The media prefetch job loaded a step, spent minutes generating, then wrote the whole metadata document back. That erased image URLs, quiz flags and audio written in the meantime, and the student paid again for them. A re-parse task did the same to image URLs.

- `engines/content_engine/app/jobs/content_engine/media_prefetch_job.rb`
- `engines/learning_routes_engine/app/models/learning_routes_engine/route_step.rb` (`merge_metadata!`, `fresh_metadata`)
- `docs/roadmap/ROADMAP_v3.md` §1d, `docs/audits/AUDIT_2026-09-07.md` §2.5

## 4. Content inserted after a purchase takes the access of where it is inserted, and insertion is capped

Reinforcement steps were created without a module and fell into the free preview module. Nothing capped them either: one live route grew from 7 to 43 steps in a day. The fix inherits the module of the step that triggered the insertion, refuses when there is none, and allows one unfinished set at a time.

- `engines/learning_routes_engine/app/services/learning_routes_engine/adaptive_difficulty.rb` (`insert_reinforcement!`, `triggering_module_id`)
- `docs/roadmap/ROADMAP_v3.md` §1b, `docs/steps/STEP_22_WP29_ANSWERS_LOST_AND_FAILING_ADVANCES.md` §4

## 5. A payment event is processed exactly once, a refund revokes what it must, and an expired price link is refused

v1 got the first part right: the provider event is claimed under a unique index and the claim is released on an unexpected error. Refunds never worked. The refund event is claimed and then rejected as unsupported, and the method that marks a purchase refunded has no caller in production. The webhook never checks whether the quote behind a link expired or was superseded, and a database CHECK hardcodes the price.

- `app/services/commerce/order_processor.rb`, `app/models/commerce/provider_event.rb`, `app/models/commerce/route_purchase.rb`
- `app/controllers/commerce/webhooks_controller.rb`
- `docs/roadmap/ROADMAP_v3.md` §4, `docs/audits/AUDIT_2026-09-07.md` §3.3 and §3.5, `docs/steps/STEP_11_REFUND_HOLE_AND_QUOTE_LIFECYCLE.md`

## 6. A section the student cannot answer is never a gate

A generated `check` with no question, no options or no correct answer rendered as a blocking modal. The student could only guess, and a wrong guess cost a heart. v1 now decides answerability before any submission and lets such a section pass. `block_grader.json` in `packages/core/test/golden` records the rule.

- `engines/learning_routes_engine/app/services/learning_routes_engine/block_grader.rb` (`self.answerable?`)
- `engines/assessments/app/services/assessments/advancement_policy.rb`

## 7. Progress never lives on the content row

The nine `fsrs_*` scheduling columns, `status` and `completed_at` sit on `route_steps`, the row that also holds the lesson. When a route is shared, the clone copies each step and so copies the sharer's review schedule to the new student. In this repository `Progress` is its own schema, keyed by student, and `Lesson` has no progress fields.

- `db/structure.sql` (table `learning_routes_engine_route_steps`)
- `engines/community_engine/app/services/community_engine/route_sharer.rb`

## 8. Declare a vocabulary once and test every consumer against it

Five places declared the block types on their own. The prompt asked for eleven types the parser did not know, so students saw a literal `:::tap_pairs` in their lesson. The task-type list also disagreed with the routing table, and every route quietly fell back to one generic template. Here, `BLOCK_TYPES` in `core` is the list, and a test checks it against the v1 registry.

- `engines/content_engine/app/services/content_engine/lesson_blocks.rb`
- `docs/audits/AUDIT.md` §P1-1 and §P1-2, `docs/steps/STEP_04_BLOCK_CONTRACT.md`

## 9. Never store a translated default; resolve it when reading, and pass the locale explicitly

The parser stored default titles such as "Concepto" in whatever language the worker happened to run in, and that array was the cache pages rendered from. Column defaults disagreed (`"en"` on routes, `"es"` on requests), a process-wide locale leaked between tests, and only 3 of 17 prompts received a language instruction.

- `docs/steps/STEP_26_WP33_WHAT_THE_REPARSE_WOULD_DESTROY.md` §4
- `docs/audits/FINDINGS_WP9.md` §2 and §3, `docs/audits/FINDINGS_WP10.md` §1, `docs/audits/AUDIT.md` §P1-5

## 10. Money is an integer in minor units, and an unknown cost stays unknown

Text-to-speech was priced at a flat 0, which hid the largest cost. v1 moved to integer microcents and keeps unpriced history apart, but the spending ceilings still sum only priced rows, so an unknown cost counts as nothing. Here every amount is an integer with its currency (`Money`, `CreditLedgerEntry`).

- `engines/ai_orchestrator/app/services/ai_orchestrator/cost_tracker.rb`
- `docs/audits/AUDIT.md` §P1-6, `docs/audits/AUDIT_2026-09-07.md` §3.5, `docs/audits/FINDINGS_WP7.md`

## 11. When grading fails, the student is not penalised

A failed or budget-refused grade left `correct` empty, and empty counted as wrong. One tripped ceiling would have failed every exam that day and inserted reinforcement steps for all of them. The grader returns "ungradable" and the block records engagement instead.

- `block_grader.rb` (`ungradable`)
- `docs/audits/AUDIT_2026-09-07.md` §2.3

## 12. Grade on the server against stable ids, and never trust a score from the client

The radio button posted "A) …" while the stored key was "A", so no multiple-choice answer was ever marked correct. Options were matched by their position in the page, the answer key sat twice in the DOM, and lesson XP came from `params[:quiz_results]`.

- `docs/steps/STEP_22_WP29_ANSWERS_LOST_AND_FAILING_ADVANCES.md` §1
- `docs/audits/FINDINGS_WP15.md` §1 and §6, `docs/audits/AUDIT.md` §P1-9, `docs/audits/AUDIT_2026-09-07.md` §2.8

## 13. Enforce uniqueness and singletons in the database

XP could be farmed by replaying a request because its index was not unique. Two concurrent starts created two open exam attempts. Answers were unique per user and question, so an answer could not belong to an attempt. v1 now relies on unique indexes for the single owner and the single paid purchase.

- `db/structure.sql` (`idx_core_users_single_owner`)
- `docs/audits/AUDIT.md` §P2-6, `docs/audits/AUDIT_2026-09-07.md` §2.7, `docs/steps/STEP_20_WP27_THE_EXAM_CANNOT_BE_RETAKEN.md` §2

## 14. "May read" and "may make us spend" are separate checks

Lesson generation, the lesson assistant and exercises were authorised by the read policy. That policy counts a refunded purchase as entitled, so a refunded customer could still trigger paid generation.

- `docs/steps/STEP_11_REFUND_HOLE_AND_QUOTE_LIFECYCLE.md` §A, `docs/audits/AUDIT_2026-09-07.md` §3.1

## 15. Never swallow an error

A bare `rescue` turned a validation error into "every route is generic". `content_error` was written and never read, so each refresh paid again for the same failure. Seven more silent rescues turned up later, and a sweep test now refuses new ones. Log with the ids that identify the work, or raise.

- `docs/audits/AUDIT.md` §P1-1 and §P1-8, `docs/steps/STEP_37_CLOSE_THE_AUDIT.md` §0 and §2, `docs/roadmap/ROADMAP_v3.md` §7

## 16. Every side effect after a commit is idempotent

Exam submission committed the score, then ran metrics, reinforcement insertion and a paid gap analysis outside any transaction. When one of them raised, the student retried, and each retry paid and inserted again.

- `docs/steps/STEP_21_WP28_SUBMIT_RETRIES_COST_MONEY.md` §2

## 17. Business constants stay out of database CHECKs, and a failed migration fails the deploy

A literal 299 in a CHECK meant any price change broke every quote until a migration shipped. The container entrypoint ran `db:prepare || echo`, so the server started on a half-migrated schema.

- `docs/roadmap/ROADMAP_v3.md` §4, `docs/audits/AUDIT_2026-09-07.md` §3.5, `docs/audits/AUDIT.md` §P0-6

## 18. Model output is untrusted input

JSON mode was stripped from every call, and a regex extractor broke on lessons that contained code fences. Tutor chat rendered model output with `html_safe`, and the renderer let generated markup carry `data-controller` attributes and form inputs. Ask for a schema, validate against it (the `Block` schema here), and sanitise before rendering.

- `docs/audits/AUDIT.md` §P1-3, §P1-4 and §P2-5, `docs/audits/AUDIT_2026-09-07.md` §4.7

## 19. Paid media is served through short-lived, authorised URLs

Images generated for paid modules were stored as permanent public blob URLs. Seven call sites also gave different answers to which row holds the lesson body; there must be one.

- `docs/audits/AUDIT.md` §11.5

## 20. No secrets in the repository or the image, and seeds never touch production data

A live API key was committed to a public repository. The image copied the whole directory while the production key sat on disk. Production was seeded with an admin account whose password was `password123`, and the content seed deleted a real route's steps.

- `docs/audits/FINDINGS_WP9.md` §1, `docs/audits/AUDIT.md` §P2-1 and §P2-2, `docs/roadmap/ROADMAP_v3.md` §8, `docs/steps/STEP_37_CLOSE_THE_AUDIT.md` §0

## 21. CI runs every test suite

CI collected only `test/`. The engine tests, 76% of the total, never ran, and a green run deployed to production automatically. Here `pnpm test` runs every package through Turborepo, and CI runs it.

- `docs/audits/AUDIT.md` §P3-1, `docs/audits/FINDINGS_WP2.md` §1

## 22. A gate has no side door

The header's "Completar paso" button completed an exam step the student had just failed, and after one failed attempt there was no way to retake the exam.

- `docs/audits/AUDIT_2026-09-07.md` §2.1 and §2.2, `docs/steps/STEP_24_WP32_THE_GATE_HAS_A_SIDE_DOOR.md`

## 23. Behaviour is captured before it is ported

The platform ports v1 rules (grading, review scheduling, cost, spend limits) against fixtures recorded from the Ruby code, not from memory. Capturing them already found behaviour nobody had written down: a review of an existing card with stability 0 raises in Ruby, and a call refused by the daily budget still uses up a rate-limit slot. Each such case is a decision to keep or fix, made on purpose.

- `lib/tasks/characterize.rake` in v1, `packages/core/test/golden/` here
