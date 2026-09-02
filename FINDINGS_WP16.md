# WP-16 Findings

## Review corrections completed

- Remember-token recovery and initial owner promotion now serialize on the same PostgreSQL user-row
  lock. Recovery opens a transaction, selects the authoritative user `FOR UPDATE`, reloads and
  compares the digest only after acquiring the lock, and inserts the recovered session before the
  transaction releases that lock. Promotion acquires the same row lock before its idempotency
  check, token clearing, role change, and session deletion. Synchronized tests observe each losing
  backend in PostgreSQL's `Lock` wait state and prove both transaction orderings leave no replayable
  token or surviving recovered session.
- Owner promotion now clears the promoted account's persistent remember-token digest in the same
  transaction that changes its role and deletes its sessions. Regression coverage proves both an
  old session cookie and a replayed remember-me cookie cannot authenticate or create a new owner
  session. The idempotent current-owner path returns before revocation, preserving credentials
  issued after the original promotion.
- Purchase readiness is now calculated per route before user roll-up. A route must have completed
  generation and at least one step of its own; completed empty routes cannot borrow content from
  another incomplete route. User index and drill-down apply the same definition.
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

## Final integration review — 2026-09-01

The integration gate identified and corrected two additional WP-16 issues in separate commits:

- Promotion previously authenticated before acquiring the authoritative user-row lock. A
  concurrent password rotation could therefore commit while promotion waited, after which the
  stale credential could still receive owner privileges. Promotion now reloads and authenticates
  only after taking that row lock.
- Admin search and pagination used asynchronous Turbo navigation for ordinary GET requests, which
  made browser completion nondeterministic under suite load. Both transitions now use synchronous
  navigation and pass three repeated real-browser seeds.

No Critical or Important WP-16 finding remains after the final acceptance and targeted security
review. The older scope statement above describes the original WP-16 implementation session; the
subsequent integration and deployment activity is recorded by the repository's merge history and
deployment evidence.
