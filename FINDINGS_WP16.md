# WP-16 Findings

## Review corrections completed

- Comment moderation still called the removed `admin?` predicate. Owner moderation now uses
  `owner?`, students receive 403, and comment destruction no longer fails under strict loading.
- AI cost alerts contained a committed administrative recipient. Alerts now resolve the sole
  owner account and enqueue no email when an owner does not exist.
- User route drill-down initially loaded every route. It now pages at 25 routes, capped at 100.
- Route cost initially omitted the route's primary `ai_interaction_id`, cast arbitrary metadata to
  UUID, and displayed unpriced usage as zero. It now includes primary and metadata attribution
  once, compares malformed metadata safely, and labels completed unpriced interactions.
- User detail now exposes real basic account state: role, email verification, and onboarding.
- Query-count tests now prove exact fixed counts: two queries for the user index and five for the
  user drill-down at both small and 30-record volumes.

All Critical and Important review findings were corrected in separate tested commits. No open
Critical or Important WP-16 finding remains.

## Deferred commerce fields

WP-16 has no commerce source records. The dashboard therefore does not present buyer/non-buyer,
payment state, purchases, quotes, prices, refunds, revenue, fees, or profit. The query result
objects carry only a false `commerce_available` extension seam. WP-17/WP-18 must extend these
queries and presenters after authoritative commerce records exist; they must not create a second
owner dashboard.

## Existing baseline failures and advisories

The combined suite consistently retains these twelve pre-existing tests:

- `ContentEngine::AudioControllerTest#test_serves_valid_audio_belonging_to_the_signed-in_user`
- `ContentEngine::AudioControllerTest#test_forbids_a_different_user_from_accessing_the_step_audio`
- `ContentEngine::AudioControllerTest#test_returns_not_found_for_a_missing_stored_audio_file`
- `ContentEngine::AudioControllerTest#test_rejects_audio_in_a_sibling_directory_with_the_same_prefix`
- `ContentEngine::SectionAudioControllerTest#test_serves_a_valid_cached_section_MP3`
- `ContentEngine::SectionAudioControllerTest#test_forbids_a_different_user_from_accessing_section_audio`
- `ContentEngine::SectionAudioControllerTest#test_evicts_a_sibling-prefix_cache_entry_without_deleting_the_outside_file`
- `ContentEngine::SectionAudioControllerTest#test_evicts_and_removes_an_undersized_MP3_inside_the_sections_root`
- `LearningRoutesEngine::GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`
- `LearningRoutesEngine::ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`
- `LearningRoutesEngine::RouteGenerationJobTest#test_generates_route_and_creates_steps`
- `LearningRoutesEngine::RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`

Importmap audit retains the explicitly deferred six advisories: one moderate DOMPurify advisory,
plus four moderate and one low Mermaid advisories. Dependency pins were not changed.

Brakeman 8.0.4 retains one unrelated medium-confidence warning at
`engines/learning_routes_engine/app/controllers/learning_routes_engine/block_attempts_controller.rb:81`
for the pre-existing `params.fetch(:block, {}).permit!`. It is not in an owner/admin path and was
not changed because unrelated engine work is outside WP-16.

## Remaining operational risks

- The migrations and concurrent promotion test were exercised only against local PostgreSQL;
  no production migration or promotion was attempted.
- Owner availability depends on the sole account remaining recoverable. There is deliberately no
  public fallback or second owner.
- Audit events store SHA-256 digests of IP address and user agent, not raw values or secrets.
  Retention policy remains an operational decision.
- Exact AI totals remain incomplete whenever WP-7 ledger rows are explicitly unpriced; the UI
  reports the unpriced count and never converts it to fabricated cost.
- Local VIPS emits optional HEIF/OpenSlide dynamic-library warnings. They do not affect WP-16.

No production access, merge, push, deployment, dependency update, or WP-17 work occurred.
