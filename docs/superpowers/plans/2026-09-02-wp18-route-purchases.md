# WP-18 Route Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell every paid module of one route in a single Lemon Squeezy one-time payment, and unlock and generate that content only after a signature-verified, idempotent `order_created` webhook.

**Architecture:** A narrow `Commerce::PaymentProvider` port hides Lemon Squeezy behind two operations — create a custom-price checkout from an immutable quote, and verify/normalize an inbound provider event. `Commerce::RoutePurchase` is the durable entitlement; `Commerce::ProviderEvent` is the replay guard. Access stays in `LearningRoutesEngine::ModuleAccessPolicy`, extended from "preview only" to "preview, or a module whose route has a paid purchase". Money keeps WP-17's integer/`Rational` discipline throughout, and every provider input is validated against the local quote before anything is written.

**Tech Stack:** Rails 8.1, PostgreSQL (schema format `:sql`, `db/structure.sql` is authoritative), Minitest, Active Job / Solid Queue, Rack::Attack, ERB + I18n (en/es), Capybara/Selenium, WP-7 exact microcent pricing.

**Spec:** `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`

**Base:** branch `wp18-route-purchases`, created from `main` at `4145290aa3aac5b042c62bfb0b0ee5fe99a782bb` (Merge WP-17). Required ancestors verified: `a4e4cf6` (Merge WP-16), `4145290`.

## Global Constraints

- Currency is USD only. Monetary truth uses `Integer`, `Rational`, or `BigDecimal`. Binary `Float` is never persisted or compared as money.
- A purchase covers **all** paid modules of exactly one route. One-time payment, never a subscription. Never sell a single module.
- Exactly one module per route is the permanent free preview and is never sold.
- Paid content stays server-locked until a verified entitlement exists. A browser success redirect is never proof of payment.
- Owners inspecting metadata through `/admin` never acquire customer entitlement. Owner customer access derives only from `LearningProfile#user_id` ownership plus preview/entitlement — never from the `owner` role.
- Webhooks are authenticated on the **raw request body** before any business field is parsed, and are replay-safe, idempotent, and concurrency-safe.
- A quote in `attachment_state` `checkout` or `purchase` is immutable and is never superseded.
- Missing configuration fails closed: no quote, no checkout, no entitlement. Never substitute zero or a default fee schedule.
- No live provider calls in tests. No Lemon Squeezy call of any kind from this branch — `Commerce::Providers::Fake` is the only adapter exercised.
- Never expose internal AI cost, fee assumptions, markup, provider secrets, answer keys, or locked content to customers.
- Extend the existing WP-16 owner dashboard through its `commerce_available` seam. Do not create a second dashboard.
- Do not fabricate revenue, fees, refunds, or profit. Display only persisted provider/payment facts, and label an estimated fee as estimated.
- Every new user-visible string goes through I18n in **both** `config/locales/en.yml` and `config/locales/es.yml`.
- Every new query eager-loads its associations. `strict_loading_by_default` is on.
- Run every test command as `env -u RAILS_MASTER_KEY bin/rails test ...`. The production key in the shell poisons the test env with `MessageEncryptor::InvalidMessage`.
- Migrations are plain Rails migrations; after each, run `env -u RAILS_MASTER_KEY bin/rails db:migrate` and commit the regenerated `db/structure.sql`. Never hand-edit `db/structure.sql`.
- Enum integers are never hardcoded in raw SQL. Use `Model.states[:name]` interpolation or the string value.
- Do not amend, squash, rebase, merge, push, or deploy. Do not change dependency pins. Do not access production. Do not fix the four documented combined-suite failures. Do not start WP-19.

## Verified baselines (measured on `4145290`, 2026-09-02)

Any deviation from these is a regression introduced by this branch.

| Suite | Command | Baseline |
|---|---|---|
| Main | `env -u RAILS_MASTER_KEY bin/rails test` | 402 runs, 1669 assertions, 0F 0E |
| Browser | `env -u RAILS_MASTER_KEY bin/rails test test/system` | 7 runs, 55 assertions, 0F 0E **when green** — see Task 0b |
| Combined | `env -u RAILS_MASTER_KEY bin/rails test test engines/*/test` | 738 runs, 2685 assertions, 3F 1E |

The combined suite's four permitted failures, by exact name:

- `LearningRoutesEngine::GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`
- `LearningRoutesEngine::ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`
- `LearningRoutesEngine::RouteGenerationJobTest#test_generates_route_and_creates_steps`
- `LearningRoutesEngine::RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`

Security baselines: Brakeman 8.0.4 — 1 medium Mass Assignment at `engines/learning_routes_engine/app/controllers/learning_routes_engine/block_attempts_controller.rb:81`, 2 ignored. Importmap — 6 advisories (5 moderate, 1 low), all Mermaid/DOMPurify. Bundler Audit — **1 unresolved advisory**: `rails-html-sanitizer 1.7.0`, CVE-2026-73648, fixed in `>= 1.7.1`. The owner has not authorized a pin change; record it in the handoff, do not upgrade, and do not let it silently disappear.

## File structure

**New — `Commerce` (host app):**

| File | Responsibility |
|---|---|
| `app/services/commerce/pricing_constants.rb` | The only definition of markup basis points and the per-paid-module minimum. |
| `app/services/commerce/estimator_configuration.rb` | Builds the `configuration:` hash `RouteCostEstimator` consumes, from persisted modules plus configured rates and call shapes. |
| `app/models/commerce/route_purchase.rb` | Durable entitlement and payment state. |
| `app/models/commerce/provider_event.rb` | Replay guard and normalized provider evidence. |
| `app/services/commerce/payment_provider.rb` | The port: `create_checkout`, `verify_event`, plus `Unavailable`. |
| `app/services/commerce/providers/lemon_squeezy.rb` | The only real adapter. Credentials-first config, raw-body HMAC verification. |
| `app/services/commerce/providers/fake.rb` | Test adapter. Never reaches the network. |
| `app/services/commerce/checkout_creator.rb` | Quote → checkout → pending purchase, in one transaction. |
| `app/services/commerce/order_processor.rb` | Verified event → paid purchase → entitlement → generation, idempotent. |
| `app/services/commerce/refund_processor.rb` | Verified refund event → refunded purchase and actual fee. |
| `app/controllers/commerce/checkouts_controller.rb` | Customer checkout endpoint. |
| `app/controllers/commerce/webhooks_controller.rb` | Provider webhook endpoint. CSRF-exempt, raw body. |
| `app/jobs/commerce/paid_module_generation_job.rb` | Idempotent post-payment generation fan-out. |
| `app/queries/admin/commerce_summary_query.rb` | Bounded revenue/fee/profit facts for the owner dashboard. |

**Modified:**

| File | Change |
|---|---|
| `app/services/commerce/route_quote_builder.rb` | Read constants from `PricingConstants`. |
| `app/services/commerce/lemon_squeezy_fee_estimator.rb` | Markup comes from `PricingConstants`, not a baked-in `3/2`. |
| `app/services/commerce/route_cost_estimator.rb` | Narrow the `KeyError` rescue to configuration lookup only. |
| `app/models/commerce/route_quote.rb` | Constants from `PricingConstants`; `has_one :route_purchase`; attachment transitions. |
| `app/jobs/wizard_route_generation_job.rb` | Attempt quoting after the outline persists; record the block reason on failure. |
| `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb` | Entitlement-aware access and cache key. |
| `app/queries/admin/dashboard_summary_query.rb`, `app/queries/admin/user_detail_query.rb` | Flip `commerce_available` and add real commerce columns. |
| `config/routes.rb`, `config/initializers/rack_attack.rb`, `config/initializers/commerce.rb` | Endpoints, throttles, provider config. |
| `config/locales/en.yml`, `config/locales/es.yml` | All new copy. |
| `test/system/owner_dashboard_test.rb` | Task 0b determinism fix. |

---

## Task 0a: Single source for pricing constants, and a narrow estimator rescue

Approved debt fix. `299` appears in `route_quote_builder.rb` twice and `route_quote.rb` once; `5000` in both. Worse, `markup_basis_points: 5000` is snapshotted on every quote but **never read** — `LemonSqueezyFeeEstimator` bakes 1.5× into `Rational(ai_cost_microcents * 3, 2 * MICROCENTS_PER_CENT)`. Changing the constant would make the snapshot lie while the price stayed put. Separately, `RouteCostEstimator#call` wraps its whole body in `rescue KeyError`, so a real bug in `estimate_microcents` is reported to the caller as `pricing_configuration_missing`.

**Files:**
- Create: `app/services/commerce/pricing_constants.rb`
- Create: `test/services/commerce/pricing_constants_test.rb`
- Modify: `app/services/commerce/lemon_squeezy_fee_estimator.rb`
- Modify: `app/services/commerce/route_quote_builder.rb:44,53`
- Modify: `app/models/commerce/route_quote.rb:24-25`
- Modify: `app/services/commerce/route_cost_estimator.rb:22-38`
- Modify: `test/services/commerce/lemon_squeezy_fee_estimator_test.rb`
- Modify: `test/services/commerce/route_cost_estimator_test.rb`

**Interfaces:**
- Produces: `Commerce::PricingConstants::MARKUP_BASIS_POINTS` (Integer `5000`), `Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS` (Integer `299`), `Commerce::PricingConstants::BASIS_POINTS_SCALE` (Integer `10_000`), and `Commerce::PricingConstants.apply_markup(microcents)` returning marked-up **cents** as an `Integer`.
- Consumes: `AiOrchestrator::CostTracker::MICROCENTS_PER_CENT` (Integer `10_000`).

- [ ] **Step 1: Write the failing test**

Create `test/services/commerce/pricing_constants_test.rb`:

```ruby
require "test_helper"

class Commerce::PricingConstantsTest < ActiveSupport::TestCase
  PC = Commerce::PricingConstants

  test "the approved constants are exactly the spec values" do
    assert_equal 5000, PC::MARKUP_BASIS_POINTS
    assert_equal 299, PC::MINIMUM_PRICE_PER_PAID_MODULE_CENTS
    assert_equal 10_000, PC::BASIS_POINTS_SCALE
  end

  # The whole point of the extraction: the constant must DRIVE the arithmetic,
  # not merely be snapshotted beside it.
  test "apply_markup derives the multiplier from MARKUP_BASIS_POINTS" do
    # 1_000_000 microcents = 100 cents; +50% = 150 cents.
    assert_equal 150, PC.apply_markup(1_000_000)
  end

  test "apply_markup ceilings rather than truncating" do
    # 1 microcent marked up is 1.5 microcents = 0.00015 cents -> ceil -> 1 cent.
    assert_equal 1, PC.apply_markup(1)
    assert_equal 0, PC.apply_markup(0)
  end

  test "apply_markup never produces a Float" do
    assert_kind_of Integer, PC.apply_markup(123_456_789)
  end

  test "apply_markup rejects negative and non-integer input" do
    assert_raises(ArgumentError) { PC.apply_markup(-1) }
    assert_raises(ArgumentError) { PC.apply_markup(1.5) }
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/pricing_constants_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::PricingConstants`.

- [ ] **Step 3: Write the constants module**

Create `app/services/commerce/pricing_constants.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # The approved pricing constants, defined exactly once.
  #
  # These were duplicated across RouteQuoteBuilder, RouteQuote and (implicitly)
  # LemonSqueezyFeeEstimator, which baked the 50% markup in as a literal 3/2. A
  # quote therefore SNAPSHOTTED markup_basis_points: 5000 while the arithmetic
  # ignored it: changing the constant would have made every snapshot lie without
  # moving a single price. The multiplier is now derived from the constant.
  module PricingConstants
    BASIS_POINTS_SCALE = 10_000

    # 50% markup over estimated full-route AI cost (spec: "Quotes").
    MARKUP_BASIS_POINTS = 5000

    # USD 2.99 per paid module (spec: "Quotes").
    MINIMUM_PRICE_PER_PAID_MODULE_CENTS = 299

    # Marked-up AI cost, in whole cents, rounded UP so a fraction of a cent is
    # never absorbed by us. Exact integer arithmetic via Rational; no Float.
    def self.apply_markup(microcents)
      unless microcents.is_a?(Integer) && microcents >= 0
        raise ArgumentError, "markup requires a non-negative integer microcent amount"
      end

      multiplier = BASIS_POINTS_SCALE + MARKUP_BASIS_POINTS
      Rational(
        microcents * multiplier,
        BASIS_POINTS_SCALE * AiOrchestrator::CostTracker::MICROCENTS_PER_CENT
      ).ceil
    end
  end
end
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/pricing_constants_test.rb`
Expected: PASS, 5 runs.

- [ ] **Step 5: Point the fee estimator at the constant**

In `app/services/commerce/lemon_squeezy_fee_estimator.rb`, replace the `marked_up` and `gross` lines inside `self.call`:

```ruby
      marked_up = PricingConstants.apply_markup(ai_cost_microcents)
      gross = Rational(
        (marked_up + fixed_cents) * PricingConstants::BASIS_POINTS_SCALE,
        PricingConstants::BASIS_POINTS_SCALE - percentage_basis_points
      ).ceil
      fee = Rational(gross * percentage_basis_points, PricingConstants::BASIS_POINTS_SCALE).ceil + fixed_cents
```

and replace the `9_999` literals in its guard clause with `PricingConstants::BASIS_POINTS_SCALE - 1`.

- [ ] **Step 6: Point the builder and the model at the constant**

In `app/services/commerce/route_quote_builder.rb`, inside `persist_quote`:

```ruby
      minimum = (module_count - 1) * PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS
      final = [gross.gross_cents, minimum].max
      estimated_fee = Rational(
        final * fee.percentage_basis_points, PricingConstants::BASIS_POINTS_SCALE
      ).ceil + fee.fixed_cents
```

and in the `RouteQuote.create_snapshot!` argument list:

```ruby
        markup_basis_points: PricingConstants::MARKUP_BASIS_POINTS,
        minimum_price_per_paid_module_cents: PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
```

In `app/models/commerce/route_quote.rb`:

```ruby
    validates :markup_basis_points,
      inclusion: { in: [Commerce::PricingConstants::MARKUP_BASIS_POINTS] }
    validates :minimum_price_per_paid_module_cents,
      inclusion: { in: [Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS] }
```

Leave the PostgreSQL `route_quotes_approved_markup` and `route_quotes_approved_minimum` CHECK constraints alone. They are the database's independent statement of the approved values and must stay literal.

- [ ] **Step 7: Narrow the estimator rescue**

In `app/services/commerce/route_cost_estimator.rb`, delete the method-level `rescue KeyError` (lines 36-38) and wrap only the configuration lookups. Replace `call` with:

```ruby
    def call
      shape = RouteShape.new(route: @route, configuration: @configuration)
      catalog = ProviderRateCatalog.new(@configuration)
      missing = base_missing + shape.missing + shape.calls.flat_map { |call| catalog.missing_for(call) }
      return Unavailable.new(reason: "pricing_configuration_missing", missing: missing.uniq.sort) if missing.any?

      # A KeyError from here IS a bug, not missing configuration: `missing` above
      # already proved every required key is present. Letting it raise is the point.
      Available.new(
        cost_microcents: shape.calls.sum { |call| catalog.estimate_microcents(call) },
        estimator_version: @configuration.fetch(:estimator_version),
        provider_rate_versions: catalog.versions_for(shape.calls),
        provider_rate_assumptions: catalog.rate_assumptions_for(shape.calls),
        route_shape_assumptions: shape.snapshot,
        image_quality: @configuration.fetch(:image_quality)
      )
    end
```

- [ ] **Step 8: Add the regression test proving a real bug is no longer mislabelled**

Append to `test/services/commerce/route_cost_estimator_test.rb`:

```ruby
  test "a genuine internal KeyError is raised, not reported as missing configuration" do
    configuration = valid_configuration
    catalog = Commerce::ProviderRateCatalog.new(configuration)
    Commerce::ProviderRateCatalog.stub(:new, catalog) do
      catalog.stub(:estimate_microcents, ->(_call) { raise KeyError, "internal defect" }) do
        assert_raises(KeyError) do
          Commerce::RouteCostEstimator.call(route: @route, configuration: configuration)
        end
      end
    end
  end
```

If `valid_configuration` does not already exist in that file, extract the existing happy-path configuration hash into a private `valid_configuration` helper first and have the existing tests use it.

- [ ] **Step 9: Run the focused commerce suite**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce test/services/commerce`
Expected: PASS, 0 failures, 0 errors. Baseline was 98 runs across the wider focused set; this narrower set must be fully green.

- [ ] **Step 10: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce app/models/commerce/route_quote.rb test/services/commerce
git commit -m "fix(commerce): derive pricing from one constant and stop mislabelling defects"
```

---

## Task 0b: Make the owner dashboard browser test deterministic

Approved debt fix and a gate prerequisite. `test/system/owner_dashboard_test.rb` fails in roughly half of runs — measured 4 red in 8 runs on an idle machine (3 failures at `assert_current_path student_path, wait: 5`, 1 error). `FINDINGS_WP17.md` records this as fixed with "ten consecutive browser seeds passed"; it is not. The WP-18 acceptance gate rests on browser evidence for payment behaviour, so this must be trustworthy before it can gate anything.

**Files:**
- Modify: `test/system/owner_dashboard_test.rb:25-40`

**Interfaces:** none. Test-only.

- [ ] **Step 1: Reproduce and capture the failure**

Run: `for i in 1 2 3 4 5 6; do env -u RAILS_MASTER_KEY bin/rails test test/system/owner_dashboard_test.rb 2>&1 | grep -E "^[0-9]+ runs"; done`
Expected: at least one run with `1 failures` or `1 errors`. Record the exact count of red runs out of six — this is the "before" number for the handoff.

- [ ] **Step 2: Read the failing assertion and identify the race**

The sequence at `test/system/owner_dashboard_test.rb:25-31` is:

```ruby
    find("a[href='#{student_path}']").click
    assert_current_path student_path, wait: 5
```

`find(...).click` returns as soon as the click dispatches. Turbo then navigates. `assert_current_path` polls `page.current_path`, which under Selenium reads the driver's URL — that can still be the old URL when the poll starts, and the 5s budget is shared with a suite-loaded browser. The already-applied WP-17 fixes changed *other* transitions to synchronous navigation but left this one as a click.

- [ ] **Step 3: Replace the click race with an explicit content wait, then a path assertion**

Replace lines 25-31 of `test/system/owner_dashboard_test.rb` with:

```ruby
    assert_text @student.email
    student_path = admin_user_path(@student)
    assert_link @student.name, href: student_path

    # Assert on rendered CONTENT first: Capybara's text matchers wait on the DOM,
    # whereas assert_current_path polls the driver's URL and can start before Turbo
    # has swapped the body. The path assertion then confirms the URL settled.
    find("a[href='#{student_path}']").click
    assert_selector "h1", text: @student.name, wait: 10
    assert_current_path student_path, wait: 10
    assert_text "Browser Route"
```

- [ ] **Step 4: Prove determinism over ten consecutive runs**

Run: `for i in $(seq 1 10); do env -u RAILS_MASTER_KEY bin/rails test test/system/owner_dashboard_test.rb 2>&1 | grep -E "^[0-9]+ runs"; done`
Expected: ten lines, every one `3 runs, 27 assertions, 0 failures, 0 errors, 0 skips`. If any run is red, the race is elsewhere — do not raise the timeout further; find it and fix the cause.

- [ ] **Step 5: Run the whole browser suite three times**

Run: `for i in 1 2 3; do env -u RAILS_MASTER_KEY bin/rails test test/system 2>&1 | grep -E "^[0-9]+ runs"; done`
Expected: three lines, each `7 runs, 55 assertions, 0 failures, 0 errors, 0 skips`.

- [ ] **Step 6: Inspect and commit**

```bash
git diff
git diff --check
git add test/system/owner_dashboard_test.rb
git commit -m "test(admin): wait on rendered content before asserting the drill-down path"
```

---

## Task 1: Estimator configuration and quote creation wiring

`Commerce::RouteQuoteBuilder` has no caller anywhere in `app/`, `engines/`, `lib/` or `config/` — it appears only in its own test. `RouteCostEstimator` reads the entire route shape from a `configuration:` hash that nothing constructs. So no quote can exist today, and without a quote there is nothing for a checkout to attach to. This task makes quoting reachable and fail-closed.

`Commerce::RouteShape` requires `configuration[:modules]` to match the persisted modules **exactly** — same size, and each entry's `{"position" => Integer, "access" => String}` equal to the database row. `EstimatorConfiguration` therefore builds that list from the database rather than from the caller.

**Files:**
- Create: `app/services/commerce/estimator_configuration.rb`
- Create: `test/services/commerce/estimator_configuration_test.rb`
- Create: `test/jobs/wizard_route_quote_test.rb`
- Modify: `config/initializers/commerce.rb`
- Modify: `app/jobs/wizard_route_generation_job.rb:92-94` (the `generation_params` hash) and the end of its transaction
- Modify: `config/locales/en.yml`, `config/locales/es.yml`

**Interfaces:**
- Consumes: `Commerce::RouteQuoteBuilder.call(route:, estimator_configuration:, fee_configuration:, expires_in:)` → `Available(quote:)` or `Unavailable(reason:, missing:)`; `Commerce::FeeConfiguration.call(raw)`.
- Produces: `Commerce::EstimatorConfiguration.call(route:)` → `Available(configuration:)` where `configuration` is the Hash `RouteCostEstimator` consumes, or `Unavailable(reason: String, missing: Array<String>)`. Also `Commerce::EstimatorConfiguration.raw` reading `Rails.application.config.x.commerce_estimator`.

- [ ] **Step 1: Write the failing configuration test**

Create `test/services/commerce/estimator_configuration_test.rb`:

```ruby
require "test_helper"

class Commerce::EstimatorConfigurationTest < ActiveSupport::TestCase
  def setup
    @user = Core::User.create!(
      name: "Quoter", email: "quote-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "en", status: :active
    )
    LearningRoutesEngine::RouteModule.create!(
      learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
    )
  end

  def configured
    {
      estimator_version: "wp18-v1",
      image_quality: "medium",
      outline: [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                  "input_tokens" => 2_000, "output_tokens" => 4_000 }],
      step_calls: {
        "lesson" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 3_000, "output_tokens" => 6_000 }]
      },
      provider_versions: { "gpt-5.2" => "2026-08-31" },
      tavily: { microcents_per_credit: 80, version: "2026-08-31" }
    }
  end

  test "it describes every persisted module in database order with its real access state" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)

    assert result.available?, result.respond_to?(:missing) ? result.missing.inspect : nil
    described = result.configuration.fetch(:modules)
    assert_equal [{ "position" => 1, "access" => "preview" }, { "position" => 2, "access" => "locked" }],
                 described.map { |m| m.slice("position", "access") }
  end

  test "the produced configuration satisfies RouteShape with no missing keys" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)
    shape = Commerce::RouteShape.new(route: @route, configuration: result.configuration)

    assert_empty shape.missing
  end

  test "absent configuration is unavailable and names only configuration keys" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: {})

    assert_not result.available?
    assert_equal "estimator_configuration_missing", result.reason
    assert_includes result.missing, "estimator.estimator_version"
    assert_includes result.missing, "estimator.image_quality"
    assert_includes result.missing, "estimator.outline"
    assert_includes result.missing, "estimator.step_calls"
    result.missing.each { |key| assert_match(/\Aestimator\./, key) }
  end

  test "a step content type with no configured call shape is named explicitly" do
    @route.route_steps.create!(
      route_module: LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, position: 1),
      position: 0, title: "S", level: 1, bloom_level: 1,
      content_type: :assessment, delivery_format: "text", status: :available
    )

    result = Commerce::EstimatorConfiguration.call(route: @route, raw: configured)

    assert_not result.available?
    assert_includes result.missing, "estimator.step_calls.assessment"
  end

  test "it never reads a secret into the missing list" do
    result = Commerce::EstimatorConfiguration.call(route: @route, raw: {})
    result.missing.each { |key| assert_no_match(/key|secret|token|password/i, key) }
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/estimator_configuration_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::EstimatorConfiguration`.

- [ ] **Step 3: Implement the configuration builder**

Create `app/services/commerce/estimator_configuration.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # Assembles the `configuration:` hash RouteCostEstimator consumes.
  #
  # The route SHAPE comes from the database — RouteShape rejects any description
  # whose module count or access states disagree with the persisted rows, so the
  # shape can never be a caller's guess. The per-call token/character/credit
  # assumptions come from configuration, because they are estimates about work
  # not yet done and must be versioned and snapshotted rather than inferred.
  #
  # Fails closed. A missing key produces an Unavailable naming that key, never a
  # zero and never a default fee schedule.
  class EstimatorConfiguration
    Available = Data.define(:configuration) do
      def available? = true
    end
    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    REQUIRED_KEYS = %i[estimator_version image_quality outline step_calls].freeze

    def self.raw
      Rails.application.config.x.commerce_estimator || {}
    end

    def self.call(route:, raw: self.raw)
      new(route, raw || {}).call
    end

    def initialize(route, raw)
      @route = route
      @raw = raw.symbolize_keys
    end

    def call
      missing = REQUIRED_KEYS.filter_map { |key| "estimator.#{key}" if @raw[key].blank? }
      return Unavailable.new(reason: "estimator_configuration_missing", missing: missing) if missing.any?

      modules, module_missing = describe_modules
      return Unavailable.new(reason: "estimator_configuration_missing", missing: module_missing) if module_missing.any?

      Available.new(configuration: {
        estimator_version: @raw.fetch(:estimator_version),
        image_quality: @raw.fetch(:image_quality),
        outline: @raw.fetch(:outline),
        modules: modules,
        provider_versions: (@raw[:provider_versions] || {}).transform_keys(&:to_s),
        tavily: (@raw[:tavily] || {}).symbolize_keys
      })
    end

    private

    # One query for modules, one for steps. Neither traverses an association, so
    # strict_loading has nothing to object to.
    def describe_modules
      step_rows = LearningRoutesEngine::RouteStep
        .where(learning_route_id: @route.id)
        .order(:position, :id)
        .pluck(:route_module_id, :content_type, :position)

      steps_by_module = step_rows.group_by(&:first)
      shapes = (@raw.fetch(:step_calls) || {}).transform_keys(&:to_s)
      missing = []

      modules = LearningRoutesEngine::RouteModule
        .where(learning_route_id: @route.id)
        .order(:position, :id)
        .pluck(:id, :position, :access_state)
        .map do |id, position, access_state|
          access = LearningRoutesEngine::RouteModule.access_states.key(access_state) || access_state.to_s
          steps = (steps_by_module[id] || []).map do |_module_id, content_type, _position|
            calls = shapes[content_type.to_s]
            missing << "estimator.step_calls.#{content_type}" if calls.blank?
            { "content_type" => content_type.to_s, "calls" => calls || [] }
          end
          { "position" => position, "access" => access, "steps" => steps }
        end

      [modules, missing.uniq]
    end
  end
end
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/estimator_configuration_test.rb`
Expected: PASS, 5 runs.

- [ ] **Step 5: Declare the configuration seam**

Replace `config/initializers/commerce.rb` with:

```ruby
# No fee schedule and no estimator shape are assumed. Deployments must supply
# verified, account-specific values before route quoting becomes available.
# Absent configuration blocks quoting and therefore checkout; it never yields a
# zero price or a guessed fee.
Rails.application.config.x.commerce_fee_configuration = {
  percentage_basis_points: Rails.application.credentials.dig(:lemon_squeezy, :fee_basis_points).presence ||
    ENV["LEMON_SQUEEZY_FEE_BASIS_POINTS"],
  fixed_cents: Rails.application.credentials.dig(:lemon_squeezy, :fee_fixed_cents).presence ||
    ENV["LEMON_SQUEEZY_FEE_FIXED_CENTS"],
  version: Rails.application.credentials.dig(:lemon_squeezy, :fee_version).presence ||
    ENV["LEMON_SQUEEZY_FEE_VERSION"]
}.freeze

# The estimator's per-call assumptions. Versioned so an old quote stays
# explainable after rates change. Supplied as YAML in credentials under
# `commerce.estimator`, or left absent to block quoting.
Rails.application.config.x.commerce_estimator =
  (Rails.application.credentials.dig(:commerce, :estimator) || {}).deep_symbolize_keys.freeze
```

- [ ] **Step 6: Write the failing wizard-wiring test**

Create `test/jobs/wizard_route_quote_test.rb`:

```ruby
require "test_helper"

class WizardRouteQuoteTest < ActiveJob::TestCase
  # Quoting must be attempted for every generated route, and its failure must
  # leave a usable route with an explicit reason rather than a half-built one.
  def build_request
    user = Core::User.create!(
      name: "Wiz", email: "wiz-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "en"
    )
    RouteRequest.create!(user: user, topics: ["Algebra"], level: "beginner",
                         weekly_hours: 3, session_minutes: 30, status: "pending")
  end

  test "absent configuration records the block reason and still leaves a usable route" do
    request = build_request

    WizardRouteGenerationJob.perform_now(request.id)

    route = request.reload.learning_route
    assert route.present?, "the route must survive a quoting failure"
    assert_equal "estimator_configuration_missing", route.generation_params["quote_blocked_reason"]
    assert_equal 0, Commerce::RouteQuote.where(learning_route_id: route.id).count
    assert LearningRoutesEngine::RouteModule.exists?(learning_route_id: route.id, access_state: :preview)
  end

  test "a route is quoted once when estimator and fee configuration are both available" do
    request = build_request

    with_commerce_configuration do
      WizardRouteGenerationJob.perform_now(request.id)
    end

    route = request.reload.learning_route
    quotes = Commerce::RouteQuote.where(learning_route_id: route.id)
    if LearningRoutesEngine::RouteModule.where(learning_route_id: route.id).count == 1
      # A single-module route is entirely free; the spec forbids inventing a sale.
      assert_equal 0, quotes.count
      assert_equal "no_paid_modules", route.generation_params["quote_blocked_reason"]
    else
      assert_equal 1, quotes.count
      assert_nil route.generation_params["quote_blocked_reason"]
      assert_equal "unattached", quotes.first.attachment_state
    end
  end

  private

  def with_commerce_configuration
    estimator = {
      estimator_version: "wp18-v1", image_quality: "medium",
      outline: [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                  "input_tokens" => 2_000, "output_tokens" => 4_000 }],
      step_calls: {
        "lesson" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 3_000, "output_tokens" => 6_000 }],
        "exercise" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                         "input_tokens" => 1_000, "output_tokens" => 2_000 }],
        "assessment" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                           "input_tokens" => 1_000, "output_tokens" => 2_000 }],
        "review" => [{ "kind" => "text", "model" => "gpt-5.2", "calls" => 1,
                       "input_tokens" => 500, "output_tokens" => 1_000 }]
      },
      provider_versions: { "gpt-5.2" => "2026-08-31" },
      tavily: { microcents_per_credit: 80, version: "2026-08-31" }
    }
    fee = { percentage_basis_points: 500, fixed_cents: 50, version: "ls-test-v1" }

    previous_estimator = Rails.application.config.x.commerce_estimator
    previous_fee = Rails.application.config.x.commerce_fee_configuration
    Rails.application.config.x.commerce_estimator = estimator
    Rails.application.config.x.commerce_fee_configuration = fee
    yield
  ensure
    Rails.application.config.x.commerce_estimator = previous_estimator
    Rails.application.config.x.commerce_fee_configuration = previous_fee
  end
end
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/jobs/wizard_route_quote_test.rb`
Expected: FAIL on the second test — no quote is created, because nothing calls the builder.

- [ ] **Step 8: Wire quoting into the wizard**

In `app/jobs/wizard_route_generation_job.rb`, remove the hardcoded `quote_blocked_reason: "pricing_configuration_missing"` from the `generation_params` hash at line 93 — the reason is no longer a guess.

Then, immediately **after** the `ActiveRecord::Base.transaction do ... end` block that creates the route, modules and steps closes, add:

```ruby
      # Quote the complete outline. Quoting is deliberately OUTSIDE the creation
      # transaction: a pricing-configuration problem must leave a usable route with
      # an explicit reason, not roll back the student's route. No checkout exists
      # yet, so an unquoted route is recoverable by re-quoting later.
      record_route_quote!(route)
```

and add these private methods to the class:

```ruby
  def record_route_quote!(route)
    estimator = Commerce::EstimatorConfiguration.call(route: route)
    unless estimator.available?
      return block_quote!(route, estimator.reason, estimator.missing)
    end

    result = Commerce::RouteQuoteBuilder.call(
      route: route,
      estimator_configuration: estimator.configuration,
      fee_configuration: Rails.application.config.x.commerce_fee_configuration
    )
    return block_quote!(route, result.reason, result.missing) unless result.available?

    clear_quote_block!(route)
  rescue => e
    # Quoting must never destroy a generated route.
    Rails.logger.error("[WizardRouteGeneration] quoting failed for route #{route.id}: #{e.class}: #{e.message}")
    block_quote!(route, "quote_error", [])
  end

  def block_quote!(route, reason, missing)
    Rails.logger.warn(
      "[WizardRouteGeneration] route #{route.id} not quoted: #{reason} missing=#{Array(missing).join(',')}"
    )
    route.update!(generation_params: route.generation_params.merge("quote_blocked_reason" => reason))
  end

  def clear_quote_block!(route)
    route.update!(generation_params: route.generation_params.except("quote_blocked_reason"))
  end
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/jobs/wizard_route_quote_test.rb`
Expected: PASS, 2 runs.

- [ ] **Step 10: Run the wizard and admin suites for regressions**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/jobs test/controllers/admin test/queries`
Expected: 0 failures, 0 errors. `Admin::UserDetailQuery` reads `quote_blocked_reason` and must still render `not_quoted` for unquoted routes.

- [ ] **Step 11: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce/estimator_configuration.rb app/jobs/wizard_route_generation_job.rb config/initializers/commerce.rb test/services/commerce/estimator_configuration_test.rb test/jobs/wizard_route_quote_test.rb
git commit -m "feat(commerce): quote every generated route or record why it could not be"
```

---

## Task 2: `Commerce::RoutePurchase` — the durable entitlement

The purchase is the entitlement. Not the redirect, not the checkout, not the quote. PostgreSQL enforces at most one **paid** purchase per route, so a duplicated webhook or a double-click cannot sell a route twice, while a failed or expired attempt can still be retried.

**Files:**
- Create: `db/migrate/20260902000001_create_commerce_route_purchases.rb`
- Create: `app/models/commerce/route_purchase.rb`
- Create: `test/models/commerce/route_purchase_test.rb`
- Create: `test/models/commerce/route_purchase_database_test.rb`
- Modify: `app/models/commerce/route_quote.rb`
- Modify: `engines/core/app/models/core/user.rb`
- Modify: `engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb`
- Modify: `db/structure.sql` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: `Commerce::RouteQuote` columns `final_price_cents`, `currency`, `estimated_ai_cost_microcents`, `estimated_fee_cents`, `attachment_state`.
- Produces: `Commerce::RoutePurchase` with `state` in `pending|paid|failed|refunded`; `.paid` scope; `#paid?`; `#mark_paid!(order_id:, actual_fee_cents:, paid_at:)`; `#mark_refunded!(refunded_amount_cents:, refunded_at:)`; `#mark_failed!(reason:)`. Class method `Commerce::RoutePurchase.entitled?(route_id:)` → Boolean.

- [ ] **Step 1: Write the failing model test**

Create `test/models/commerce/route_purchase_test.rb`:

```ruby
require "test_helper"

class Commerce::RoutePurchaseTest < ActiveSupport::TestCase
  def setup
    @user = Core::User.create!(
      name: "Buyer", email: "buy-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "en", status: :active
    )
    LearningRoutesEngine::RouteModule.create!(
      learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
    )
    @quote = build_quote
  end

  def build_quote
    Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: @route, currency: "USD",
      total_module_count: 2, paid_module_count: 1,
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
      markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
      minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
      cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
      estimator_version: "wp18-v1", provider_rate_versions: { "gpt-5.2" => "2026-08-31" },
      fee_version: "ls-test-v1", image_quality: "medium",
      route_shape_assumptions: { "outline" => [] }, provider_rate_assumptions: { "gpt-5.2" => {} },
      fee_assumptions: { "version" => "ls-test-v1" }, expires_at: 24.hours.from_now
    )
  end

  def build_purchase(**overrides)
    Commerce::RoutePurchase.new({
      user: @user, learning_route: @route, route_quote: @quote,
      state: "pending", provider: "lemon_squeezy", test_mode: true,
      provider_checkout_id: "chk_#{SecureRandom.hex(4)}",
      amount_cents: @quote.final_price_cents, currency: "USD",
      estimated_ai_cost_microcents: @quote.estimated_ai_cost_microcents,
      estimated_fee_cents: @quote.estimated_fee_cents
    }.merge(overrides))
  end

  test "a pending purchase copies amount and currency from its quote" do
    purchase = build_purchase
    assert purchase.save, purchase.errors.full_messages.inspect
    assert_equal 299, purchase.amount_cents
    assert_equal "USD", purchase.currency
    assert_not purchase.paid?
  end

  test "an amount that disagrees with the quote is rejected" do
    purchase = build_purchase(amount_cents: 298)
    assert_not purchase.valid?
    assert_includes purchase.errors[:amount_cents].join, "quote"
  end

  test "a purchase whose user does not own the route is rejected" do
    stranger = Core::User.create!(
      name: "Other", email: "other-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    purchase = build_purchase(user: stranger)
    assert_not purchase.valid?
    assert_includes purchase.errors[:user].join, "own"
  end

  test "mark_paid! records the order, the actual fee and the timestamp" do
    purchase = build_purchase
    purchase.save!
    paid_at = Time.current

    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 45, paid_at: paid_at)

    assert purchase.reload.paid?
    assert_equal "ord_1", purchase.provider_order_id
    assert_equal 45, purchase.actual_fee_cents
    assert_in_delta paid_at.to_i, purchase.paid_at.to_i, 1
  end

  test "only one PAID purchase may exist per route, while failed attempts may repeat" do
    build_purchase.tap(&:save!).mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    second = build_purchase(provider_checkout_id: "chk_second")
    second.save!
    assert_raises(ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid) do
      second.mark_paid!(order_id: "ord_2", actual_fee_cents: 1, paid_at: Time.current)
    end

    third = build_purchase(provider_checkout_id: "chk_third", state: "failed")
    assert third.save, "a failed attempt must not collide with a paid purchase"
  end

  test "entitled? is true only for a route with a paid purchase" do
    assert_not Commerce::RoutePurchase.entitled?(route_id: @route.id)
    purchase = build_purchase
    purchase.save!
    assert_not Commerce::RoutePurchase.entitled?(route_id: @route.id), "pending is not entitlement"

    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)
    assert Commerce::RoutePurchase.entitled?(route_id: @route.id)
  end

  test "a refund records the amount and timestamp without deleting the entitlement row" do
    purchase = build_purchase
    purchase.save!
    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    purchase.mark_refunded!(refunded_amount_cents: 299, refunded_at: Time.current)

    assert_equal "refunded", purchase.reload.state
    assert_equal 299, purchase.refunded_amount_cents
    assert purchase.refunded_at.present?
  end

  test "money columns reject negatives" do
    assert_not build_purchase(amount_cents: -1).valid?
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce/route_purchase_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::RoutePurchase`.

- [ ] **Step 3: Write the migration**

Create `db/migrate/20260902000001_create_commerce_route_purchases.rb`:

```ruby
class CreateCommerceRoutePurchases < ActiveRecord::Migration[8.1]
  def up
    create_table :commerce_route_purchases, id: :uuid do |t|
      t.references :user, type: :uuid, null: false,
                   foreign_key: { to_table: :core_users, on_delete: :restrict }
      t.references :learning_route, type: :uuid, null: false,
                   foreign_key: { to_table: :learning_routes_engine_learning_routes, on_delete: :restrict }
      t.references :route_quote, type: :uuid, null: false,
                   foreign_key: { to_table: :commerce_route_quotes, on_delete: :restrict }
      t.string  :state, null: false, default: "pending"
      t.string  :provider, null: false
      t.boolean :test_mode, null: false, default: true
      t.string  :provider_checkout_id
      t.string  :provider_order_id
      t.string  :provider_store_id
      t.string  :provider_product_id
      t.string  :provider_variant_id
      t.bigint  :amount_cents, null: false
      t.string  :currency, null: false
      t.bigint  :estimated_ai_cost_microcents, null: false
      t.bigint  :estimated_fee_cents, null: false
      t.bigint  :actual_fee_cents
      t.bigint  :refunded_amount_cents
      t.string  :failure_reason
      t.datetime :paid_at
      t.datetime :refunded_at
      t.timestamps
    end

    # At most ONE paid purchase per route. A pending or failed retry is allowed
    # to repeat, which is exactly what the spec asks for.
    add_index :commerce_route_purchases, :learning_route_id,
              unique: true, where: "state = 'paid'", name: "idx_route_purchases_single_paid"
    add_index :commerce_route_purchases, [:provider, :provider_order_id],
              unique: true, where: "provider_order_id IS NOT NULL", name: "idx_route_purchases_provider_order"
    add_index :commerce_route_purchases, [:learning_route_id, :state], name: "idx_route_purchases_route_state"

    execute <<~SQL
      ALTER TABLE commerce_route_purchases
        ADD CONSTRAINT route_purchases_state CHECK (state IN ('pending','paid','failed','refunded')),
        ADD CONSTRAINT route_purchases_usd_only CHECK (currency = 'USD'),
        ADD CONSTRAINT route_purchases_nonnegative_money CHECK (
          amount_cents >= 0 AND estimated_ai_cost_microcents >= 0 AND estimated_fee_cents >= 0
          AND (actual_fee_cents IS NULL OR actual_fee_cents >= 0)
          AND (refunded_amount_cents IS NULL OR refunded_amount_cents >= 0)
        ),
        ADD CONSTRAINT route_purchases_paid_needs_order CHECK (
          state <> 'paid' OR (provider_order_id IS NOT NULL AND paid_at IS NOT NULL)
        ),
        ADD CONSTRAINT route_purchases_refund_needs_timestamp CHECK (
          state <> 'refunded' OR refunded_at IS NOT NULL
        );
    SQL

    # The database, not the application, is the final word on who may buy what.
    execute <<~SQL
      CREATE FUNCTION commerce_route_purchase_owner_guard() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM learning_routes_engine_learning_routes r
          JOIN learning_routes_engine_learning_profiles p ON p.id = r.learning_profile_id
          WHERE r.id = NEW.learning_route_id AND p.user_id = NEW.user_id
        ) THEN
          RAISE EXCEPTION 'route purchase user must own the learning route'
            USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM commerce_route_quotes q
          WHERE q.id = NEW.route_quote_id
            AND q.learning_route_id = NEW.learning_route_id
            AND q.user_id = NEW.user_id
            AND q.final_price_cents = NEW.amount_cents
            AND q.currency = NEW.currency
        ) THEN
          RAISE EXCEPTION 'route purchase must match its quote owner, route, amount and currency'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER commerce_route_purchases_owner_guard
        BEFORE INSERT OR UPDATE OF user_id, learning_route_id, route_quote_id, amount_cents, currency
        ON commerce_route_purchases
        FOR EACH ROW EXECUTE FUNCTION commerce_route_purchase_owner_guard();
    SQL
  end

  def down
    execute "DROP TRIGGER IF EXISTS commerce_route_purchases_owner_guard ON commerce_route_purchases;"
    execute "DROP FUNCTION IF EXISTS commerce_route_purchase_owner_guard();"
    drop_table :commerce_route_purchases
  end
end
```

- [ ] **Step 4: Migrate and confirm the structure dump changed**

Run: `env -u RAILS_MASTER_KEY bin/rails db:migrate`
Then: `git diff --stat db/structure.sql`
Expected: `db/structure.sql` modified; it contains `commerce_route_purchases`, `idx_route_purchases_single_paid` and `commerce_route_purchase_owner_guard`.

- [ ] **Step 5: Write the model**

Create `app/models/commerce/route_purchase.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # The durable entitlement. A checkout is an intention; only this record, moved
  # to `paid` by a signature-verified webhook, unlocks anything.
  class RoutePurchase < ApplicationRecord
    self.table_name = "commerce_route_purchases"

    STATES = %w[pending paid failed refunded].freeze

    belongs_to :user, class_name: "Core::User"
    belongs_to :learning_route, class_name: "LearningRoutesEngine::LearningRoute"
    belongs_to :route_quote, class_name: "Commerce::RouteQuote"

    validates :state, inclusion: { in: STATES }
    validates :provider, presence: true
    validates :currency, inclusion: { in: ["USD"] }
    validates :amount_cents, :estimated_ai_cost_microcents, :estimated_fee_cents,
      numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validates :actual_fee_cents, :refunded_amount_cents,
      numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
    validate :amount_matches_quote
    validate :user_owns_learning_route

    scope :paid, -> { where(state: "paid") }
    scope :active_for_route, ->(route_id) { where(learning_route_id: route_id).where(state: %w[pending paid]) }

    def paid?     = state == "paid"
    def pending?  = state == "pending"
    def refunded? = state == "refunded"

    # Entitlement in one bounded query. This is the hot path behind every locked
    # step read, so it must never load a record or traverse an association.
    def self.entitled?(route_id:)
      return false if route_id.blank?

      paid.where(learning_route_id: route_id).exists?
    end

    def mark_paid!(order_id:, actual_fee_cents:, paid_at:, order_attributes: {})
      update!(order_attributes.merge(
        state: "paid", provider_order_id: order_id,
        actual_fee_cents: actual_fee_cents, paid_at: paid_at, failure_reason: nil
      ))
    end

    def mark_refunded!(refunded_amount_cents:, refunded_at:)
      update!(state: "refunded", refunded_amount_cents: refunded_amount_cents, refunded_at: refunded_at)
    end

    def mark_failed!(reason:)
      update!(state: "failed", failure_reason: reason.to_s.truncate(255))
    end

    private

    # The amount is never taken from the browser or the provider; it is the
    # quote's own final price, re-checked here and again by a database trigger.
    def amount_matches_quote
      return if route_quote_id.blank? || amount_cents.blank?

      match = RouteQuote.where(id: route_quote_id, learning_route_id: learning_route_id,
                               user_id: user_id, final_price_cents: amount_cents,
                               currency: currency).exists?
      errors.add(:amount_cents, "must equal its quote's final price for the same user and route") unless match
    end

    def user_owns_learning_route
      return if user_id.blank? || learning_route_id.blank?

      profile_ids = LearningRoutesEngine::LearningRoute.where(id: learning_route_id).select(:learning_profile_id)
      return if LearningRoutesEngine::LearningProfile.where(id: profile_ids, user_id: user_id).exists?

      errors.add(:user, "must own the learning route")
    end
  end
end
```

- [ ] **Step 6: Add the associations**

In `engines/core/app/models/core/user.rb`, beside the existing `route_quotes` association:

```ruby
    has_many :route_purchases, class_name: "Commerce::RoutePurchase", dependent: :restrict_with_error
```

In `engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb`, beside `has_many :route_quotes`:

```ruby
    has_many :route_purchases, class_name: "Commerce::RoutePurchase", dependent: :restrict_with_error
```

In `app/models/commerce/route_quote.rb`, after the `belongs_to` lines:

```ruby
    has_many :route_purchases, class_name: "Commerce::RoutePurchase",
             foreign_key: :route_quote_id, dependent: :restrict_with_error
```

- [ ] **Step 7: Run the model test and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce/route_purchase_test.rb`
Expected: PASS, 8 runs.

- [ ] **Step 8: Write the database-level test**

Create `test/models/commerce/route_purchase_database_test.rb`. It repeats the `setup` and `build_quote` helpers from Step 1 verbatim (an executor may read tasks out of order), then:

```ruby
  test "raw SQL cannot insert a purchase for a route the user does not own" do
    stranger = Core::User.create!(
      name: "Stranger", email: "sx-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, stranger.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'pending', 'lemon_squeezy', true,
              299, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) do
      ActiveRecord::Base.connection.execute(sql)
    end
    assert_match(/must own the learning route/, error.message)
  end

  test "raw SQL cannot insert a purchase whose amount disagrees with its quote" do
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'pending', 'lemon_squeezy', true,
              1, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) do
      ActiveRecord::Base.connection.execute(sql)
    end
    assert_match(/must match its quote/, error.message)
  end

  test "raw SQL cannot create a second paid purchase for one route" do
    purchase = Commerce::RoutePurchase.create!(
      user: @user, learning_route: @route, route_quote: @quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: @quote.final_price_cents,
      currency: "USD", estimated_ai_cost_microcents: 0, estimated_fee_cents: 0
    )
    purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         provider_order_id, paid_at, amount_cents, currency,
         estimated_ai_cost_microcents, estimated_fee_cents, created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'paid', 'lemon_squeezy', true,
              'ord_forced', NOW(), 299, 'USD', 0, 0, NOW(), NOW())
    SQL

    assert_raises(ActiveRecord::RecordNotUnique) { ActiveRecord::Base.connection.execute(sql) }
  end

  test "a paid row without an order id is rejected by the database" do
    sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL, @user.id, @route.id, @quote.id])
      INSERT INTO commerce_route_purchases
        (id, user_id, learning_route_id, route_quote_id, state, provider, test_mode,
         amount_cents, currency, estimated_ai_cost_microcents, estimated_fee_cents,
         created_at, updated_at)
      VALUES (gen_random_uuid(), ?, ?, ?, 'paid', 'lemon_squeezy', true,
              299, 'USD', 0, 0, NOW(), NOW())
    SQL

    error = assert_raises(ActiveRecord::StatementInvalid) { ActiveRecord::Base.connection.execute(sql) }
    assert_match(/route_purchases_paid_needs_order/, error.message)
  end
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce/route_purchase_database_test.rb`
Expected: PASS, 4 runs.

- [ ] **Step 10: Inspect and commit**

```bash
git diff
git diff --check
git add db/migrate/20260902000001_create_commerce_route_purchases.rb db/structure.sql app/models/commerce/route_purchase.rb app/models/commerce/route_quote.rb engines/core/app/models/core/user.rb engines/learning_routes_engine/app/models/learning_routes_engine/learning_route.rb test/models/commerce
git commit -m "feat(commerce): record route purchases as the durable entitlement"
```

---

## Task 3: `Commerce::ProviderEvent` — the replay guard

Lemon Squeezy retries. Its dashboard can resend. Events arrive out of order. The unique index on `(provider, event_identity)` is what makes "process exactly once" a database fact rather than an intention.

**Files:**
- Create: `db/migrate/20260902000002_create_commerce_provider_events.rb`
- Create: `app/models/commerce/provider_event.rb`
- Create: `test/models/commerce/provider_event_test.rb`
- Modify: `db/structure.sql`

**Interfaces:**
- Produces: `Commerce::ProviderEvent.claim!(provider:, event_identity:, event_name:, test_mode:, evidence:)` → the created record, or `nil` when this identity was already claimed. `#mark_processed!`, `#mark_rejected!(reason:)`. Columns: `processing_state` in `pending|processed|rejected`, `evidence` jsonb, `rejection_reason`, `processed_at`.

- [ ] **Step 1: Write the failing test**

Create `test/models/commerce/provider_event_test.rb`:

```ruby
require "test_helper"

class Commerce::ProviderEventTest < ActiveSupport::TestCase
  def claim(identity: "evt_1", name: "order_created")
    Commerce::ProviderEvent.claim!(
      provider: "lemon_squeezy", event_identity: identity, event_name: name,
      test_mode: true, evidence: { "order_id" => "ord_1", "amount_cents" => 299 }
    )
  end

  test "the first claim of an identity wins and the second returns nil" do
    first = claim
    assert first.present?
    assert_equal "pending", first.processing_state
    assert_nil claim, "a replayed event must not be claimable twice"
    assert_equal 1, Commerce::ProviderEvent.where(event_identity: "evt_1").count
  end

  test "two providers may share an event identity" do
    assert claim.present?
    other = Commerce::ProviderEvent.claim!(
      provider: "other_provider", event_identity: "evt_1", event_name: "order_created",
      test_mode: true, evidence: {}
    )
    assert other.present?
  end

  test "processing and rejection are recorded terminally" do
    event = claim
    event.mark_processed!
    assert_equal "processed", event.reload.processing_state
    assert event.processed_at.present?

    rejected = claim(identity: "evt_2")
    rejected.mark_rejected!(reason: "amount_mismatch")
    assert_equal "rejected", rejected.reload.processing_state
    assert_equal "amount_mismatch", rejected.rejection_reason
  end

  test "evidence rejects secret-looking keys and unbounded payloads" do
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_3", event_name: "order_created",
        test_mode: true, evidence: { "signing_secret" => "shhh" }
      )
    end
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_4", event_name: "order_created",
        test_mode: true, evidence: { "raw_payload" => "x" * 20_000 }
      )
    end
  end

  test "an unknown evidence key is rejected rather than stored" do
    assert_raises(ArgumentError) do
      Commerce::ProviderEvent.claim!(
        provider: "lemon_squeezy", event_identity: "evt_5", event_name: "order_created",
        test_mode: true, evidence: { "customer_full_name" => "Jane" }
      )
    end
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce/provider_event_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::ProviderEvent`.

- [ ] **Step 3: Write the migration**

Create `db/migrate/20260902000002_create_commerce_provider_events.rb`:

```ruby
class CreateCommerceProviderEvents < ActiveRecord::Migration[8.1]
  def up
    create_table :commerce_provider_events, id: :uuid do |t|
      t.string   :provider, null: false
      t.string   :event_identity, null: false
      t.string   :event_name, null: false
      t.boolean  :test_mode, null: false
      t.string   :processing_state, null: false, default: "pending"
      t.jsonb    :evidence, null: false, default: {}
      t.string   :rejection_reason
      t.datetime :processed_at
      t.timestamps
    end

    add_index :commerce_provider_events, [:provider, :event_identity],
              unique: true, name: "idx_provider_events_identity"
    add_index :commerce_provider_events, [:provider, :event_name, :created_at],
              name: "idx_provider_events_name_time"

    execute <<~SQL
      ALTER TABLE commerce_provider_events
        ADD CONSTRAINT provider_events_processing_state
          CHECK (processing_state IN ('pending','processed','rejected')),
        ADD CONSTRAINT provider_events_bounded_evidence
          CHECK (pg_column_size(evidence) <= 8192);
    SQL
  end

  def down
    drop_table :commerce_provider_events
  end
end
```

- [ ] **Step 4: Migrate**

Run: `env -u RAILS_MASTER_KEY bin/rails db:migrate`
Expected: `db/structure.sql` gains `commerce_provider_events` and `idx_provider_events_identity`.

- [ ] **Step 5: Write the model**

Create `app/models/commerce/provider_event.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # One row per provider event identity. The unique index is the idempotency
  # boundary: a replay loses the insert race and is not processed again.
  #
  # `evidence` is a NARROW allowlist of reconciliation facts. The spec forbids
  # retaining an unrestricted raw payload or unnecessary personal data, so an
  # unknown key is an error rather than something to store and forget.
  class ProviderEvent < ApplicationRecord
    self.table_name = "commerce_provider_events"

    PROCESSING_STATES = %w[pending processed rejected].freeze

    EVIDENCE_KEYS = %w[
      order_id checkout_id store_id product_id variant_id
      amount_cents currency actual_fee_cents refunded_amount_cents
      route_id quote_id user_id status occurred_at
    ].freeze

    MAX_EVIDENCE_BYTES = 8_192

    validates :provider, :event_identity, :event_name, presence: true
    validates :processing_state, inclusion: { in: PROCESSING_STATES }
    validates :test_mode, inclusion: { in: [true, false] }

    def self.claim!(provider:, event_identity:, event_name:, test_mode:, evidence:)
      safe = sanitize_evidence(evidence)
      create!(provider: provider, event_identity: event_identity, event_name: event_name,
              test_mode: test_mode, evidence: safe, processing_state: "pending")
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def self.sanitize_evidence(evidence)
      hash = (evidence || {}).to_h.transform_keys(&:to_s)
      unknown = hash.keys - EVIDENCE_KEYS
      raise ArgumentError, "unsupported provider evidence keys: #{unknown.sort.join(', ')}" if unknown.any?
      if hash.to_json.bytesize > MAX_EVIDENCE_BYTES
        raise ArgumentError, "provider evidence exceeds #{MAX_EVIDENCE_BYTES} bytes"
      end

      hash
    end

    def mark_processed!
      update!(processing_state: "processed", processed_at: Time.current, rejection_reason: nil)
    end

    def mark_rejected!(reason:)
      update!(processing_state: "rejected", processed_at: Time.current,
              rejection_reason: reason.to_s.truncate(255))
    end
  end
end
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/models/commerce/provider_event_test.rb`
Expected: PASS, 5 runs.

- [ ] **Step 7: Inspect and commit**

```bash
git diff
git diff --check
git add db/migrate/20260902000002_create_commerce_provider_events.rb db/structure.sql app/models/commerce/provider_event.rb test/models/commerce/provider_event_test.rb
git commit -m "feat(commerce): store provider events as the replay guard"
```

---

## Task 4: The payment provider port and the Lemon Squeezy adapter

The domain needs exactly two operations from a payment provider. Keeping the port that narrow is what lets a Costa Rican provider such as Tilopay be added later without touching purchase or entitlement rules. Nothing in this branch calls Lemon Squeezy: the adapter is unit-tested against fixtures, and every other task uses `Commerce::Providers::Fake`.

**Files:**
- Create: `app/services/commerce/payment_provider.rb`
- Create: `app/services/commerce/providers/lemon_squeezy.rb`
- Create: `app/services/commerce/providers/fake.rb`
- Create: `test/services/commerce/providers/lemon_squeezy_test.rb`
- Modify: `config/initializers/commerce.rb`

**Interfaces:**
- Produces: `Commerce::PaymentProvider.resolve` → an adapter instance or `Commerce::PaymentProvider::Unavailable(reason:, missing:)`.
  - `adapter#create_checkout(quote:, user:, success_url:, cancel_url:)` → `Commerce::PaymentProvider::Checkout(checkout_id:, checkout_url:, store_id:, product_id:, variant_id:, test_mode:)` or raises `Commerce::PaymentProvider::Error`.
  - `adapter#verify_event(raw_body:, signature:)` → `Commerce::PaymentProvider::Event(identity:, name:, test_mode:, store_id:, order_id:, checkout_id:, amount_cents:, currency:, actual_fee_cents:, refunded_amount_cents:, custom_route_id:, custom_quote_id:, custom_user_id:, status:)` or raises `Commerce::PaymentProvider::SignatureError`.
  - `adapter#name` → `"lemon_squeezy"`.

- [ ] **Step 1: Write the failing adapter test**

Create `test/services/commerce/providers/lemon_squeezy_test.rb`:

```ruby
require "test_helper"

class Commerce::Providers::LemonSqueezyTest < ActiveSupport::TestCase
  SECRET = "test_signing_secret"

  def adapter
    Commerce::Providers::LemonSqueezy.new(
      api_key: "test_api_key", signing_secret: SECRET, store_id: "1",
      product_id: "2", variant_id: "3", test_mode: true
    )
  end

  def order_created_body(order_id: "ord_1", amount_cents: 299, currency: "USD", fee_cents: 45)
    {
      meta: {
        event_name: "order_created",
        custom_data: { route_id: "r-1", quote_id: "q-1", user_id: "u-1" }
      },
      data: {
        id: order_id,
        attributes: {
          store_id: 1, identifier: "id-1", status: "paid", test_mode: true,
          currency: currency, total: amount_cents,
          total_usd: amount_cents, refunded_amount: 0,
          first_order_item: { product_id: 2, variant_id: 3 },
          # Lemon Squeezy reports its cut in cents on the order.
          tax: 0, discount_total: 0, setup_fee: 0, total_formatted: "$2.99"
        }
      }
    }.to_json
  end

  def sign(body) = OpenSSL::HMAC.hexdigest("SHA256", SECRET, body)

  test "a correctly signed event verifies and normalizes to the domain shape" do
    body = order_created_body
    event = adapter.verify_event(raw_body: body, signature: sign(body))

    assert_equal "order_created", event.name
    assert_equal "ord_1", event.order_id
    assert_equal 299, event.amount_cents
    assert_equal "USD", event.currency
    assert_equal true, event.test_mode
    assert_equal "r-1", event.custom_route_id
    assert_equal "q-1", event.custom_quote_id
    assert_equal "u-1", event.custom_user_id
    assert event.identity.present?
  end

  test "a wrong signature raises before any business field is read" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: sign("different body"))
    end
  end

  test "a missing signature raises" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: nil)
    end
  end

  test "signature comparison is length-safe and constant-time" do
    body = order_created_body
    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: "short")
    end
  end

  test "a signature over a mutated body is rejected" do
    body = order_created_body
    signature = sign(body)
    tampered = body.sub('"total":299', '"total":1')

    assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: tampered, signature: signature)
    end
  end

  test "the signing secret never appears in an error message" do
    body = order_created_body
    error = assert_raises(Commerce::PaymentProvider::SignatureError) do
      adapter.verify_event(raw_body: body, signature: "00")
    end
    assert_no_match(/#{SECRET}/, error.message)
    assert_no_match(/test_api_key/, error.message)
  end

  test "resolve is Unavailable when configuration is absent and names no secret value" do
    result = Commerce::PaymentProvider.resolve(configuration: {})

    assert_not result.available?
    assert_includes result.missing, "lemon_squeezy.api_key"
    assert_includes result.missing, "lemon_squeezy.signing_secret"
    assert_includes result.missing, "lemon_squeezy.store_id"
    assert_includes result.missing, "lemon_squeezy.variant_id"
    result.missing.each { |key| assert_no_match(/test_api_key|#{SECRET}/, key) }
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/providers/lemon_squeezy_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::Providers`.

- [ ] **Step 3: Write the port**

Create `app/services/commerce/payment_provider.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # The only surface the domain sees. Two operations, deliberately: create a
  # custom-price one-time checkout from an immutable quote, and verify/normalize
  # an inbound event. Anything wider would leak provider vocabulary into purchase
  # and entitlement rules and make a second provider a rewrite.
  module PaymentProvider
    Error          = Class.new(StandardError)
    SignatureError = Class.new(Error)

    Checkout = Data.define(:checkout_id, :checkout_url, :store_id, :product_id, :variant_id, :test_mode)

    Event = Data.define(
      :identity, :name, :test_mode, :store_id, :order_id, :checkout_id,
      :amount_cents, :currency, :actual_fee_cents, :refunded_amount_cents,
      :custom_route_id, :custom_quote_id, :custom_user_id, :status
    )

    Unavailable = Data.define(:reason, :missing) do
      def available? = false
    end

    Available = Data.define(:adapter) do
      def available? = true
    end

    REQUIRED_KEYS = %i[api_key signing_secret store_id product_id variant_id].freeze

    def self.configuration
      Rails.application.config.x.commerce_payment_provider || {}
    end

    # Fails closed. The missing list names CONFIGURATION KEYS only — never a
    # value, never a partial secret.
    def self.resolve(configuration: self.configuration)
      raw = (configuration || {}).symbolize_keys
      missing = REQUIRED_KEYS.filter_map { |key| "lemon_squeezy.#{key}" if raw[key].blank? }
      return Unavailable.new(reason: "payment_provider_unavailable", missing: missing) if missing.any?

      Available.new(adapter: Providers::LemonSqueezy.new(
        api_key: raw.fetch(:api_key), signing_secret: raw.fetch(:signing_secret),
        store_id: raw.fetch(:store_id).to_s, product_id: raw.fetch(:product_id).to_s,
        variant_id: raw.fetch(:variant_id).to_s, test_mode: raw.fetch(:test_mode, true)
      ))
    end
  end
end
```

- [ ] **Step 4: Write the adapter**

Create `app/services/commerce/providers/lemon_squeezy.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  module Providers
    # The only real adapter. Nothing on this branch calls `create_checkout`
    # against the network; WP-18 is verified against fixtures and the Fake.
    class LemonSqueezy
      API_ROOT = "https://api.lemonsqueezy.com/v1"
      SIGNATURE_ALGORITHM = "SHA256"

      def initialize(api_key:, signing_secret:, store_id:, product_id:, variant_id:, test_mode:)
        @api_key = api_key
        @signing_secret = signing_secret
        @store_id = store_id
        @product_id = product_id
        @variant_id = variant_id
        @test_mode = test_mode
      end

      def name = "lemon_squeezy"

      # Verification happens on the RAW BODY, before a single business field is
      # parsed. Anything else lets an attacker choose the fields we validate.
      def verify_event(raw_body:, signature:)
        raise SignatureError, "missing signature" if signature.blank? || raw_body.nil?

        expected = OpenSSL::HMAC.hexdigest(SIGNATURE_ALGORITHM, @signing_secret, raw_body)
        unless ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s)
          # The message deliberately carries no secret, no expected digest and no
          # body excerpt.
          raise SignatureError, "provider signature verification failed"
        end

        normalize(JSON.parse(raw_body))
      rescue JSON::ParserError
        raise PaymentProvider::Error, "provider event body was not valid JSON"
      end

      def create_checkout(quote:, user:, success_url:, cancel_url:)
        # The amount is the local quote's own final price, in cents. It is never
        # read back from the browser or recomputed from a provider response.
        payload = {
          data: {
            type: "checkouts",
            attributes: {
              custom_price: quote.final_price_cents,
              checkout_data: {
                email: user.email,
                custom: {
                  route_id: quote.learning_route_id,
                  quote_id: quote.id,
                  user_id: user.id
                }
              },
              product_options: { redirect_url: success_url },
              checkout_options: { embed: false },
              test_mode: @test_mode
            },
            relationships: {
              store:   { data: { type: "stores",   id: @store_id } },
              variant: { data: { type: "variants", id: @variant_id } }
            }
          }
        }

        response = post("#{API_ROOT}/checkouts", payload)
        attributes = response.dig("data", "attributes") || {}
        PaymentProvider::Checkout.new(
          checkout_id: response.dig("data", "id").to_s,
          checkout_url: attributes["url"].to_s,
          store_id: @store_id, product_id: @product_id, variant_id: @variant_id,
          test_mode: @test_mode
        )
      end

      private

      SignatureError = PaymentProvider::SignatureError

      def normalize(parsed)
        meta = parsed["meta"] || {}
        data = parsed["data"] || {}
        attributes = data["attributes"] || {}
        custom = (meta["custom_data"] || {})

        PaymentProvider::Event.new(
          # Lemon Squeezy does not send a stable event UUID on every payload, so
          # identity is the (event name, order id) pair, which IS stable across
          # retries and dashboard resends of the same order event.
          identity: "#{meta['event_name']}:#{data['id']}",
          name: meta["event_name"].to_s,
          test_mode: !!attributes["test_mode"],
          store_id: attributes["store_id"].to_s,
          order_id: data["id"].to_s,
          checkout_id: attributes["identifier"].to_s,
          amount_cents: integer_or_nil(attributes["total"]),
          currency: attributes["currency"].to_s,
          actual_fee_cents: integer_or_nil(attributes["fee"] || attributes["total_fee"]),
          refunded_amount_cents: integer_or_nil(attributes["refunded_amount"]),
          custom_route_id: custom["route_id"].presence&.to_s,
          custom_quote_id: custom["quote_id"].presence&.to_s,
          custom_user_id: custom["user_id"].presence&.to_s,
          status: attributes["status"].to_s
        )
      end

      # Money arrives as an integer number of cents or not at all. A String that
      # is not an exact integer is treated as absent rather than coerced.
      def integer_or_nil(value)
        return value if value.is_a?(Integer)
        return value.to_i if value.is_a?(String) && value.match?(/\A-?\d+\z/)

        nil
      end

      def post(url, payload)
        uri = URI.parse(url)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 10
        http.read_timeout = 20

        request = Net::HTTP::Post.new(uri)
        request["Authorization"] = "Bearer #{@api_key}"
        request["Accept"] = "application/vnd.api+json"
        request["Content-Type"] = "application/vnd.api+json"
        request.body = payload.to_json

        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          # No body echo: a provider error page can contain request data.
          raise PaymentProvider::Error, "provider checkout creation failed with #{response.code}"
        end

        JSON.parse(response.body)
      rescue JSON::ParserError
        raise PaymentProvider::Error, "provider checkout response was not valid JSON"
      end
    end
  end
end
```

- [ ] **Step 5: Write the fake adapter**

Create `app/services/commerce/providers/fake.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  module Providers
    # Test double with the same signatures as the real adapter. It never touches
    # the network, so no test in this package can accidentally call a provider.
    class Fake
      attr_reader :created_checkouts

      def initialize(signing_secret: "fake_secret", store_id: "1", product_id: "2",
                     variant_id: "3", test_mode: true)
        @signing_secret = signing_secret
        @store_id = store_id
        @product_id = product_id
        @variant_id = variant_id
        @test_mode = test_mode
        @created_checkouts = []
      end

      def name = "lemon_squeezy"

      def create_checkout(quote:, user:, success_url:, cancel_url:)
        checkout = PaymentProvider::Checkout.new(
          checkout_id: "chk_#{quote.id}", checkout_url: "https://example.test/checkout/#{quote.id}",
          store_id: @store_id, product_id: @product_id, variant_id: @variant_id, test_mode: @test_mode
        )
        @created_checkouts << { quote_id: quote.id, user_id: user.id, amount_cents: quote.final_price_cents }
        checkout
      end

      def verify_event(raw_body:, signature:)
        expected = OpenSSL::HMAC.hexdigest("SHA256", @signing_secret, raw_body.to_s)
        unless signature.present? && ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s)
          raise PaymentProvider::SignatureError, "provider signature verification failed"
        end

        LemonSqueezy.new(api_key: "x", signing_secret: @signing_secret, store_id: @store_id,
                         product_id: @product_id, variant_id: @variant_id, test_mode: @test_mode)
                    .send(:normalize, JSON.parse(raw_body))
      end

      def sign(raw_body) = OpenSSL::HMAC.hexdigest("SHA256", @signing_secret, raw_body)
    end
  end
end
```

- [ ] **Step 6: Declare the provider configuration**

Append to `config/initializers/commerce.rb`:

```ruby
# Lemon Squeezy credentials. Absent by default: no store, product, variant, API
# key or signing secret is committed, and no default is invented. Absent
# configuration blocks checkout creation and rejects every webhook.
Rails.application.config.x.commerce_payment_provider = {
  api_key: Rails.application.credentials.dig(:lemon_squeezy, :api_key).presence ||
    ENV["LEMON_SQUEEZY_API_KEY"],
  signing_secret: Rails.application.credentials.dig(:lemon_squeezy, :signing_secret).presence ||
    ENV["LEMON_SQUEEZY_SIGNING_SECRET"],
  store_id: Rails.application.credentials.dig(:lemon_squeezy, :store_id).presence ||
    ENV["LEMON_SQUEEZY_STORE_ID"],
  product_id: Rails.application.credentials.dig(:lemon_squeezy, :product_id).presence ||
    ENV["LEMON_SQUEEZY_PRODUCT_ID"],
  variant_id: Rails.application.credentials.dig(:lemon_squeezy, :variant_id).presence ||
    ENV["LEMON_SQUEEZY_VARIANT_ID"],
  # Live mode stays off until WP-4 and the payment-critical WP-8 findings close
  # and a human approves activation.
  test_mode: ActiveModel::Type::Boolean.new.cast(
    Rails.application.credentials.dig(:lemon_squeezy, :test_mode).presence ||
      ENV.fetch("LEMON_SQUEEZY_TEST_MODE", "true")
  )
}.freeze
```

- [ ] **Step 7: Run the adapter test and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/providers/lemon_squeezy_test.rb`
Expected: PASS, 7 runs.

- [ ] **Step 8: Prove no test can reach the network**

Run: `grep -rn "Net::HTTP\|api.lemonsqueezy.com" test/ | grep -v "_test.rb:.*#"`
Expected: no result other than fixtures. If `create_checkout` is exercised anywhere, it must be through `Commerce::Providers::Fake`.

- [ ] **Step 9: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce/payment_provider.rb app/services/commerce/providers config/initializers/commerce.rb test/services/commerce/providers
git commit -m "feat(commerce): add a narrow payment provider port and Lemon Squeezy adapter"
```

---

## Task 5: Create custom-price checkouts

The customer presses buy; the server derives the amount from the immutable quote alone, attaches that quote, and records a pending purchase. Nothing about the price comes from the request.

**Files:**
- Create: `app/services/commerce/checkout_creator.rb`
- Create: `app/controllers/commerce/checkouts_controller.rb`
- Create: `test/services/commerce/checkout_creator_test.rb`
- Create: `test/controllers/commerce/checkouts_test.rb`
- Modify: `config/routes.rb`
- Modify: `config/initializers/rack_attack.rb`
- Modify: `app/models/commerce/route_quote.rb`
- Modify: `config/locales/en.yml`, `config/locales/es.yml`

**Interfaces:**
- Consumes: `Commerce::PaymentProvider.resolve`, `Commerce::RoutePurchase`, `Commerce::RouteQuote`.
- Produces: `Commerce::CheckoutCreator.call(user:, route:, adapter:, success_url:, cancel_url:)` → `Created(purchase:, checkout_url:)` or `Rejected(reason:)` with `reason` in `not_owner|no_quote|quote_expired|already_purchased|provider_unavailable|provider_error`. Route helper `commerce_route_checkout_path(route_id)` for `POST /learning/routes/:route_id/checkout`.

- [ ] **Step 1: Write the failing service test**

Create `test/services/commerce/checkout_creator_test.rb` with the same `setup`/`build_quote` helpers as Task 2 Step 1, plus:

```ruby
  def adapter = @adapter ||= Commerce::Providers::Fake.new

  def create(user: @user, route: @route)
    Commerce::CheckoutCreator.call(
      user: user, route: route, adapter: adapter,
      success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
    )
  end

  test "it charges exactly the quote's final price and attaches the quote" do
    result = create

    assert result.created?, result.try(:reason)
    assert_equal @quote.final_price_cents, result.purchase.amount_cents
    assert_equal @quote.final_price_cents, adapter.created_checkouts.first[:amount_cents]
    assert_equal "pending", result.purchase.state
    assert_equal "checkout", @quote.reload.attachment_state
  end

  test "an attached quote can never be superseded by a replacement" do
    create
    replacement = build_quote

    assert_equal "checkout", @quote.reload.attachment_state
    assert_nil @quote.superseded_at, "an attached quote must survive a replacement untouched"
    assert_equal "unattached", replacement.attachment_state
  end

  test "a route belonging to someone else is rejected without creating anything" do
    stranger = Core::User.create!(
      name: "Nope", email: "nope-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )

    result = create(user: stranger)

    assert_not result.created?
    assert_equal "not_owner", result.reason
    assert_equal 0, Commerce::RoutePurchase.count
  end

  test "an expired quote is rejected" do
    @quote.update_column(:expires_at, 1.hour.ago)

    result = create

    assert_not result.created?
    assert_equal "quote_expired", result.reason
    assert_equal 0, Commerce::RoutePurchase.count
  end

  test "a route that is already paid for cannot be bought twice" do
    first = create
    first.purchase.mark_paid!(order_id: "ord_1", actual_fee_cents: 1, paid_at: Time.current)

    result = create

    assert_not result.created?
    assert_equal "already_purchased", result.reason
  end

  test "a provider failure leaves the quote unattached and creates no purchase" do
    failing = Object.new
    def failing.name = "lemon_squeezy"
    def failing.create_checkout(**) = raise(Commerce::PaymentProvider::Error, "boom")

    result = Commerce::CheckoutCreator.call(
      user: @user, route: @route, adapter: failing,
      success_url: "https://example.test/ok", cancel_url: "https://example.test/no"
    )

    assert_not result.created?
    assert_equal "provider_error", result.reason
    assert_equal "unattached", @quote.reload.attachment_state
    assert_equal 0, Commerce::RoutePurchase.count
  end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/checkout_creator_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::CheckoutCreator`.

- [ ] **Step 3: Allow the attachment transition on the quote**

`RouteQuote::IMMUTABLE_ATTRIBUTES` deliberately excludes `attachment_state` and `superseded_at`, so the existing immutability guard already permits this. Add the transition helper and the supersession guard to `app/models/commerce/route_quote.rb`:

```ruby
    ATTACHMENT_STATES = %w[unattached checkout purchase].freeze

    def attached? = attachment_state != "unattached"

    # `unattached -> checkout -> purchase` only, and never backwards. An attached
    # quote is the price the customer agreed to; nothing may move it.
    def attach!(state)
      raise ArgumentError, "unknown attachment state #{state}" unless ATTACHMENT_STATES.include?(state)

      allowed = { "unattached" => ["checkout"], "checkout" => ["purchase"], "purchase" => [] }
      unless allowed.fetch(attachment_state, []).include?(state)
        raise ArgumentError, "cannot move an attached quote from #{attachment_state} to #{state}"
      end

      update!(attachment_state: state)
    end
```

`create_snapshot!` already supersedes only `attachment_state: "unattached"` rows, so an attached quote is untouched by a replacement. Add a test asserting that (Step 1 covers it).

- [ ] **Step 4: Write the service**

Create `app/services/commerce/checkout_creator.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # Quote -> provider checkout -> pending purchase, in one transaction.
  #
  # Everything monetary comes from the local quote. The request supplies a route
  # id and nothing else; there is no price, quantity or currency parameter to
  # tamper with.
  class CheckoutCreator
    Created  = Data.define(:purchase, :checkout_url) do
      def created? = true
    end
    Rejected = Data.define(:reason) do
      def created? = false
    end

    def self.call(user:, route:, adapter:, success_url:, cancel_url:)
      new(user, route, adapter, success_url, cancel_url).call
    end

    def initialize(user, route, adapter, success_url, cancel_url)
      @user = user
      @route = route
      @adapter = adapter
      @success_url = success_url
      @cancel_url = cancel_url
    end

    def call
      return Rejected.new(reason: "not_owner") unless owner?
      return Rejected.new(reason: "already_purchased") if RoutePurchase.entitled?(route_id: @route.id)

      quote = active_quote
      return Rejected.new(reason: "no_quote") if quote.nil?
      return Rejected.new(reason: "quote_expired") if quote.expires_at <= Time.current

      checkout = @adapter.create_checkout(
        quote: quote, user: @user, success_url: @success_url, cancel_url: @cancel_url
      )

      purchase = ActiveRecord::Base.transaction do
        quote.attach!("checkout")
        RoutePurchase.create!(
          user: @user, learning_route: @route, route_quote: quote,
          state: "pending", provider: @adapter.name, test_mode: checkout.test_mode,
          provider_checkout_id: checkout.checkout_id, provider_store_id: checkout.store_id,
          provider_product_id: checkout.product_id, provider_variant_id: checkout.variant_id,
          amount_cents: quote.final_price_cents, currency: quote.currency,
          estimated_ai_cost_microcents: quote.estimated_ai_cost_microcents,
          estimated_fee_cents: quote.estimated_fee_cents
        )
      end

      Created.new(purchase: purchase, checkout_url: checkout.checkout_url)
    rescue PaymentProvider::Error => e
      # The quote is untouched, so the customer can retry at the same price.
      Rails.logger.warn("[Checkout] provider error for route #{@route.id}: #{e.class}")
      Rejected.new(reason: "provider_error")
    end

    private

    def owner?
      LearningRoutesEngine::LearningProfile
        .where(id: @route.learning_profile_id, user_id: @user.id).exists?
    end

    def active_quote
      RouteQuote.where(learning_route_id: @route.id, user_id: @user.id,
                       superseded_at: nil, attachment_state: "unattached")
                .order(created_at: :desc).first
    end
  end
end
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/checkout_creator_test.rb`
Expected: PASS, 6 runs.

- [ ] **Step 6: Add the route and the throttle**

In `config/routes.rb`, inside the existing learning-routes engine mount or beside it, add a host-level namespace:

```ruby
  namespace :commerce do
    post "routes/:route_id/checkout", to: "checkouts#create", as: :route_checkout
    post "webhooks/lemon_squeezy", to: "webhooks#lemon_squeezy", as: :lemon_squeezy_webhook
  end
```

In `config/initializers/rack_attack.rb`, beside the existing `ai_generation/ip` throttle:

```ruby
  # Checkout creation calls a payment provider and writes a purchase row. Ten a
  # minute per IP is far above any real customer and well below abuse.
  throttle("checkouts/ip", limit: 10, period: 60) do |req|
    req.ip if req.post? && req.path.match?(%r{\A/commerce/routes/[^/]+/checkout\z})
  end

  # Webhooks are authenticated by signature, not by session, so throttle by IP
  # only to bound a flood. Lemon Squeezy retries are far below this.
  throttle("provider_webhooks/ip", limit: 120, period: 60) do |req|
    req.ip if req.post? && req.path.start_with?("/commerce/webhooks/")
  end
```

- [ ] **Step 7: Write the failing controller test**

Create `test/controllers/commerce/checkouts_test.rb` covering: signed-out `POST` → redirect to sign-in and no purchase; another user's route → 404 with no body distinction; a route with no quote → 422 and the localized `commerce.checkout.no_quote` message; the happy path → redirect to the provider URL with the quote attached; and a repeat `POST` for an already-paid route → 422 `already_purchased`. Stub the adapter with `Commerce::PaymentProvider.stub(:resolve, Commerce::PaymentProvider::Available.new(adapter: Commerce::Providers::Fake.new)) { ... }`.

- [ ] **Step 8: Write the controller**

Create `app/controllers/commerce/checkouts_controller.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  class CheckoutsController < ApplicationController
    before_action :authenticate_user!

    def create
      route = LearningRoutesEngine::LearningRoute.includes(:learning_profile).find_by(id: params[:route_id])
      # A route the caller does not own must be indistinguishable from one that
      # does not exist.
      return head(:not_found) if route.nil?

      provider = PaymentProvider.resolve
      return reject("provider_unavailable") unless provider.available?

      result = CheckoutCreator.call(
        user: current_user, route: route, adapter: provider.adapter,
        success_url: purchase_return_url(route), cancel_url: route_url_for(route)
      )
      return reject(result.reason) unless result.created?

      redirect_to result.checkout_url, allow_other_host: true, status: :see_other
    end

    private

    def reject(reason)
      return head(:not_found) if reason == "not_owner"

      message = t("commerce.checkout.#{reason}", default: t("commerce.checkout.unavailable"))
      respond_to do |format|
        format.json { render json: { error: reason }, status: :unprocessable_entity }
        format.any  { redirect_back fallback_location: main_app.dashboard_path, alert: message, status: :see_other }
      end
    end

    def purchase_return_url(route)
      learning_routes_engine.route_url(route, purchase: "pending")
    end

    def route_url_for(route)
      learning_routes_engine.route_url(route)
    end
  end
end
```

- [ ] **Step 9: Add the copy in both locales**

`config/locales/en.yml`, under a new top-level `commerce:` key:

```yaml
    checkout:
      no_quote: "This route does not have a price yet. Try again in a moment."
      quote_expired: "That price has expired. Refresh the page to get a new one."
      already_purchased: "You already own this route."
      provider_unavailable: "Payments are not available right now."
      provider_error: "We could not start the checkout. Nothing was charged."
      unavailable: "Checkout is not available right now."
```

`config/locales/es.yml`:

```yaml
    checkout:
      no_quote: "Esta ruta todavía no tiene precio. Inténtalo de nuevo en un momento."
      quote_expired: "Ese precio ha expirado. Actualiza la página para obtener uno nuevo."
      already_purchased: "Ya tienes esta ruta."
      provider_unavailable: "Los pagos no están disponibles en este momento."
      provider_error: "No pudimos iniciar el pago. No se te ha cobrado nada."
      unavailable: "El pago no está disponible en este momento."
```

- [ ] **Step 10: Run the controller test and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/controllers/commerce/checkouts_test.rb`
Expected: PASS, 0 failures, 0 errors.

- [ ] **Step 11: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce/checkout_creator.rb app/controllers/commerce app/models/commerce/route_quote.rb config/routes.rb config/initializers/rack_attack.rb config/locales test/services/commerce/checkout_creator_test.rb test/controllers/commerce
git commit -m "feat(commerce): create custom-price checkouts from the immutable quote"
```

---

## Task 6: Verify and process `order_created` webhooks

The single most security-critical task in WP-18. The order of operations is not negotiable: verify the signature on the raw body, claim the event identity, then validate every business field against the local quote, then and only then write.

**Files:**
- Create: `app/services/commerce/order_processor.rb`
- Create: `app/controllers/commerce/webhooks_controller.rb`
- Create: `test/services/commerce/order_processor_test.rb`
- Create: `test/controllers/commerce/webhooks_test.rb`
- Modify: `config/initializers/rack_attack.rb` (already added in Task 5 Step 6 — verify it is present)

**Interfaces:**
- Consumes: `Commerce::PaymentProvider::Event`, `Commerce::ProviderEvent.claim!`, `Commerce::RoutePurchase`.
- Produces: `Commerce::OrderProcessor.call(event:, provider_name:)` → `Processed(purchase:)`, `Ignored(reason:)` or `Rejected(reason:)`. `Rejected` reasons: `mode_mismatch|store_mismatch|currency_mismatch|amount_mismatch|unknown_route|unknown_quote|unknown_user|ownership_mismatch|quote_not_attached|already_paid`.

- [ ] **Step 1: Write the failing processor test**

Create `test/services/commerce/order_processor_test.rb` with the Task 2 `setup`/`build_quote` helpers plus a pending purchase created through `Commerce::CheckoutCreator` with `Commerce::Providers::Fake`, then:

```ruby
  def event(**overrides)
    Commerce::PaymentProvider::Event.new({
      identity: "order_created:ord_1", name: "order_created", test_mode: true,
      store_id: "1", order_id: "ord_1", checkout_id: "chk_#{@quote.id}",
      amount_cents: @quote.final_price_cents, currency: "USD",
      actual_fee_cents: 45, refunded_amount_cents: 0,
      custom_route_id: @route.id, custom_quote_id: @quote.id, custom_user_id: @user.id,
      status: "paid"
    }.merge(overrides))
  end

  def process(e = event) = Commerce::OrderProcessor.call(event: e, provider_name: "lemon_squeezy")

  test "a valid order marks the purchase paid and records the actual fee" do
    result = process

    assert result.processed?, result.try(:reason)
    purchase = result.purchase.reload
    assert_equal "paid", purchase.state
    assert_equal "ord_1", purchase.provider_order_id
    assert_equal 45, purchase.actual_fee_cents
    assert_equal "purchase", @quote.reload.attachment_state
  end

  test "replaying the same event does not create a second purchase or re-enqueue generation" do
    process
    assert_enqueued_jobs 0 do
      second = process
      assert_not second.processed?
      assert_equal "duplicate_event", second.reason
    end
    assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count
  end

  test "an amount that disagrees with the quote is rejected and nothing is paid" do
    result = process(event(amount_cents: @quote.final_price_cents - 1))

    assert_not result.processed?
    assert_equal "amount_mismatch", result.reason
    assert_equal 0, Commerce::RoutePurchase.paid.count
  end

  test "a currency, store or mode mismatch is rejected" do
    assert_equal "currency_mismatch", process(event(identity: "e1", currency: "EUR")).reason
    assert_equal "store_mismatch",    process(event(identity: "e2", store_id: "999")).reason
    assert_equal "mode_mismatch",     process(event(identity: "e3", test_mode: false)).reason
    assert_equal 0, Commerce::RoutePurchase.paid.count
  end

  test "a quote belonging to another user is rejected" do
    stranger = Core::User.create!(
      name: "Thief", email: "t-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    result = process(event(custom_user_id: stranger.id))

    assert_not result.processed?
    assert_equal "ownership_mismatch", result.reason
  end

  test "an unknown route, quote or user is rejected without raising" do
    assert_equal "unknown_route", process(event(identity: "u1", custom_route_id: SecureRandom.uuid)).reason
    assert_equal "unknown_quote", process(event(identity: "u2", custom_quote_id: SecureRandom.uuid)).reason
    assert_equal "unknown_user",  process(event(identity: "u3", custom_user_id: SecureRandom.uuid)).reason
  end

  test "an out-of-order refund arriving before the order is ignored, not applied" do
    result = Commerce::OrderProcessor.call(
      event: event(identity: "r1", name: "order_refunded"), provider_name: "lemon_squeezy"
    )
    assert_not result.processed?
    assert_equal "unsupported_event", result.reason
  end

  test "a rejected event is recorded with its reason for reconciliation" do
    process(event(amount_cents: 1))
    stored = Commerce::ProviderEvent.find_by!(event_identity: "order_created:ord_1")
    assert_equal "rejected", stored.processing_state
    assert_equal "amount_mismatch", stored.rejection_reason
  end

  test "a paid order enqueues paid-module generation exactly once" do
    assert_enqueued_with(job: Commerce::PaidModuleGenerationJob) { process }
  end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/order_processor_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::OrderProcessor`.

- [ ] **Step 3: Write the processor**

Create `app/services/commerce/order_processor.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # Turns a SIGNATURE-VERIFIED provider event into an entitlement, or refuses.
  #
  # The signature proves the message came from the provider. It proves nothing
  # about whether the message is about a route this user may buy, at the price
  # they were quoted, in the mode we are running. Every one of those is checked
  # here against local records before anything is written.
  class OrderProcessor
    Processed = Data.define(:purchase) do
      def processed? = true
    end
    Ignored = Data.define(:reason) do
      def processed? = false
    end
    Rejected = Data.define(:reason) do
      def processed? = false
    end

    SUPPORTED_EVENTS = %w[order_created].freeze

    def self.call(event:, provider_name:)
      new(event, provider_name).call
    end

    def initialize(event, provider_name)
      @event = event
      @provider_name = provider_name
    end

    def call
      return Ignored.new(reason: "unsupported_event") unless SUPPORTED_EVENTS.include?(@event.name)

      # Claim FIRST. The unique index decides which concurrent delivery of the
      # same identity proceeds; the loser stops here without touching a purchase.
      record = ProviderEvent.claim!(
        provider: @provider_name, event_identity: @event.identity, event_name: @event.name,
        test_mode: @event.test_mode, evidence: evidence
      )
      return Ignored.new(reason: "duplicate_event") if record.nil?

      reason = rejection_reason
      if reason
        record.mark_rejected!(reason: reason)
        Rails.logger.error(
          "[Webhook] rejected #{@event.name} #{@event.identity}: #{reason} " \
          "route=#{@event.custom_route_id} quote=#{@event.custom_quote_id}"
        )
        return Rejected.new(reason: reason)
      end

      purchase = apply!
      record.mark_processed!
      PaidModuleGenerationJob.perform_later(purchase.id)
      Processed.new(purchase: purchase)
    end

    private

    def evidence
      {
        "order_id" => @event.order_id, "checkout_id" => @event.checkout_id,
        "store_id" => @event.store_id, "amount_cents" => @event.amount_cents,
        "currency" => @event.currency, "actual_fee_cents" => @event.actual_fee_cents,
        "route_id" => @event.custom_route_id, "quote_id" => @event.custom_quote_id,
        "user_id" => @event.custom_user_id, "status" => @event.status
      }.compact
    end

    def configured = PaymentProvider.configuration

    # Ordered cheapest-first, and each check names only what disagreed.
    def rejection_reason
      return "mode_mismatch" unless @event.test_mode == !!configured[:test_mode]
      return "store_mismatch" unless @event.store_id.to_s == configured[:store_id].to_s
      return "currency_mismatch" unless @event.currency == "USD"

      return "unknown_route" if route.nil?
      return "unknown_user"  if user.nil?
      return "unknown_quote" if quote.nil?
      return "ownership_mismatch" unless quote.user_id == user.id && quote.learning_route_id == route.id
      return "ownership_mismatch" unless LearningRoutesEngine::LearningProfile
        .where(id: route.learning_profile_id, user_id: user.id).exists?

      # The price is the LOCAL quote's, never the provider's claim.
      return "amount_mismatch" unless @event.amount_cents == quote.final_price_cents
      return "quote_not_attached" unless quote.attachment_state == "checkout"
      return "already_paid" if RoutePurchase.paid.where(learning_route_id: route.id).exists?
      return "unknown_purchase" if purchase.nil?

      nil
    end

    def route
      return @route if defined?(@route)

      @route = LearningRoutesEngine::LearningRoute.find_by(id: @event.custom_route_id)
    end

    def user
      return @user if defined?(@user)

      @user = Core::User.find_by(id: @event.custom_user_id)
    end

    def quote
      return @quote if defined?(@quote)

      @quote = RouteQuote.find_by(id: @event.custom_quote_id)
    end

    def purchase
      return @purchase if defined?(@purchase)

      @purchase = RoutePurchase.where(route_quote_id: quote&.id, learning_route_id: route&.id,
                                      user_id: user&.id, state: "pending")
                               .order(created_at: :desc).first
    end

    def apply!
      ActiveRecord::Base.transaction do
        quote.attach!("purchase")
        purchase.mark_paid!(
          order_id: @event.order_id,
          actual_fee_cents: @event.actual_fee_cents,
          paid_at: Time.current,
          order_attributes: { provider_store_id: @event.store_id }
        )
        LearningRoutesEngine::RouteModule
          .where(learning_route_id: route.id, access_state: :locked)
          .update_all(access_state: LearningRoutesEngine::RouteModule.access_states[:purchased],
                      updated_at: Time.current)
        purchase
      end
    end
  end
end
```

- [ ] **Step 4: Write the controller**

Create `app/controllers/commerce/webhooks_controller.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # Provider webhooks are authenticated by raw-body signature, never by session,
  # so browser CSRF does not apply and must be skipped explicitly.
  class WebhooksController < ActionController::Base
    skip_forgery_protection

    def lemon_squeezy
      provider = PaymentProvider.resolve
      return head(:service_unavailable) unless provider.available?

      # The RAW body, before Rails parses anything. Reading `params` first would
      # mean validating fields an attacker chose.
      raw_body = request.raw_post
      signature = request.headers["X-Signature"]

      event = begin
        provider.adapter.verify_event(raw_body: raw_body, signature: signature)
      rescue PaymentProvider::SignatureError
        Rails.logger.warn("[Webhook] rejected an unsigned or wrongly signed delivery")
        return head(:unauthorized)
      rescue PaymentProvider::Error
        return head(:bad_request)
      end

      result = case event.name
      when "order_refunded" then RefundProcessor.call(event: event, provider_name: provider.adapter.name)
      else OrderProcessor.call(event: event, provider_name: provider.adapter.name)
      end

      # A duplicate or business rejection is still a delivery we have durably
      # recorded, so acknowledge it: making the provider retry forever helps
      # nobody and the row already says why.
      head(result.processed? ? :ok : :accepted)
    end
  end
end
```

- [ ] **Step 5: Write the failing controller test**

Create `test/controllers/commerce/webhooks_test.rb`. Use `Commerce::Providers::Fake` through a stubbed `PaymentProvider.resolve`, and cover:

```ruby
  test "an unsigned delivery is unauthorized and writes nothing" do
    post commerce_lemon_squeezy_webhook_path, params: valid_body, headers: { "CONTENT_TYPE" => "application/json" }

    assert_response :unauthorized
    assert_equal 0, Commerce::ProviderEvent.count
    assert_equal 0, Commerce::RoutePurchase.paid.count
  end

  test "a body mutated after signing is unauthorized" do
    body = valid_body
    signature = fake.sign(body)
    tampered = body.sub('"total":299', '"total":1')

    post commerce_lemon_squeezy_webhook_path, params: tampered,
         headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => signature }

    assert_response :unauthorized
    assert_equal 0, Commerce::RoutePurchase.paid.count
  end

  test "a correctly signed order marks the purchase paid" do
    body = valid_body

    post commerce_lemon_squeezy_webhook_path, params: body,
         headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }

    assert_response :ok
    assert_equal 1, Commerce::RoutePurchase.paid.count
  end

  test "the same signed delivery twice pays once" do
    body = valid_body
    2.times do
      post commerce_lemon_squeezy_webhook_path, params: body,
           headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }
    end

    assert_equal 1, Commerce::RoutePurchase.paid.count
    assert_equal 1, Commerce::ProviderEvent.count
  end

  test "no response body ever leaks a record id, a reason or a secret" do
    body = valid_body
    post commerce_lemon_squeezy_webhook_path, params: body,
         headers: { "CONTENT_TYPE" => "application/json", "X-Signature" => fake.sign(body) }

    assert_empty response.body.strip
  end

  test "a success redirect alone never unlocks content" do
    # The customer returns from the provider with no webhook delivered.
    sign_in_as(@user)
    get learning_routes_engine.route_path(@route, purchase: "pending")

    assert_response :success
    assert_equal 0, Commerce::RoutePurchase.paid.count
    assert_not LearningRoutesEngine::ModuleAccessPolicy.allowed_step?(user: @user, step_id: @paid_step.id)
  end
```

- [ ] **Step 6: Run both tests and confirm they pass**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/order_processor_test.rb test/controllers/commerce/webhooks_test.rb`
Expected: PASS, 0 failures, 0 errors. Note that `PaidModuleGenerationJob` does not exist yet — define it as an empty `ApplicationJob` subclass in `app/jobs/commerce/paid_module_generation_job.rb` now so the enqueue assertion works, and fill it in during Task 8.

- [ ] **Step 7: Prove concurrency safety with real connections**

Add to `test/services/commerce/order_processor_test.rb`:

```ruby
  test "two simultaneous deliveries of one event produce exactly one paid purchase" do
    body_event = event
    results = []
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          results << Commerce::OrderProcessor.call(event: body_event, provider_name: "lemon_squeezy")
        end
      end
    end
    threads.each(&:join)

    assert_equal 1, results.count(&:processed?)
    assert_equal 1, Commerce::RoutePurchase.paid.where(learning_route_id: @route.id).count
    assert_equal 1, Commerce::ProviderEvent.where(event_identity: body_event.identity).count
  end
```

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/order_processor_test.rb`
Expected: PASS.

- [ ] **Step 8: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce/order_processor.rb app/controllers/commerce/webhooks_controller.rb app/jobs/commerce test/services/commerce/order_processor_test.rb test/controllers/commerce/webhooks_test.rb
git commit -m "feat(commerce): verify and idempotently process order webhooks"
```

---

## Task 7: Entitle paid modules

`ModuleAccessPolicy` currently answers "is this step in the preview module?". It must now answer "is this step in the preview module, **or** in a module of a route this user has paid for?" — and, per the owner's decision, customer access derives from `LearningProfile` ownership alone, never from the `owner` role.

**Files:**
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb`
- Create: `test/services/learning_routes_engine/module_entitlement_test.rb`
- Modify: `test/controllers/learning_routes_engine/module_lock_authorization_test.rb`

**Interfaces:**
- Consumes: `Commerce::RoutePurchase.entitled?(route_id:)`.
- Produces: unchanged signatures — `ModuleAccessPolicy.allowed?(user:, route_id:, step_id:)`, `.allowed_step?(user:, step_id:)`, `.cache_key(user:, step:)`. `cache_key` gains an entitlement component.

- [ ] **Step 1: Write the failing test**

Create `test/services/learning_routes_engine/module_entitlement_test.rb`:

```ruby
require "test_helper"

class LearningRoutesEngine::ModuleEntitlementTest < ActiveSupport::TestCase
  Policy = LearningRoutesEngine::ModuleAccessPolicy

  def setup
    @user = Core::User.create!(
      name: "Owner", email: "own-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "AWS", locale: "en", status: :active
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    @locked = LearningRoutesEngine::RouteModule.create!(
      learning_route: @route, position: 2, title: "Paid", access_state: :locked, generation_state: :outlined
    )
    @free_step = @route.route_steps.create!(
      route_module: @preview, position: 0, title: "Free", level: 1, bloom_level: 1,
      content_type: :lesson, delivery_format: "text", status: :available
    )
    @paid_step = @route.route_steps.create!(
      route_module: @locked, position: 1, title: "Paid", level: 1, bloom_level: 1,
      content_type: :lesson, delivery_format: "text", status: :locked
    )
  end

  test "before payment the preview is readable and the paid module is not" do
    assert Policy.allowed_step?(user: @user, step_id: @free_step.id)
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "a PENDING purchase entitles nothing" do
    create_purchase(state: "pending")
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "a paid purchase entitles every module of that route" do
    pay!
    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)
    assert Policy.allowed?(user: @user, route_id: @route.id, step_id: @paid_step.id)
  end

  test "entitlement never crosses to another user's route" do
    pay!
    stranger = Core::User.create!(
      name: "Str", email: "str-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current
    )
    assert_not Policy.allowed_step?(user: stranger, step_id: @paid_step.id)
  end

  test "the owner role grants no entitlement to a route the owner does not own" do
    pay!
    owner = Core::User.create!(
      name: "Boss", email: "boss-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, role: :owner
    )
    assert_not Policy.allowed_step?(user: owner, step_id: @paid_step.id)
  end

  # The owner's decision: customer access follows LearningProfile ownership, so
  # the owner can use and buy their OWN routes. The role adds nothing.
  test "the owner may read their own route's preview and their own paid content" do
    @user.update!(role: :owner)
    assert Policy.allowed_step?(user: @user, step_id: @free_step.id)
    assert_not Policy.allowed_step?(user: @user, step_id: @paid_step.id)

    pay!
    assert Policy.allowed_step?(user: @user, step_id: @paid_step.id)
  end

  test "the cache key changes when entitlement changes" do
    before = Policy.cache_key(user: @user, step: @paid_step)
    pay!
    assert_not_equal before, Policy.cache_key(user: @user, step: @paid_step.reload)
  end

  private

  def create_purchase(state:)
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: @route, currency: "USD",
      total_module_count: 2, paid_module_count: 1,
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40,
      markup_basis_points: Commerce::PricingConstants::MARKUP_BASIS_POINTS,
      minimum_price_per_paid_module_cents: Commerce::PricingConstants::MINIMUM_PRICE_PER_PAID_MODULE_CENTS,
      cost_based_price_cents: 210, minimum_price_cents: 299, final_price_cents: 299,
      estimator_version: "v1", provider_rate_versions: { "m" => "1" }, fee_version: "f1",
      image_quality: "medium", route_shape_assumptions: { "outline" => [] },
      provider_rate_assumptions: { "m" => {} }, fee_assumptions: { "version" => "f1" },
      expires_at: 24.hours.from_now
    )
    Commerce::RoutePurchase.create!(
      user: @user, learning_route: @route, route_quote: quote, state: state,
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    )
  end

  def pay!
    create_purchase(state: "pending")
      .mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
  end
end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/learning_routes_engine/module_entitlement_test.rb`
Expected: FAIL — the paid-purchase tests fail because the policy still only accepts `preview`, and the owner tests fail on the `user.owner?` short-circuit.

- [ ] **Step 3: Rewrite the policy**

Replace `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb`:

```ruby
# frozen_string_literal: true

module LearningRoutesEngine
  # The one answer to "may this user read this step's content?".
  #
  # Access is ownership plus reachability, and nothing else:
  #   * the user owns the route through LearningProfile#user_id, AND
  #   * the step's module is the free preview, OR the route has a paid purchase.
  #
  # The `owner` ROLE grants nothing here. WP-16's dashboard gives the owner
  # metadata through /admin; it must never become customer entitlement. An owner
  # reading their OWN route is allowed for the same reason any user is: they own
  # the LearningProfile, not because of their role.
  class ModuleAccessPolicy
    def self.allowed?(user:, route_id:, step_id:)
      return false unless user

      step = owned_step(user: user, step_id: step_id, route_id: route_id)
      return false if step.nil?

      reachable?(step)
    end

    def self.allowed_step?(user:, step_id:)
      allowed?(user: user, route_id: nil, step_id: step_id)
    end

    # Two bounded queries at most, and only when the module is not the preview.
    def self.owned_step(user:, step_id:, route_id: nil)
      scope = RouteStep.joins(:route_module, learning_route: :learning_profile)
        .where(id: step_id)
        .where(learning_routes_engine_learning_profiles: { user_id: user.id })
      scope = scope.where(learning_route_id: route_id) if route_id.present?

      scope.pick(
        "learning_routes_engine_route_steps.learning_route_id",
        "learning_routes_engine_route_modules.access_state"
      )&.then { |route, access| { route_id: route, access_state: access } }
    end
    private_class_method :owned_step

    def self.reachable?(step)
      preview = RouteModule.access_states[:preview]
      return true if step[:access_state] == preview || step[:access_state].to_s == "preview"

      Commerce::RoutePurchase.entitled?(route_id: step[:route_id])
    end
    private_class_method :reachable?

    # Entitlement is part of the cache identity. Without it a body cached while
    # the route was locked could be served after purchase, or worse, the reverse.
    def self.cache_key(user:, step:)
      route_module = RouteModule.find(step.route_module_id)
      entitled = Commerce::RoutePurchase.entitled?(route_id: step.learning_route_id)
      ["route-content-v2", user.id, step.learning_route_id, route_module.id,
       route_module.access_state, route_module.updated_at.to_i,
       entitled ? "entitled" : "unentitled", step.id, step.updated_at.to_i]
    end
  end
end
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/learning_routes_engine/module_entitlement_test.rb`
Expected: PASS, 8 runs.

- [ ] **Step 5: Re-run every existing lock test**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/controllers/learning_routes_engine test/system/route_module_locks_test.rb`
Expected: 0 failures, 0 errors. WP-17's `module_lock_authorization_test.rb` asserts the owner receives 403 for another user's step; that still holds. If any test asserted the owner is denied their **own** preview, update it — the owner's decision changed that deliberately, and the change must be visible in the diff.

- [ ] **Step 6: Add the cross-format direct-request negative controls**

Append to `test/controllers/learning_routes_engine/module_lock_authorization_test.rb` a loop proving a locked step is refused for HTML, JSON and Turbo Stream **and** that the same step becomes readable in all three once a paid purchase exists — the positive control is what proves the lock is entitlement-driven rather than permanently closed.

- [ ] **Step 7: Inspect and commit**

```bash
git diff
git diff --check
git add engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb test/services/learning_routes_engine/module_entitlement_test.rb test/controllers/learning_routes_engine
git commit -m "feat(commerce): entitle paid modules from a verified purchase"
```

---

## Task 8: Generate purchased modules

Payment authorizes generation; it does not perform it. The job must be safe to run twice, must not regenerate content that already exists, and must let one module fail without blocking the rest or triggering another charge.

**Files:**
- Modify: `app/jobs/commerce/paid_module_generation_job.rb` (stub created in Task 6)
- Create: `test/jobs/commerce/paid_module_generation_job_test.rb`
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/content_prefetcher.rb`

**Interfaces:**
- Consumes: `Commerce::RoutePurchase#paid?`, `LearningRoutesEngine::ContentPrefetcher.pending_step_ids`, `.prefetch`.
- Produces: `Commerce::PaidModuleGenerationJob.perform_later(purchase_id)`. `ContentPrefetcher.pending_step_ids(route, after_position:, limit:)` and `.available_slots(route)` become entitlement-aware rather than preview-only.

- [ ] **Step 1: Write the failing test**

Create `test/jobs/commerce/paid_module_generation_job_test.rb` reusing the Task 7 `setup` and `pay!` helpers, plus:

```ruby
  test "an unpaid purchase generates nothing" do
    purchase = create_purchase(state: "pending")

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      Commerce::PaidModuleGenerationJob.perform_now(purchase.id)
    end
  end

  test "a paid purchase enqueues generation for paid steps that have no content" do
    purchase = pay!

    assert_enqueued_jobs 1, only: LearningRoutesEngine::ContentPipelineJob do
      Commerce::PaidModuleGenerationJob.perform_now(purchase.id)
    end
  end

  test "running it twice does not enqueue the same step twice" do
    purchase = pay!
    Commerce::PaidModuleGenerationJob.perform_now(purchase.id)

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      Commerce::PaidModuleGenerationJob.perform_now(purchase.id)
    end
  end

  test "content migrated into a paid module is never regenerated" do
    purchase = pay!
    @paid_step.update!(metadata: { "content_ready" => true })

    assert_no_enqueued_jobs(only: LearningRoutesEngine::ContentPipelineJob) do
      Commerce::PaidModuleGenerationJob.perform_now(purchase.id)
    end
  end

  test "a missing purchase id is a no-op rather than a raise" do
    assert_nothing_raised { Commerce::PaidModuleGenerationJob.perform_now(SecureRandom.uuid) }
  end

  test "a module marked failed can be retried without a second charge" do
    purchase = pay!
    @locked.update!(generation_state: :failed)

    assert_enqueued_jobs 1, only: LearningRoutesEngine::ContentPipelineJob do
      Commerce::PaidModuleGenerationJob.perform_now(purchase.id)
    end
    assert_equal 1, Commerce::RoutePurchase.paid.count, "retry must never create a second purchase"
  end
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/jobs/commerce/paid_module_generation_job_test.rb`
Expected: FAIL — the stub job enqueues nothing.

- [ ] **Step 3: Make the prefetcher entitlement-aware**

In `engines/learning_routes_engine/app/services/learning_routes_engine/content_prefetcher.rb`, the three preview-only filters must become "preview, or entitled". Introduce one private helper and use it in all three places so the rule cannot drift:

```ruby
      # A module may be generated when it is the free preview, or when its route
      # has a paid purchase. Enum integers are interpolated from the model, never
      # written as literals: `access_state = 0` in raw SQL silently breaks the day
      # the enum is reordered.
      def generatable_module_states(route)
        states = [RouteModule.access_states[:preview]]
        if Commerce::RoutePurchase.entitled?(route_id: route.id)
          states << RouteModule.access_states[:purchased]
          states << RouteModule.access_states[:locked]
        end
        states
      end
```

Replace the `where(learning_routes_engine_route_modules: { access_state: :preview })` clause in `available_slots` and `pending_step_ids` with `where(learning_routes_engine_route_modules: { access_state: generatable_module_states(route) })`, and replace the `modules.access_state = 0` literal in `claim`'s raw SQL with a sanitized `IN (?)` bind over the same helper. `claim` currently receives only step ids, so change its signature to `claim(route, step_ids)` and update the one caller in `prefetch`.

- [ ] **Step 4: Write the job**

Replace `app/jobs/commerce/paid_module_generation_job.rb`:

```ruby
# frozen_string_literal: true

module Commerce
  # Payment authorizes generation. It does not perform it, and it never repeats
  # it: `ContentPrefetcher.claim` flips content_generating in one atomic UPDATE,
  # so a replayed webhook or a manual retry enqueues nothing for a step already
  # ready or already in flight.
  class PaidModuleGenerationJob < ApplicationJob
    queue_as :default

    def perform(purchase_id)
      purchase = RoutePurchase.find_by(id: purchase_id)
      return if purchase.nil?
      return unless purchase.paid?

      route = LearningRoutesEngine::LearningRoute.find_by(id: purchase.learning_route_id)
      return if route.nil?

      step_ids = LearningRoutesEngine::ContentPrefetcher.pending_step_ids(route)
      return if step_ids.empty?

      claimed = LearningRoutesEngine::ContentPrefetcher.prefetch(route, step_ids)
      Rails.logger.info(
        "[PaidGeneration] purchase=#{purchase.id} route=#{route.id} " \
        "pending=#{step_ids.size} claimed=#{claimed.size}"
      )

      # Bounded self-rescheduling: MAX_IN_FLIGHT_PER_ROUTE caps how many pipelines
      # one route may hold, so a long route finishes across several passes instead
      # of starving the shared queue.
      if claimed.size < step_ids.size
        self.class.set(wait: 45.seconds).perform_later(purchase_id)
      end
    end
  end
end
```

- [ ] **Step 5: Run the job and prefetcher tests**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/jobs/commerce/paid_module_generation_job_test.rb test/services/learning_routes_engine test/controllers/learning_routes_engine/content_failure_test.rb`
Expected: PASS, 0 failures, 0 errors. `ContentPrefetcherTest` must still pass unchanged for unpaid routes.

- [ ] **Step 6: Inspect and commit**

```bash
git diff
git diff --check
git add app/jobs/commerce/paid_module_generation_job.rb engines/learning_routes_engine/app/services/learning_routes_engine/content_prefetcher.rb test/jobs/commerce
git commit -m "feat(commerce): generate purchased modules once payment is verified"
```

---

## Task 9: Record refunds

A refund is recorded, not acted upon. The spec defers automatic access revocation, so the entitlement stays and the dashboard tells the truth about the money.

**Files:**
- Create: `app/services/commerce/refund_processor.rb`
- Create: `test/services/commerce/refund_processor_test.rb`

**Interfaces:**
- Produces: `Commerce::RefundProcessor.call(event:, provider_name:)` → `Processed(purchase:)`, `Ignored(reason:)` or `Rejected(reason:)`.

- [ ] **Step 1: Write the failing test**

Create `test/services/commerce/refund_processor_test.rb` covering: a refund for a paid purchase sets `state = "refunded"`, `refunded_amount_cents` and `refunded_at`; access is **unchanged** afterwards (`ModuleAccessPolicy.allowed_step?` still true — assert this explicitly, it is a deliberate policy, not an oversight); a replayed refund event is `duplicate_event` and does not double-record; a refund for an unknown or unpaid purchase is `Rejected` with `unknown_purchase`; a partial refund records the partial amount; and a store or mode mismatch is rejected exactly as in `OrderProcessor`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/refund_processor_test.rb`
Expected: FAIL — `NameError: uninitialized constant Commerce::RefundProcessor`.

- [ ] **Step 3: Write the processor**

Create `app/services/commerce/refund_processor.rb` mirroring `OrderProcessor`'s structure: same `Processed`/`Ignored`/`Rejected` results, same claim-first ordering through `ProviderEvent.claim!`, same mode/store/currency checks. It differs only in what it applies:

```ruby
    def apply!
      purchase.mark_refunded!(
        refunded_amount_cents: @event.refunded_amount_cents || purchase.amount_cents,
        refunded_at: Time.current
      )
      # Access is NOT revoked. The spec defers automatic post-refund revocation
      # to an approved policy; the dashboard still reports the refund honestly.
      purchase
    end
```

and it resolves `purchase` by `provider_order_id` rather than by pending state:

```ruby
    def purchase
      return @purchase if defined?(@purchase)

      @purchase = RoutePurchase.find_by(provider: @provider_name, provider_order_id: @event.order_id)
    end
```

with `rejection_reason` returning `"unknown_purchase"` when `purchase.nil? || !purchase.paid?`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/services/commerce/refund_processor_test.rb`
Expected: PASS.

- [ ] **Step 5: Inspect and commit**

```bash
git diff
git diff --check
git add app/services/commerce/refund_processor.rb test/services/commerce/refund_processor_test.rb
git commit -m "feat(commerce): record refunds without revoking access"
```

---

## Task 10: Report real commerce facts on the owner dashboard

WP-16 left `commerce_available: false` as an explicit seam and WP-17 left it alone because no commerce records existed. They exist now. Flip the seam, and report only what is persisted.

**Files:**
- Create: `app/queries/admin/commerce_summary_query.rb`
- Create: `test/queries/admin/commerce_summary_query_test.rb`
- Modify: `app/queries/admin/dashboard_summary_query.rb`
- Modify: `app/queries/admin/user_detail_query.rb`
- Modify: `app/views/admin/dashboard/show.html.erb`, `app/views/admin/users/show.html.erb`
- Modify: `config/locales/en.yml`, `config/locales/es.yml`
- Modify: `test/controllers/admin/users_test.rb`, `test/controllers/admin/dashboard_test.rb`

**Interfaces:**
- Produces: `Admin::CommerceSummaryQuery.call` → `Result(gross_revenue_cents:, actual_fee_cents:, estimated_fee_cents:, actual_cost_microcents:, buyers:, non_buyers:, purchased_routes:, quoted_routes:, refunded_count:, failed_count:, conversion_basis_points:)`. `Admin::DashboardSummaryQuery::Result#commerce_available` becomes `true`.

- [ ] **Step 1: Write the failing query test**

Create `test/queries/admin/commerce_summary_query_test.rb` asserting: zero records produce zeros and never `nil`; one paid purchase produces its exact `amount_cents` as gross revenue; `actual_fee_cents` sums only non-null actual fees and `estimated_fee_cents` is reported separately so the view can label the estimate; a refunded purchase is counted in `refunded_count` and still in gross revenue (it was paid — netting is a display decision, not a silent subtraction); `conversion_basis_points` is integer basis points, never a Float; and **query count is fixed**:

```ruby
  test "the summary costs a fixed number of queries at any volume" do
    assert_equal query_count_for { Admin::CommerceSummaryQuery.call },
                 begin
                   30.times { create_paid_purchase }
                   query_count_for { Admin::CommerceSummaryQuery.call }
                 end
  end
```

using the same `query_count_for` helper WP-16 established in `test/queries/admin/user_detail_query_test.rb`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/queries/admin/commerce_summary_query_test.rb`
Expected: FAIL — `NameError: uninitialized constant Admin::CommerceSummaryQuery`.

- [ ] **Step 3: Write the query**

Create `app/queries/admin/commerce_summary_query.rb` as a single `select_one` over `commerce_route_purchases` and `commerce_route_quotes`, following the exact shape of `Admin::DashboardSummaryQuery` — one SQL statement, scalar sub-selects, `COALESCE(..., 0)` on every sum, integer casts on the way out, and no Float anywhere. Conversion is `ROUND(buyers * 10000.0 / NULLIF(users_with_routes, 0))` cast to integer basis points, with `NULL` mapped to `0`.

- [ ] **Step 4: Flip the seam and render the facts**

In `app/queries/admin/dashboard_summary_query.rb`, add the commerce fields to `Result` and set `commerce_available: true`. Same in `app/queries/admin/user_detail_query.rb` for each route row: `purchase_state`, `paid_amount_cents`, `actual_fee_cents`, `fee_is_estimated` (Boolean), `profit_microcents`.

In the views, render money by converting integer cents at the **view boundary only**, and render the fee with an explicit estimated/actual label:

```erb
<span data-route-fee data-fee-estimated="<%= route.fee_is_estimated %>">
  <%= number_to_currency(route.actual_fee_cents.to_i / 100.0) %>
  <% if route.fee_is_estimated %>
    <span class="admin-badge"><%= t("admin.commerce.fee_estimated") %></span>
  <% end %>
</span>
```

- [ ] **Step 5: Add the copy in both locales**

Add `admin.commerce.*` keys for: `gross_revenue`, `actual_fee`, `fee_estimated`, `fee_actual`, `net_profit`, `margin`, `buyers`, `non_buyers`, `refunded`, `failed_payments`, `conversion`, `purchase_state.pending|paid|failed|refunded`, `not_purchased`. Both `en.yml` and `es.yml`.

- [ ] **Step 6: Update the WP-16 guard test**

`test/controllers/admin/users_test.rb` asserts `assert_no_match(/purchase|revenue|profit|fee|quote|payment/i, ...)` against **rendered document text** (WP-17 commit `a8b5afc` narrowed it from the raw body). That assertion was correct while no commerce records existed and is now wrong. Replace it with the assertion that actually protects the customer: the drill-down must never render internal AI cost, markup or fee **assumptions**, and must never render a value for a route with no purchase.

```ruby
    assert_no_match(/markup|basis.?points|microcent|assumption/i, rendered_text)
    assert_select "[data-route-id='#{@unpurchased_route.id}'] [data-route-paid-amount]", text: /—|not purchased/i
```

- [ ] **Step 7: Run the admin suites**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/queries test/controllers/admin test/system/owner_dashboard_test.rb`
Expected: PASS, 0 failures, 0 errors, including the fixed-query-count tests at both small and 30-record volumes.

- [ ] **Step 8: Inspect and commit**

```bash
git diff
git diff --check
git add app/queries/admin app/views/admin config/locales test/queries test/controllers/admin
git commit -m "feat(admin): report persisted revenue, fees and profit"
```

---

## Task 11: The customer purchase panel

What the customer sees. Module count, one fixed USD total, one-time wording — and nothing about what it cost us.

**Files:**
- Create: `engines/learning_routes_engine/app/views/learning_routes_engine/routes/_purchase_panel.html.erb`
- Modify: `engines/learning_routes_engine/app/views/learning_routes_engine/routes/show.html.erb`
- Modify: `engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb`
- Create: `test/controllers/learning_routes_engine/purchase_panel_test.rb`
- Modify: `test/system/route_module_locks_test.rb`
- Modify: `config/locales/en.yml`, `config/locales/es.yml`

**Interfaces:**
- Consumes: `Commerce::RouteQuote` active unattached quote, `Commerce::RoutePurchase.entitled?`, `commerce_route_checkout_path`.
- Produces: `@purchase_panel` assigned in `RoutesController#show`, a `Data` with `paid_module_count`, `price_cents`, `state` in `unavailable|purchasable|pending|owned`.

- [ ] **Step 1: Write the failing test**

Create `test/controllers/learning_routes_engine/purchase_panel_test.rb` asserting: an unquoted route shows the unavailable state and **no** buy button; a quoted route shows the exact `final_price_cents` formatted as USD and the paid-module count; the page never contains the words matching `/markup|microcent|basis.?point|ai cost|assumption/i`; returning with `?purchase=pending` shows the pending state and still no unlocked content; and an entitled route shows the owned state with no buy button. Assert in **both** locales by setting `@user.update!(locale: "es")` and re-requesting.

- [ ] **Step 2: Run it and confirm it fails**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/controllers/learning_routes_engine/purchase_panel_test.rb`
Expected: FAIL — no panel is rendered.

- [ ] **Step 3: Build the view model in the controller**

In `RoutesController#show`, after the existing authorization, add a private method that returns the panel state from persisted records only, eager-loading nothing lazily:

```ruby
    PurchasePanel = Data.define(:state, :paid_module_count, :price_cents)

    def build_purchase_panel(route)
      return PurchasePanel.new(state: "owned", paid_module_count: 0, price_cents: nil) if
        Commerce::RoutePurchase.entitled?(route_id: route.id)

      pending = Commerce::RoutePurchase.where(learning_route_id: route.id, user_id: current_user.id,
                                              state: "pending").exists?
      quote = Commerce::RouteQuote.where(learning_route_id: route.id, user_id: current_user.id,
                                         superseded_at: nil, attachment_state: "unattached")
                                  .order(created_at: :desc).first
      return PurchasePanel.new(state: "pending", paid_module_count: 0, price_cents: nil) if pending
      return PurchasePanel.new(state: "unavailable", paid_module_count: 0, price_cents: nil) if quote.nil?

      PurchasePanel.new(state: "purchasable", paid_module_count: quote.paid_module_count,
                        price_cents: quote.final_price_cents)
    end
```

- [ ] **Step 4: Write the partial**

Create `_purchase_panel.html.erb`. It renders `t("commerce.panel.unlock", count: panel.paid_module_count)`, the price via `number_to_currency(panel.price_cents / 100.0)` — the only place integer cents become a decimal — `t("commerce.panel.one_time")`, and a `button_to commerce_route_checkout_path(route)` only in the `purchasable` state. It renders no cost, markup, fee or quote identifier.

- [ ] **Step 5: Add the copy in both locales**

`en.yml`:

```yaml
    panel:
      unlock:
        one: "Unlock 1 more module"
        other: "Unlock %{count} more modules"
      one_time: "One-time payment. No subscription."
      buy: "Unlock the full route"
      pending: "We are confirming your payment. This page updates when it completes."
      owned: "You own this route."
      unavailable: "Pricing for this route is not ready yet."
```

`es.yml`:

```yaml
    panel:
      unlock:
        one: "Desbloquea 1 módulo más"
        other: "Desbloquea %{count} módulos más"
      one_time: "Pago único. Sin suscripción."
      buy: "Desbloquea la ruta completa"
      pending: "Estamos confirmando tu pago. Esta página se actualizará al terminar."
      owned: "Ya tienes esta ruta."
      unavailable: "El precio de esta ruta aún no está listo."
```

- [ ] **Step 6: Run the test and the browser lock suite**

Run: `env -u RAILS_MASTER_KEY bin/rails test test/controllers/learning_routes_engine/purchase_panel_test.rb test/system/route_module_locks_test.rb`
Expected: PASS, 0 failures, 0 errors.

- [ ] **Step 7: Inspect and commit**

```bash
git diff
git diff --check
git add engines/learning_routes_engine/app/views engines/learning_routes_engine/app/controllers config/locales test/controllers/learning_routes_engine/purchase_panel_test.rb test/system
git commit -m "feat(routes): show the fixed one-time price without exposing our costs"
```

---

## Task 12: Acceptance gate, review and handoff

**Files:**
- Create: `WP18_HANDOFF.md`
- Create: `FINDINGS_WP18.md`

- [ ] **Step 1: Run every suite three times and record exact numbers**

```bash
for i in 1 2 3; do env -u RAILS_MASTER_KEY bin/rails test 2>&1 | grep -E "^[0-9]+ runs"; done
for i in 1 2 3; do env -u RAILS_MASTER_KEY bin/rails test test/system 2>&1 | grep -E "^[0-9]+ runs"; done
for i in 1 2 3; do env -u RAILS_MASTER_KEY bin/rails test test engines/*/test 2>&1 | grep -E "^[0-9]+ runs"; done
```

Expected: main and browser fully green on all three runs; combined shows **exactly** the four documented failures and nothing else. Any fifth name is a regression this branch caused — fix it in its own tested commit.

- [ ] **Step 2: Run the security tools and diff against the recorded baselines**

```bash
env -u RAILS_MASTER_KEY bundle exec brakeman --no-pager --no-exit-on-warn -f plain | tail -30
env -u RAILS_MASTER_KEY bin/importmap audit
bundle exec bundler-audit check --update
bin/rubocop
```

Expected: Brakeman still exactly 1 medium Mass Assignment at `block_attempts_controller.rb:81` — **a second warning is a WP-18 regression**, most likely a `permit!` or an unsafe redirect in the new controllers. Importmap still 6. Bundler Audit still the single `rails-html-sanitizer` advisory, unchanged and unpinned. RuboCop clean.

- [ ] **Step 3: Run the leakage scan**

```bash
grep -rniE "lemon_squeezy.*(api_key|signing_secret)\s*=\s*[\"'][^\"']" app/ engines/ config/ test/ | grep -v credentials.dig | grep -v ENV
```

Expected: only the test fixtures' obviously fake values. No real key, in any file, ever.

- [ ] **Step 4: Requirements and security review**

Re-read the spec's "Required Verification → Automated" list and tick each line against a named test. Any line without one is a gap; add the test in its own commit. Then re-read "Security Requirements" and confirm each against the diff. Fix every Critical or Important finding in separate tested commits and record them in `FINDINGS_WP18.md`.

- [ ] **Step 5: Write the handoff**

`WP18_HANDOFF.md` must contain: changes; migrations and their rollback behaviour; decisions taken (including the owner's four WP-18 decisions and why quoting was wired here); evidence with exact seeds and counts; remaining risks; and manual checks. `FINDINGS_WP18.md` must record, at minimum:

- the unresolved `rails-html-sanitizer` CVE-2026-73648 advisory and the fact that no pin was changed;
- that no Lemon Squeezy call of any kind was made and no store, product, variant, API key, signing secret or fee schedule was configured, so quoting and checkout remain blocked until the owner supplies them;
- the Provider Readiness Gate items from the spec that remain outstanding;
- the four pre-existing combined-suite failures, by name, unchanged;
- the pre-existing Brakeman `permit!` warning and the six importmap advisories;
- that automatic post-refund access revocation is deliberately absent.

- [ ] **Step 6: Commit**

```bash
git add WP18_HANDOFF.md FINDINGS_WP18.md
git commit -m "docs(wp18): handoff, evidence and remaining risks"
```

- [ ] **Step 7: Stop**

Do not merge, push or deploy. Report the acceptance-gate results and wait.

---

## Self-review against the spec

**Coverage.** Every WP-18 line of the spec's Delivery Order item 5 maps to a task: checkout creation → Task 5; idempotent `order_created` → Task 6; `order_refunded` → Task 9; purchase records → Task 2; generation after confirmed payment → Task 8. Domain Model → Tasks 2, 3, 4. User Flow 6–10 → Tasks 5, 6, 8, 11. Actual cost attribution and the dashboard → Task 10. Failure Behavior: quote failure → Task 1 Step 8; checkout failure → Task 5 Step 1; rejected card → Task 6 (`Rejected` leaves access untouched); delayed/out-of-order webhook → Task 6 Step 1; mismatch alerts → Task 6 `rejection_reason` logging; paid-generation failure → Task 8; refund → Task 9. Security Requirements → Tasks 4, 5, 6, 7 and the Task 12 scans.

**Deliberately not covered here**, because the spec assigns them elsewhere: the vertical journey and the real-primary-route landing page (WP-19); closing the four suite failures and the dependency advisories (WP-4/WP-8); live-mode activation and deployment (human decision after WP-4/WP-8).

**Known gap requiring the owner.** Tasks 1, 5 and 6 are fully implementable and testable, but produce a system that refuses to quote and refuses every webhook until the owner supplies the fee schedule and the Lemon Squeezy store/product/variant/API key/signing secret. That is the approved fail-closed behaviour, not a defect — but it means WP-18 cannot reach the spec's "Real integration and browser" verification on this branch. Task 12 records that explicitly rather than claiming coverage the branch does not have.

**Type consistency.** `Commerce::PaymentProvider::Event` field names are used identically in Tasks 4, 6 and 9. `RoutePurchase#mark_paid!(order_id:, actual_fee_cents:, paid_at:, order_attributes:)` is called with that exact signature in Tasks 2, 6 and the test helpers of 7 and 8. `ContentPrefetcher.claim` changes arity in Task 8 Step 3 and its single caller is updated in the same step.
