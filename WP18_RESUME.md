# WP-18 Route Purchases — resume / handoff

**Written:** 2026-09-02 (audit pass, then PROMPT-11 follow-up) · **Branch:** `wp18-route-purchases`
**Base:** `main` @ `4145290` · **Head:** `9b42577` · **Tree:** clean
**Not pushed. Not merged. Not deployed.**

Paste-ready context for continuing this work in another session.

---

## 1. What this pass was

You asked for an audit of the recent agent-written work, improvements applied, and this handoff.

Audited: the whole of `wp18-route-purchases` against `main` — 14 commits, ~7,470 lines. The only
other agent branch, `codex/security-reliability-hardening`, is a stale July branch already merged
into `main` (its worktree at `/private/tmp/learning-routes-security-hardening` is gone; prune it).

**Nine findings, all nine verified against the code before acting on any of them. Eight fixed and
committed, one documented for a decision (§5).** Two were verified against the current Lemon Squeezy
docs rather than from memory, and three were proven by reverting the fix and watching the new test
fail.

---

## 2. What was wrong, and what changed

Eight commits on top of `236b494`, each independently revertable.

| Commit | Severity | What was actually broken |
|---|---|---|
| `fca8319` | **High** | Bundler Audit was red on **five** advisories, not the one previously reported. Worst is `activestorage 8.1.3` — arbitrary file read + RCE in **variant processing**, which this app does. All five fix inside the Gemfile's existing ranges: no pin moved, `rails` stays `~> 8.1.2` and resolves to 8.1.3.1. Audit is now green. |
| `94ba7c2` | **High** | `order_created` was treated as proof of payment. Lemon Squeezy fires it for `pending` (PayPal can sit for days) and `failed` orders. `status` was recorded into evidence and **never asserted**, so a signed `order_created` with `status: "pending"` granted the entire route — modules unlocked, generation enqueued — for money never captured. Every existing test hardcoded `"paid"`. Also now rejects a blank provider order id, which passed the paid-needs-order CHECK and then collided on the *wrong* index, escaping as a 500. |
| `ce7d819` | **High** | The adapter read the order's `total` as the amount and compared it for equality against the quote. **`total` is post-tax** — the documented example is `subtotal: 999, tax: 200, total: 1199` — and Lemon Squeezy is merchant of record, so it collects VAT/sales tax. Every legitimately paid order from a taxed jurisdiction was rejected as `amount_mismatch`, 202'd, customer charged with no entitlement and no retry. Now uses `subtotal - discount_total`. Both test fixtures had *encoded the bug*: neither carried a `subtotal` at all and both set `tax: 0`. |
| `cf70652` | **High** | `claim!` commits before `apply!` runs, and only the single-paid race was rescued. Any other failure inside `apply!` became a 500 → provider retries → the claim from the *failed* attempt wins → every retry answered `duplicate_event` + 202, **forever**. Paid customer, unpaid purchase, no recovery. The idempotency guard was swallowing its own recovery mechanism. The claim is now released when nothing was written. |
| `f708a6c` | **High** | `credentials.dig(:lemon_squeezy, :test_mode).presence` — `false.blank?` is true, so `false.presence` is `nil` and a credentials value of `false` fell through to the ENV default and came back **`true`**. Live mode was unreachable via credentials, and an operator who set it would believe they were live while `mode_mismatch` rejected every real webhook. |
| `ae62268` | **Medium** | `RoutePurchase.generation_authorized?` was added in `236b494` specifically so a refunded route stops costing money — and had **zero callers**. Every gate still ran through `entitled?`, which counts `refunded`. A refunded customer kept unbounded authority to spend on tutor replies, voice evaluation, TTS and image generation. New `ModuleAccessPolicy.generation_allowed?` is wired only to the endpoints that enqueue AI work; reads are untouched, so the deferred no-revocation-on-refund ruling still holds. |
| `98e2fd1` | — | §3 below: the intermittent suite, root-caused. |
| `b2a5072` | **Low** | WP-18 added four new quote-blocking reasons; `admin.quotes.blocked.*` still defined two. The view renders with `default:`, so it never raised — it silently printed "No quote has been created" for all four, hiding the cause in the one screen an operator opens to diagnose it. Fixed in both locales, with a test that pins every emittable reason to a *distinct* label. |

Two low findings were verified and folded into the commits above rather than tracked separately: the
order `identifier` being written into `provider_checkout_id` (it is the **order's** UUID, not a
checkout id — recovered rows could never be reconciled; now nil, and the column is nullable), and
the blank-order-id index collision.

---

## 3. The intermittent suite is solved — it was never a code defect

The previous handoff flagged this as the thing to fix first: ~18% red, different symptom every time,
"NOT root-caused".

**Root cause: two `bin/rails test` processes sharing one test database.** Five classes set
`use_transactional_tests = false` to exercise real concurrent connections. They *commit* rows and
delete them in teardown. A second suite running at the same time sees those rows appear and vanish
underneath it — surfacing as `PG::ForeignKeyViolation` on an id that existed moments earlier, or as
the reported `StrictLoadingViolationError` on a cascade that suddenly had rows to load.

Evidence: a 28-seed sweep run *while a second suite was active* failed on 6 seeds (21%, matching the
reported rate). **All six — 116, 117, 118, 120, 121, 127 — pass cleanly re-run one at a time.**

Recorded in `test/test_helper.rb` so nobody re-investigates it. Three classes made it far worse by
opening with `Core::User.first || create!`, adopting whatever user happened to exist; each now owns
its user. That also removed a latent strict-loading violation in
`WizardRouteGenerationJobTest#creates learning profile for new user`.

**The acceptance gate in Task 12 can be trusted, provided you run one suite at a time.**

---

## 4. Current state

| Check | Result |
|---|---|
| Main suite | **496 runs, 2027 assertions, 0F 0E** |
| Browser suite | **7 runs, 57 assertions, 0F 0E** |
| Combined (incl. engines) | **832 runs, 3045 assertions, 3F 1E** — the same four pre-existing engine failures, by name |
| RuboCop | 528 files, no offenses |
| Bundler Audit | **No vulnerabilities found** (was red) |
| Brakeman | 1 medium, 2 ignored — unchanged pre-existing `block_attempts_controller.rb:81` `permit!` |

The four permitted combined-suite failures, unchanged: `GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

---

## 5. The one finding NOT fixed — needs your decision

**An abandoned checkout makes a route permanently unbuyable.** Verified end to end:

- `CheckoutCreator#active_quote` only accepts `attachment_state: "unattached"`.
- `RouteQuote#attach!` is one-way: `unattached → checkout → purchase`, with no path back.
- `RouteQuoteBuilder`'s **only** caller anywhere is `WizardRouteGenerationJob`, at route creation.

So: user clicks buy → quote moves to `checkout` → they close the tab → the next attempt finds no
unattached quote → `no_quote` ("This route does not have a price yet. Try again in a moment.")
forever. Nothing ever re-quotes. The same dead end arrives via `quote_expired` after 24h, whose
message ("Refresh the page to get a new one") is untrue.

I did not fix it because the fix is a pricing-policy decision, not a bug fix. Options:

1. **Reuse an unexpired `checkout`-state quote** when it has no paid purchase — the returning
   customer gets exactly the price they were quoted. Smallest change, no new pricing behaviour,
   but does not help once the quote expires.
2. **Re-quote on demand** in `CheckoutCreator` when no usable quote exists. Handles expiry too, but
   the price can now move between two attempts, which is the thing quote immutability exists to
   prevent.
3. Both: reuse while unexpired, re-quote after.

My recommendation is **3**, but it changes customer-visible pricing behaviour, so it is yours to
call. It should land before Task 11 (customer purchase panel), which is the screen that will expose
this to real users.

---

## 6. Still to do — 5 of 14 tasks

Task 8 (paid-module generation), 9 (refunds), 10 (owner-dashboard commerce facts), 11 (customer
purchase panel), 12 (acceptance gate + handoff docs). Full step text is in
`docs/superpowers/plans/2026-09-02-wp18-route-purchases.md`.

Rulings that still bind future work:

1. **Refunds must not revoke read access** — `entitled?` = `paid OR refunded`. That half is
   unchanged. The *other* half is now enforced: **Task 8 must use `generation_allowed?` /
   `generation_authorized?` in `ContentPrefetcher`**, matching `ae62268`.
2. **Task 6 recovers rather than rejects** when a pending purchase row is missing, gated behind
   every other validation passing — otherwise a customer is charged and gets nothing.
3. **Task 9 must route `order_refunded` to `RefundProcessor` *before* `OrderProcessor` sees it**,
   with a test proving a refund is not swallowed as a duplicate. `OrderProcessor` claims every
   signed event, so if it saw a refund first it would consume that identity.
4. `PaidModuleGenerationJob` is still an empty body (Task 8). Note that `cf70652` releases the claim
   only for failures *inside* `apply!`; a failure in `perform_later` after the purchase is paid
   leaves the purchase correct but the job unenqueued. Task 8 owns that retry.

---

## 7. Blockers before this can go live

- **Real-provider verification is still impossible on this branch.** Fail-closed is working as
  designed, but no Lemon Squeezy values exist, so quoting refuses and every webhook is rejected.
  You need, credentials-first (`Rails.application.credentials.dig(:lemon_squeezy, …)` with ENV
  fallback): fee percentage/fixed/version for the approved store, plus store/product/variant IDs,
  API key and signing secret. **`f708a6c` is a prerequisite** — before it, setting `test_mode: false`
  in credentials silently did nothing.
- **`total` vs `subtotal` (`ce7d819`) should be re-confirmed against a real test-mode order** the
  first time one is placed with tax applied. The fix follows the documented order object, but this
  is money and deserves one live confirmation.
- Production is still running a Docker image from 2026-04-28. See `AUDIT.md`; unrelated to WP-18 but
  it means none of this is deployed.

---

## 8. Environment gotchas

- Always `env -u RAILS_MASTER_KEY bin/rails test …` or the suite dies with `MessageEncryptor::InvalidMessage`.
- `bin/rails test` **excludes** `test/system`; run the browser suite separately.
- **Run one suite at a time** — see §3.
- `config.active_record.schema_format = :sql` — `db/structure.sql` is authoritative, `db/schema.rb` is stale.
- `pg_dump` default is 14.20, server is 17.7; put the `postgresql@17` keg first on PATH before regenerating structure dumps.
- `minitest/mock` stubbing is unavailable; use singleton/instance-method swaps with `ensure`-guarded restore.
- `strict_loading_by_default` is on, mode `:all`, `:raise` in test.
- Editing `app/assets/tailwind/application.css` does nothing until `tailwindcss:build` runs.
- Reading an enum column via `pluck`/`pick` returns the **label string**, not the integer.

---

## 9. To continue

```bash
cd ~/Documents/Learning-routes && git checkout wp18-route-purchases
git worktree prune                                                  # drops the stale codex worktree
cat .superpowers/sdd/2026-09-02-wp18-route-purchases/progress.md    # ledger, rulings, deferred findings
sed -n '/^## Task 8:/,/^## Task 9:/p' docs/superpowers/plans/2026-09-02-wp18-route-purchases.md
```

Decide §5 first — it gates Task 11. Then Tasks 8 → 12 in order, honouring §6.

---

## 10. PROMPT-11 follow-up (four commits after `51b0b45`)

### §A — lesson generation was authorized by the READ policy

`ae62268` wired `generation_allowed?` into five endpoints. Its own docstring
enumerated "tutor replies, voice evaluation, TTS, image generation" — the finding's
words, not a sweep — and `StepsController`, which drives `lesson_content`, was not in
it. **Seven** further enqueue sites were riding on the read answer. `6e348c9` gates six
of them; `9b42577` gates the seventh, `Assessments::ResultsController#submit`, found
only by sweeping every `perform_later` in the app.

**Live financial exposure before the fix was smaller than the finding implied, and the
report says so.** Every content job independently self-guards with
`return unless step.preview_access?` — ContentPipelineJob, ContentGenerationJob,
AssessmentGenerationJob, StepQuizGenerationJob, AudioGenerationJob,
SectionAudioGenerationJob, MediaPrefetchJob. A refunded route's modules sit in
`purchased`, never `preview`, so all of those no-opped. The three jobs with no
job-level guard (TutorReplyJob, SectionImageJob, VoiceEvaluationJob) were already
controller-gated by `ae62268`. The one genuinely live leak was the gap-analysis path,
which is exactly the site the docstring's list would never have found.

**The exposure becomes real the moment Task 8 lands**, because Task 8's whole job is to
relax `preview_access?` to include `purchased` — and a refunded purchase leaves its
modules in `purchased`. Widening that guard without an entitlement check re-opens all
seven sites at once.

`ContentPrefetcher`'s preview filter is now documented as a spend boundary rather than
a display rule, with `content_prefetcher_scope_test.rb` failing if Task 8 widens it
without bringing an entitlement check.

A refunded student on a step with no content sees a new `content_unavailable` state —
not `content_failed` ("we couldn't build this lesson", plus a retry button: both untrue)
and not a spinner (the poll endpoint re-runs `load_step_content`, so it would poll every
3s against a decision that never changes).

### §B — a discount code would charge the customer and refuse the route

Policy unchanged and correct. What changed is that it is now diagnosable: `discount_total`
is carried through the port as its own field and the ladder names
`discount_not_supported` ahead of the amount check. All 14 rejection reasons have
distinct labels in both locales, so Task 10 inherits a complete set.

**OPERATOR NOTE — do not create a discount code in the Lemon Squeezy dashboard.** A
checkout is created with an exact `custom_price` from the quote, so any discount makes the
customer pay less than quoted; that order is charged by the provider and then refused
here, leaving the customer paid and un-entitled. The same note renders on the admin route
screen (`admin.commerce_notes.discounts_unsupported`).

### §C — the quote dead end is closed

`CheckoutCreator` now resolves a price in three steps: resume an unexpired `checkout`
quote with no paid purchase; else use an unexpired `unattached` one; else mint a new one.
`RouteQuoteBuilder` having exactly one caller was the structural cause, and it now has two.

**Honour window: 30 days**, `Rails.application.config.x.commerce_quote_honour_window`,
overridable via credentials `commerce.quote_honour_window_days` or
`COMMERCE_QUOTE_HONOUR_WINDOW_DAYS`. Chosen because re-quoting an unchanged route is
deterministic — the number only moves when the owner changes `PricingConstants`, ships a
new `estimator_version`, or provider rates change, all of them owner deploys. So the window
costs nothing except in the one case it exists for: a customer who saw a price shortly
before a deliberate rise. Bounded so a year-old quote can never bind us.

The honoured price is re-issued as a NEW snapshot carrying the old pricing, not by reviving
the old row — snapshots are immutable and an expired quote must stay expired. If the old
pricing no longer validates (exactly when the owner has changed `PricingConstants`), the
fresh quote stands, because that is a deliberate price change. Honouring cuts both ways: a
lower re-quote is passed on.

Copy fixed: `quote_expired` told users to refresh the page, which could not help;
`no_quote` said the route had no price "yet". The reasons are now `pricing_unavailable`
and `no_paid_modules`, both truthful, both locales.

### Also fixed, found on the way

`Assessments::ResultsController#set_result` did a bare `find` while `submit`'s first line
is `@result.assessment` — a strict-loading violation on **every assessment submission**,
invisible because production only logs violations and no test had ever reached the action.
It now eager-loads the chain `submit` walks.

### Verification

| Suite | Before (`51b0b45`) | After (`9b42577`) |
|---|---|---|
| Main | 496 runs, 0F 0E | **522 runs, 2161 assertions, 0F 0E** |
| Browser | 7 runs, 0F 0E | **7 runs, 57 assertions, 0F 0E** |
| Combined | 832 runs, 3F 1E | **858 runs, 3179 assertions, 3F 1E** |
| RuboCop | clean | **531 files, no offenses** |

Combined failures are the intersection of 3 consecutive runs and are the same four
pre-existing engine failures by name, untouched:
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

Every fix was proven by reverting the source with the new tests in place: all 6 §A
enqueue sites, all 7 §C lifecycle tests, and the §B and gap-analysis tests fail without it.
