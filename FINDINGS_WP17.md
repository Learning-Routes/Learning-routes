# WP-17 Findings

## Resolved

- Important: legacy journey and review indexes exposed paid-step titles/links. Fixed in `3f1aa03` with a failing regression test and preview-module SQL filters.
- Important: customer and alternate content endpoints previously authorized only route ownership. Fixed in `99e6656` with a shared persisted module policy and hard 403 coverage across formats and engines.
- Important: unverified non-owner accounts were redirected before the private admin authorization boundary instead of receiving a hard 403. Fixed in `0e7608b`; anonymous, student, teacher, and unverified users now exercise the same owner-only boundary.
- Test-quality: raw response scans mistook CSP/CSRF and asset metadata for customer-facing commerce claims. Fixed in `a8b5afc` by inspecting rendered document text while retaining raw-response secret checks.
- Browser reliability: Turbo and field-state races made search, pagination, drill-down, and sign-in assertions nondeterministic. Fixed in `0e7608b`, `f9156c6`, `cdb9b5e`, and `faa85cb`; ten consecutive browser seeds passed.

## Remaining risks and manual checks

- The combined suite retains four pre-existing Learning Routes generation failures listed in `WP17_HANDOFF.md`; they remain out of scope.
- Brakeman retains the pre-existing medium-confidence block-parameter `permit!` warning. The endpoint is now module-authorized, but exact block key allowlisting should be handled in its own compatibility-tested hardening work.
- Importmap reports five moderate and one low advisory for pinned DOMPurify/Mermaid versions. Dependency-pin changes were explicitly out of scope.
- Fee configuration is deliberately absent by default. Before WP-18, verify the approved store/account percentage, fixed fee, version, and jurisdiction assumptions; missing configuration blocks quote creation.
- Run migration/backfill rehearsal on a production-shaped sanitized database before deployment. WP-17 did not access or mutate production.
- Customer quote price UI, payment state, revenue, provider fees, refunds, profit, and paid generation are intentionally deferred; the dashboard must continue showing none until real WP-18 records exist.

Final targeted requirements/security review found no remaining Critical or Important WP-17 finding after `faa85cb`. The known engine, Brakeman, and importmap baselines are unchanged and explicitly outside WP-17 scope.
