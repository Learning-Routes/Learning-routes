# WP-37 Journey Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scrolling journey with a pannable, zoomable map: route → modules → steps → reinforcement drawn as a tidy tree. Every node stays legible, and a purchased module is readable to the student who paid.

**Architecture:** The server adds `parent_id`, one `current`, a `readable` flag and the route root to the journey JSON, and stores `triggering_step_id` on new reinforcement. Two pure ES modules do all the geometry: `journey_map_layout.js` (tree → boxes and polyline edges) and `journey_camera.js` (safe area, fit, zoom, initial camera). Both are tested under node from `bin/rails test`. A rewritten Stimulus controller renders one SVG for edges and one HTML layer for nodes, inside a transformed world element.

**Tech Stack:** Rails 8.1 engines, Stimulus + importmap (no bundler, no package.json), node 25 for pure-module tests driven from Minitest, Selenium headless Chrome system tests, Tailwind 4 source CSS at `app/assets/tailwind/application.css`.

**Spec:** `docs/superpowers/specs/2026-10-02-wp37-journey-map-design.md` (approved; commits `a1e0752f`, `fda21687`). Read it before any task. Section references like "spec §2.3" point there.

## Global Constraints

- Work only in the worktree `/Users/go/Documents/Learning-routes-wp37`, branch `wp37-journey-map`. It has no upstream, and **nothing is pushed**.
- Every fix ships with the test that prevents its class, **shown red before green**. Paste the red output into the task report.
- **Run one test suite at a time.** Overlapping runs share one test DB and make a suite look flaky.
- Reinforcement is one rule: `metadata["reinforcement"] == true`.
- Readability comes only from `ModuleAccessPolicy.module_reader(route)`: one `entitled?` query per request.
- The stored `triggering_step_id` wins **only when it names a primary step in the same module**. Otherwise, and for legacy rows, use the nearest preceding primary step in the same module by `position`. Otherwise `nil` (orphan).
- Label: `labelWidth` 168 px, font 13 px, line-height 18 px, 2 lines. Initial zoom ≥ 12 ÷ 13, so labels are ≥ 12 px on screen. Contrast ≥ 4.5.
- No new dependencies, no vendored libraries, no CSP changes.
- English in code, comments and commits. User-facing strings are i18n keys in **both** `config/locales/en.yml` and `config/locales/es.yml`.
- After any edit to `app/assets/tailwind/application.css`: `env -u RAILS_MASTER_KEY bin/rails tailwindcss:build`. After any edit to an `engines/*/app/views` file, **restart the dev server** before trusting the browser.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Three **CHECKPOINTS** (after Tasks 4, 7 and 9). At each one: stop, report, and wait for the owner's go-ahead.

## Review Focus

Inputs the spec implies but its listed tests do not pin. Each one gets a test in its owning task:

1. **A title with no spaces** (one 70-character word). It must wrap or ellipsize inside its label and never push into a neighbour. Pinned in Task 8 by a fixture title, under assertion (a).
2. **A title containing HTML or quotes** (`Comparar <b>ser</b> y "estar"`). It must render as text, never as markup. Pinned in Task 8 (no `<b>` inside `.jm-nodes`; the literal text is present).
3. **A route with no readable current step** (`current_step` pointing into a locked module, or every module locked). The page renders and the camera targets the root. Pinned in Task 3 (JSON fallback) and Task 7 (`initialCamera` without a module box).
4. **The window resizing after load** (a phone rotating). The current step stays in the safe area. Pinned in Task 8 (resize after load, then re-measure).
5. **A drag that starts on a node link.** It must pan without navigating, while a plain click on the same node still navigates. Pinned in Task 8.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `engines/learning_routes_engine/app/services/learning_routes_engine/adaptive_difficulty.rb` | writes `triggering_step_id` | 1 |
| `engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb` | its tests | 1 |
| `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb` | `module_reader(route)` | 2 |
| `engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb` | readability, `parent_id`, `current`, root | 2, 3, 9 |
| `engines/learning_routes_engine/app/views/learning_routes_engine/routes/show.html.erb` | list view readability | 2 |
| `engines/learning_routes_engine/app/services/learning_routes_engine/reinforcement_parents.rb` | the ONE parent rule (controller + rake) | 3 |
| `lib/tasks/wp37_reinforcement_parents.rake` | read-only census | 4 |
| `test/integration/learning_routes_engine/journey_map_data_test.rb` | server tests for Tasks 2–3 | 2, 3 |
| `test/tasks/wp37_reinforcement_parents_test.rb` | rake test | 4 |
| `app/assets/tailwind/application.css` | level tokens (Task 5), map styles (Task 9) | 5, 9 |
| `test/assets/journey_level_tokens_test.rb` | tokens defined in both themes | 5 |
| `app/javascript/lib/journey_map_layout.js` | pure geometry | 6 |
| `test/javascript/journey_map_layout_test.rb` | node tests for it | 6, 10 |
| `app/javascript/lib/journey_camera.js` | pure camera math + `safeRect` | 7 |
| `test/javascript/journey_camera_test.rb` | node tests for it | 7 |
| `test/system/journey_map_test.rb` | measured browser tests | 8 |
| `engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb` | the canvas markup | 3, 9 |
| `app/javascript/controllers/route_journey_controller.js` | rendering + interaction | 9 |
| `config/importmap.rb` | pins | 9, 10 |
| `config/locales/en.yml`, `config/locales/es.yml` | new keys | 2, 9 |
| `WP37_HANDOFF.md` | handoff | 11 |

Deleted in Task 10: `app/javascript/lib/journey_layout.js`, `test/javascript/journey_layout_test.rb`, `test/system/journey_has_no_overlapping_satellites_test.rb`, the `journey_layout` pin.

---

### Task 1: `triggering_step_id` is the actual trigger

**Files:**
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/adaptive_difficulty.rb` (inside `insert_reinforcement!`'s `create!`, plus private finders after `current_step_module_id`)
- Test: `engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb`

**Interfaces:**
- Produces: reinforcement rows carry `metadata["triggering_step_id"]`, a step id String (UUID) or `nil`. Tasks 3 and 4 read it.

- [ ] **Step 1: Write the failing tests.** Add them after `"low score (<60%) inserts reinforcement steps"`:

```ruby
    # WP-37 §1.1. The map hangs reinforcement under the step that TRIGGERED it,
    # and the trigger is a fact about the assessment, not a recomputation from
    # positions — store it, so the two can disagree and the stored one wins.
    test "reinforcement records the assessment step that triggered it" do
      trigger = @route.route_steps.find_by!(position: 2) # an :assessment step
      assessment = Assessments::Assessment.create!(
        route_step: trigger, assessment_type: :level_up, passing_score: 70
      )

      AdaptiveDifficulty.new(@route, OpenStruct.new(score: 45, assessment_id: assessment.id)).adjust!

      ids = @route.route_steps.reload
                  .select { |s| s.metadata["reinforcement"] == true }
                  .map { |s| s.metadata["triggering_step_id"] }
      assert_equal 3, ids.size, "test premise: one triplet was inserted"
      assert_equal [trigger.id] * 3, ids,
        "the triplet must name the assessment step, not the step it happens to sit behind"
    end

    test "without an assessment, the current step is the trigger" do
      current = @route.route_steps.find_by!(position: @route.current_step)

      AdaptiveDifficulty.new(@route, OpenStruct.new(score: 45)).adjust!

      ids = @route.route_steps.reload
                  .select { |s| s.metadata["reinforcement"] == true }
                  .map { |s| s.metadata["triggering_step_id"] }
      assert_equal [current.id] * 3, ids
    end
```

- [ ] **Step 2: Run them and confirm they fail.**

Run: `bin/rails test engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb`
Expected: 2 failures. The first is `Expected [<uuid>, <uuid>, <uuid>] … Actual [nil, nil, nil]`.

- [ ] **Step 3: Implement.** In `insert_reinforcement!`, compute the id **before** the transaction (the shift never moves the current position, but this keeps the read independent of the write), next to `shift = reinforcement_steps.size`:

```ruby
      shift = reinforcement_steps.size
      trigger_id = triggering_step_id
```

Change the metadata line in `create!`:

```ruby
            metadata: { reinforcement: true, trigger_score: @score, triggering_step_id: trigger_id }
```

Add the private finders after `current_step_module_id`:

```ruby
    # WP-37 §1.1. The step that TRIGGERED this reinforcement — the same two
    # sources, in the same order, that `triggering_module_id` takes the module
    # from, so the id and the module always agree. The journey map hangs the
    # triplet under this step; positions are only the fallback for rows written
    # before this key existed.
    def triggering_step_id
      return @triggering_step_id if defined?(@triggering_step_id)

      @triggering_step_id = assessment_step_id || current_step_id
    end

    def assessment_step_id
      assessment_id = @result.respond_to?(:assessment_id) ? @result.assessment_id : nil
      return nil if assessment_id.nil?

      RouteStep.where(id: Assessments::Assessment.where(id: assessment_id).select(:route_step_id))
               .where(learning_route_id: @route.id)
               .pick(:id)
    end

    def current_step_id
      RouteStep.where(learning_route_id: @route.id, position: @route.current_step).pick(:id)
    end
```

- [ ] **Step 4: Run the file again.** Same command. Expected: all pass, the five existing tests included.

- [ ] **Step 5: Commit.**

```bash
git add engines/learning_routes_engine/app/services/learning_routes_engine/adaptive_difficulty.rb \
        engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb
git commit -m "feat(reinforcement): store the step that triggered a triplet

WP-37 §1.1. triggering_step_id is the assessment's step, else the current
step, else nil — the same sources triggering_module_id uses, so they agree.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Readability from the policy, on the journey and the list view

**Files:**
- Modify: `engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb` (add `module_reader` after `allowed_step?`)
- Modify: `engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb` (`show` `:13-18`, `journey` `:20-45`, `build_journey_stages` `:98-120`)
- Modify: `engines/learning_routes_engine/app/views/learning_routes_engine/routes/show.html.erb:64-67`
- Modify: `config/locales/en.yml:991`, `config/locales/es.yml:991` (add `purchased`)
- Create: `test/integration/learning_routes_engine/journey_map_data_test.rb`

**Interfaces:**
- Produces: `LearningRoutesEngine::ModuleAccessPolicy.module_reader(route) -> Proc(route_module) -> Boolean`. Each journey stage hash gains `readable: Boolean`. The controller passes the reader into `build_journey_stages(modules, readable_module)`. Task 3 extends these.

- [ ] **Step 1: Create the test file with its fixture helpers and the readability tests.**

```ruby
require "test_helper"

# WP-37 §1. The journey's JSON is what the map draws, so its shape is asserted
# here, against the server, before any pixel exists.
class LearningRoutesEngine::JourneyMapDataTest < ActionDispatch::IntegrationTest
  def setup
    @user = create_test_user(email_verified_at: Time.current, locale: "en")
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Map", locale: "en", status: :active, current_step: 1
    )
    @preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    @paid = @route.route_modules.create!(
      position: 2, title: "Paid module", access_state: :locked, generation_state: :ready
    )
    sign_in_as(@user)
  end

  # ─── Readability: preview, purchased, locked ───────────────────────

  test "the preview module is readable" do
    step!(@preview, 0, "Free lesson")

    stage = journey_stages.find { |s| s["module_id"] == @preview.id }
    assert_equal true, stage["readable"]
    assert_equal "Free lesson", stage["topics"].first["name"]
  end

  test "a locked module hides titles, links and structure" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    step!(@paid, 11, "Paid reinforcement", metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })

    stage = journey_stages.find { |s| s["module_id"] == @paid.id }
    assert_equal false, stage["readable"]
    stage["topics"].each do |topic|
      assert_nil topic["path"]
      assert_nil topic["parent_id"], "a locked module must not reveal which step a triplet hangs from"
      assert_equal false, topic["reinforcement"]
    end
    assert_not_includes response.body, "Paid lesson"
  end

  test "a purchased module is readable, with its titles and links" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    stage = journey_stages.find { |s| s["module_id"] == @paid.id }
    assert_equal true, stage["readable"], "the student who paid sees the module they bought"
    topic = stage["topics"].find { |t| t["id"] == primary.id }
    assert_equal "Paid lesson", topic["name"]
    assert topic["path"].present?
  end

  # Locale-agnostic: the UI locale is resolved per request (en "topics" / es "temas").
  test "the journey header counts the purchased module's steps" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.journey_route_path(@route)

    assert_match(/\b2 (topics|temas)\b/, response.body, "@steps must come from the policy, not from access_preview?")
  end

  test "the list view lists a purchased module's steps without the lock" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.route_path(@route)

    assert_response :success
    assert_includes response.body, "Paid lesson"
    assert_select "section[data-module-access='locked'] span[aria-label]", count: 0
    assert_select "section[data-module-access='locked']", text: /Purchased|Comprado/
  end

  private

  def step!(route_module, position, title, status: :available, metadata: {})
    @route.route_steps.create!(
      route_module: route_module, position: position, title: title, status: status,
      content_type: :lesson, level: :nv1, bloom_level: 1, metadata: metadata
    )
  end

  def journey_stages
    get learning_routes_engine.journey_route_path(@route)
    assert_response :success
    node = css_select("[data-controller='route-journey']").first
    JSON.parse(node["data-route-journey-stages-value"])
  end

  # The same purchase the paywall tests build (module_lock_authorization_test.rb:182).
  def pay_for_route!(route)
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: route, currency: "USD",
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
    Commerce::RoutePurchase.create!(
      user: @user, learning_route: route, route_quote: quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    ).mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
  end
end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/integration/learning_routes_engine/journey_map_data_test.rb`
Expected:
- the `readable` assertions fail (`nil` is not `true`/`false`);
- "purchased … readable" fails on the masked name;
- the header count fails (`1 topics`);
- the list view fails (the lock span is present, and "Paid lesson" is absent).

- [ ] **Step 3: Add the policy method.** In `module_access_policy.rb`, after `allowed_step?`:

```ruby
    # WP-37 §1.2. Readability for a whole route in ONE entitlement query: a module
    # is readable when it is the free preview, or when the route has an entitling
    # purchase (`reachable?` below, asked once instead of once per module).
    # Ownership is the caller's job — RoutesController has already scoped the
    # route to the signed-in user.
    def self.module_reader(route)
      entitled = Commerce::RoutePurchase.entitled?(route_id: route.id)
      ->(route_module) { route_module.access_preview? || entitled }
    end
```

- [ ] **Step 4: Use it in the controller.** In `show`:

```ruby
    def show
      @readable_module = ModuleAccessPolicy.module_reader(@route)
      @modules = @route.route_modules.includes(:route_steps).order(:position, :id)
      @steps = @modules.select(&@readable_module).flat_map(&:route_steps)
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
    end
```

In `journey`, replace the `@steps` line and the `@stages` line (leave the comments above them as they are):

```ruby
      readable_module = ModuleAccessPolicy.module_reader(@route)
      @journey_modules = @route.route_modules
        .includes(:route_steps)
        .order(:position, :id)
      @steps = @journey_modules.select(&readable_module).flat_map { |m| m.route_steps.sort_by(&:position) }
      @progress = RouteProgressTracker.new(@route).progress_summary
      @due_reviews = SpacedRepetition.new.due_reviews(@route)
      @stages = build_journey_stages(@journey_modules, readable_module)
      render layout: "journey"
```

In `build_journey_stages`, change the signature and the `readable` line, and add the key:

```ruby
    def build_journey_stages(modules, readable_module)
      modules.filter_map do |route_module|
        steps = route_module.route_steps.sort_by(&:position)
        next if steps.empty?

        level = steps.map(&:level).compact.min || "nv1"

        # From the policy, not `access_preview?`: a PURCHASED module is readable to
        # the student who paid (WP-37 §1.2).
        readable = readable_module.call(route_module)

        {
          module_id: route_module.id,
          access_state: route_module.access_state,
          readable: readable,
          level: level,
          label: route_module.localized_title.presence || t("learning_engine.journey.#{level}_label"),
          tag: level.upcase,
          color: LEVEL_COLORS[level] || LEVEL_COLORS["nv1"],
          status: readable ? stage_status_for(steps) : "locked",
          topics: steps.map { |step| journey_topic(step, readable: readable) }
        }
      end
    end
```

- [ ] **Step 5: Fix the list view.** In `show.html.erb`, replace `:64`'s label expression, `:65`'s condition and `:67`'s condition:

```erb
          <div><p style="font-family:'DM Mono',monospace; font-size:0.625rem; color:var(--color-muted); text-transform:uppercase; margin:0 0 0.25rem;"><%= if !@readable_module.call(route_module) then t('learning_engine.modules.locked') elsif route_module.access_preview? then t('learning_engine.modules.free_preview') else t('learning_engine.modules.purchased') end %></p><h3 style="color:var(--color-txt); margin:0;"><%= route_module.localized_title %></h3><p style="color:var(--color-sub); margin:0.35rem 0 0;"><%= route_module.localized_description %></p></div>
          <% unless @readable_module.call(route_module) %><span aria-label="<%= t('learning_engine.modules.locked') %>" style="color:var(--color-muted);">&#128274;</span><% end %>
        </div>
        <% if @readable_module.call(route_module) %>
```

Locales, `:991` in each file:

```yaml
    modules: { free_preview: "Free preview", locked: "Locked until purchase", purchased: "Purchased" }
```
```yaml
    modules: { free_preview: "Vista previa gratuita", locked: "Bloqueado hasta la compra", purchased: "Comprado" }
```

- [ ] **Step 6: Run the new file, then the neighbours.**

Run: `bin/rails test test/integration/learning_routes_engine/journey_map_data_test.rb`
Expected: PASS.
Then: `bin/rails test test/controllers/learning_routes_engine/module_lock_authorization_test.rb test/integration/journey_page_test.rb`
Expected: PASS. The unpaid locked module is still hidden, and the list view's existing tests are unchanged.

- [ ] **Step 7: Commit.**

```bash
git add engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb \
        engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb \
        engines/learning_routes_engine/app/views/learning_routes_engine/routes/show.html.erb \
        config/locales/en.yml config/locales/es.yml \
        test/integration/learning_routes_engine/journey_map_data_test.rb
git commit -m "fix(routes): a purchased module is readable on the journey and the list

routes_controller.rb:15/:39/:107 and show.html.erb:64-67 used access_preview?,
so the student who paid saw their module locked. Readability now comes from
ModuleAccessPolicy.module_reader: preview, or an entitled route, asked once.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `parent_id`, one `current`, one reinforcement rule, the root

**Files:**
- Create: `engines/learning_routes_engine/app/services/learning_routes_engine/reinforcement_parents.rb`
- Modify: `routes_controller.rb`: `journey` (`@current_step_id`, `@journey_root`), `build_journey_stages` (parents), `journey_topic` (`:130-161`)
- Modify: `engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb:9-12` (add the root value only)
- Test: `test/integration/learning_routes_engine/journey_map_data_test.rb`

**Interfaces:**
- Consumes: `module_reader` and stage `readable` from Task 2.
- Produces:
  - `LearningRoutesEngine::ReinforcementParents.reinforcement?(step) -> Boolean`;
  - `LearningRoutesEngine::ReinforcementParents.resolve(steps_sorted_by_position) -> Hash{step_id => Resolution(parent_id:, source:)}`, where `source ∈ :stored | :position | :orphan`;
  - each topic hash gains `parent_id: String|nil` and `current: Boolean`;
  - the view gains `data-route-journey-root-value='{"title": …}'`.

  Task 4 uses `resolve`; Tasks 6 and 9 read `parent_id`, `current`, `readable` and the root.

- [ ] **Step 1: Write the failing tests.** Append inside the class, before `private`:

```ruby
  # ─── parent_id ─────────────────────────────────────────────────────

  test "a stored triggering_step_id names the parent" do
    first = step!(@preview, 0, "First")
    second = step!(@preview, 1, "Second")
    child = step!(@preview, 2, "Reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => first.id })

    topics = preview_topics
    assert_nil topics[first.id]["parent_id"]
    assert_nil topics[second.id]["parent_id"]
    assert_equal first.id, topics[child.id]["parent_id"],
      "the stored trigger wins over the nearest preceding step (#{second.id})"
  end

  test "a legacy reinforcement without a stored id resolves by position" do
    step!(@preview, 0, "First")
    second = step!(@preview, 1, "Second")
    children = (2..4).map do |pos|
      step!(@preview, pos, "Legacy #{pos}", metadata: { "reinforcement" => true, "trigger_score" => 40 })
    end

    topics = preview_topics
    children.each { |c| assert_equal second.id, topics[c.id]["parent_id"] }
  end

  test "a stored id that is not a primary step in this module falls back to position" do
    primary = step!(@preview, 0, "Primary")
    other_module_step = step!(@paid, 10, "Elsewhere")
    child = step!(@preview, 1, "Reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => other_module_step.id })

    assert_equal primary.id, preview_topics[child.id]["parent_id"]
  end

  test "a purchased module carries parent ids" do
    step!(@preview, 0, "Free lesson")
    primary = step!(@paid, 10, "Paid lesson")
    child = step!(@paid, 11, "Paid reinforcement",
                  metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })
    pay_for_route!(@route)

    topics = journey_stages.find { |s| s["module_id"] == @paid.id }["topics"].index_by { |t| t["id"] }
    assert_equal primary.id, topics[child.id]["parent_id"]
  end

  test "a reinforcement with no preceding primary step is an orphan" do
    orphan = step!(@preview, 0, "Orphan", metadata: { "reinforcement" => true })
    step!(@preview, 1, "Primary")

    topics = preview_topics
    assert_equal true, topics[orphan.id]["reinforcement"]
    assert_nil topics[orphan.id]["parent_id"]
  end

  test "only boolean true makes a step reinforcement" do
    legacy = step!(@preview, 0, "Old flag", metadata: { "triggering_module_id" => @preview.id })
    stringy = step!(@preview, 1, "String flag", metadata: { "reinforcement" => "true" })

    topics = preview_topics
    assert_equal false, topics[legacy.id]["reinforcement"], "triggering_module_id has no writer"
    assert_equal false, topics[stringy.id]["reinforcement"]
  end

  # ─── current ───────────────────────────────────────────────────────

  test "exactly one topic is current: the step at route.current_step" do
    step!(@preview, 0, "Done", status: :completed)
    at_current = step!(@preview, 1, "Here")
    step!(@preview, 2, "Next", status: :locked)

    current = all_topics.select { |t| t["current"] }
    assert_equal [at_current.id], current.map { |t| t["id"] }
  end

  test "when current_step is not a readable step, the first available one is current" do
    @route.update!(current_step: 10)
    step!(@preview, 0, "Done", status: :completed)
    available = step!(@preview, 1, "Open")
    step!(@paid, 10, "Behind the paywall")

    current = all_topics.select { |t| t["current"] }
    assert_equal [available.id], current.map { |t| t["id"] }
  end

  test "a route with nothing readable marks no step current" do
    @route.update!(current_step: 10)
    step!(@paid, 10, "Behind the paywall")
    @preview.route_steps.destroy_all

    assert_equal [], all_topics.select { |t| t["current"] }
  end

  # ─── root ──────────────────────────────────────────────────────────

  test "the route root is its own value" do
    step!(@preview, 0, "First")
    get learning_routes_engine.journey_route_path(@route)

    node = css_select("[data-controller='route-journey']").first
    assert_equal({ "title" => "Map" }, JSON.parse(node["data-route-journey-root-value"]))
  end
```

Add to the `private` helpers:

```ruby
  def all_topics = journey_stages.flat_map { |s| s["topics"] }

  def preview_topics
    journey_stages.find { |s| s["module_id"] == @preview.id }["topics"].index_by { |t| t["id"] }
  end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/integration/learning_routes_engine/journey_map_data_test.rb`
Expected: the new tests fail. `parent_id` and `current` are absent (nil), the `triggering_module_id` topic reads `true`, and the root value is missing (`NoMethodError` on `nil` in `JSON.parse`).

- [ ] **Step 3: Create the one parent rule.**

```ruby
# frozen_string_literal: true

module LearningRoutesEngine
  # WP-37 §1.3. Which primary step a reinforcement step hangs from — the ONE rule,
  # read by the journey (RoutesController#build_journey_stages) and counted by the
  # census (wp37:reinforcement_parents), so the map and the census cannot disagree.
  #
  #   1. the stored `triggering_step_id`, when it names a PRIMARY step of the same
  #      module (AdaptiveDifficulty writes it from the same sources it takes the
  #      module from, so it normally does);
  #   2. else the nearest preceding primary step in the module, by position —
  #      every row written before the key existed;
  #   3. else nothing: an orphan, which the map hangs from the module node.
  #
  # The guard in (1) only refuses ids that cannot be a parent in a depth-3 tree —
  # a step since moved to another module, or a trigger that was itself
  # reinforcement — rather than draw an edge across modules.
  module ReinforcementParents
    Resolution = Data.define(:parent_id, :source)

    # Boolean true only. A string "true" from an old writer is NOT reinforcement
    # here; the census reports how many there are.
    def self.reinforcement?(step)
      step.metadata.is_a?(Hash) && step.metadata["reinforcement"] == true
    end

    # `steps`: ONE module's steps, already sorted by position.
    def self.resolve(steps)
      primary_ids = steps.reject { |step| reinforcement?(step) }.to_set(&:id)
      last_primary_id = nil

      steps.each_with_object({}) do |step, resolved|
        unless reinforcement?(step)
          last_primary_id = step.id
          next
        end

        stored = step.metadata["triggering_step_id"]
        resolved[step.id] =
          if stored && primary_ids.include?(stored)
            Resolution.new(parent_id: stored, source: :stored)
          elsif last_primary_id
            Resolution.new(parent_id: last_primary_id, source: :position)
          else
            Resolution.new(parent_id: nil, source: :orphan)
          end
      end
    end
  end
end
```

- [ ] **Step 4: Wire it into the controller.**

In `journey`, after `@steps = …` add:

```ruby
      @current_step_id = journey_current_step_id(@steps)
      @journey_root = { title: @route.localized_topic.presence || @route.topic }
```

In `build_journey_stages`, compute parents for readable stages and pass them on. Replace the `topics:` line and add the `parents` local after `readable = …`:

```ruby
        parents = readable ? ReinforcementParents.resolve(steps) : {}
```
```ruby
          topics: steps.map { |step| journey_topic(step, readable: readable, parent_id: parents[step.id]&.parent_id) }
```

Replace `journey_topic` entirely:

```ruby
    def journey_topic(step, readable: true, parent_id: nil)
      # A locked module contributes its shape and nothing else: the student can
      # see how much is behind the paywall without reading what they have not
      # bought — and without learning which step a triplet hangs from.
      unless readable
        return {
          id: step.id, name: t("learning_engine.journey.locked_topic"),
          content_type: nil, progress: 0, status: "locked",
          reinforcement: false, parent_id: nil, current: false, path: nil
        }
      end

      progress = case step.status
      when "completed" then 100
      when "in_progress" then 50
      else 0
      end

      {
        id: step.id,
        name: step.localized_title,
        content_type: step.content_type,
        progress: progress,
        status: step.status,
        # One rule (ReinforcementParents.reinforcement?). The old second branch,
        # metadata["triggering_module_id"], had no writer anywhere.
        reinforcement: ReinforcementParents.reinforcement?(step),
        parent_id: parent_id,
        current: step.id == @current_step_id,
        path: route_step_path(@route, step)
      }
    end

    # WP-37 §1.4. ONE current step, decided here, from the position the server
    # already owns. The fallback applies only when that position is not a
    # readable step.
    def journey_current_step_id(readable_steps)
      at_position = readable_steps.find { |step| step.position == @route.current_step }
      return at_position.id if at_position

      (readable_steps.find(&:in_progress?) ||
        readable_steps.find(&:available?) ||
        readable_steps.last)&.id
    end
```

- [ ] **Step 5: Add the root value to the view.** In `journey.html.erb`, add one attribute after `data-route-journey-stages-value` (Task 9 rewrites the rest):

```erb
     data-route-journey-root-value="<%= ERB::Util.html_escape(@journey_root.to_json) %>"
```

- [ ] **Step 6: Run the file again.** Same command. Expected: PASS, all tests.

- [ ] **Step 7: Run the neighbours.** `bin/rails test test/controllers/learning_routes_engine/module_lock_authorization_test.rb test/integration/journey_page_test.rb test/integration/landing_redirects_signed_in_students_test.rb`. Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add engines/learning_routes_engine/app/services/learning_routes_engine/reinforcement_parents.rb \
        engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb \
        engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb \
        test/integration/learning_routes_engine/journey_map_data_test.rb
git commit -m "feat(journey): parent_id, one current step, one reinforcement rule, the root

WP-37 §1.3-1.5. ReinforcementParents is the one parent rule (stored id when it
names a primary step in the module, else position, else orphan). The server
marks exactly one current topic from route.current_step. The dead
triggering_module_id branch is gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> **Ordering note, deliberate:** spec §1.5 removes `color` / `LEVEL_COLORS` from the JSON. The **old** Stimulus controller still reads `data-stage-color` and concatenates hex alpha onto it, so the key is removed in **Task 9**, together with its last consumer. Nothing else reads it.

---

### Task 4: `wp37:reinforcement_parents` — read-only census → **CHECKPOINT 1**

**Files:**
- Create: `lib/tasks/wp37_reinforcement_parents.rake`
- Create: `test/tasks/wp37_reinforcement_parents_test.rb`

**Interfaces:**
- Consumes: `ReinforcementParents.resolve` and `ReinforcementParents.reinforcement?` (Task 3).
- Produces: stdout lines that the owner pastes into the handoff after deploy.

- [ ] **Step 1: Write the failing test.**

```ruby
require "test_helper"
require "rake"

# WP-37 §1.6. Read-only. It counts how production's reinforcement resolves its
# parent, and how many flags are not boolean true (so the single rule drops none
# of them silently).
class Wp37ReinforcementParentsTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("wp37:reinforcement_parents")
    @task = Rake::Task["wp37:reinforcement_parents"]
    @task.reenable

    user = create_test_user(email_verified_at: Time.current)
    profile = LearningRoutesEngine::LearningProfile.create!(user: user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Census", locale: "en", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: @route.id, access_state: :preview)
    make = lambda do |position, metadata = {}|
      @route.route_steps.create!(route_module: preview, position: position, title: "S#{position}",
                                 status: :available, content_type: :lesson, level: :nv1,
                                 bloom_level: 1, metadata: metadata)
    end
    @orphan = make.call(0, { "reinforcement" => true })
    first = make.call(1)
    make.call(2, { "reinforcement" => true, "triggering_step_id" => first.id })
    make.call(3, { "reinforcement" => true })
    make.call(4, { "reinforcement" => "true" })
  end

  test "counts stored, position, orphan and non-boolean flags, and changes nothing" do
    before = LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).pluck(:id, :metadata, :position)

    out, = capture_io { @task.invoke }

    assert_match(/3 reinforcement step\(s\) in 1 route\(s\): stored=1 position=1 orphan=1/, out)
    assert_match(/1 step\(s\) carry a reinforcement value that is not boolean true/, out)
    assert_match(/route=#{@route.id} stored=1 position=1 orphan=1/, out)
    assert_equal before,
                 LearningRoutesEngine::RouteStep.where(learning_route_id: @route.id).pluck(:id, :metadata, :position)
  end
end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/tasks/wp37_reinforcement_parents_test.rb`
Expected: ERROR, `Don't know how to build task 'wp37:reinforcement_parents'`.

- [ ] **Step 3: Write the task.**

```ruby
# frozen_string_literal: true

namespace :wp37 do
  desc "Count how reinforcement steps resolve their parent on the journey map (read-only)."
  # READ-ONLY. It resolves parents with the same rule the journey uses
  # (LearningRoutesEngine::ReinforcementParents), so its numbers are the map's.
  #
  #   stored   — the step names its trigger (written since WP-37);
  #   position — legacy: hung from the nearest preceding primary step;
  #   orphan   — no preceding primary step in its module: hung from the module.
  #
  # It also counts `reinforcement` values that are present but not boolean true.
  # The map treats only `true` as reinforcement, so those are drawn as peers;
  # this line is how they are seen rather than silently dropped.
  task reinforcement_parents: :environment do
    flagged = LearningRoutesEngine::RouteStep.where("metadata ? 'reinforcement'")
    non_boolean = flagged.to_a.count { |step| step.metadata["reinforcement"] != true }

    module_ids = flagged.distinct.pluck(:route_module_id)
    steps_by_module = LearningRoutesEngine::RouteStep.where(route_module_id: module_ids)
                                                     .order(:position).to_a.group_by(&:route_module_id)

    per_route = Hash.new { |hash, key| hash[key] = Hash.new(0) }
    steps_by_module.each_value do |steps|
      LearningRoutesEngine::ReinforcementParents.resolve(steps).each do |step_id, resolution|
        route_id = steps.find { |step| step.id == step_id }.learning_route_id
        per_route[route_id][resolution.source] += 1
      end
    end

    totals = per_route.values.each_with_object(Hash.new(0)) { |counts, sum| counts.each { |k, v| sum[k] += v } }
    total = totals.values.sum

    puts "[wp37:reinforcement_parents] #{total} reinforcement step(s) in #{per_route.size} route(s): " \
         "stored=#{totals[:stored]} position=#{totals[:position]} orphan=#{totals[:orphan]}"
    puts "[wp37:reinforcement_parents] #{non_boolean} step(s) carry a reinforcement value that is not " \
         "boolean true (drawn as primary steps)"
    per_route.sort_by { |route_id, _| route_id.to_s }.each do |route_id, counts|
      puts "  route=#{route_id} stored=#{counts[:stored]} position=#{counts[:position]} orphan=#{counts[:orphan]}"
    end
  end
end
```

- [ ] **Step 4: Run it again.** Same command. Expected: PASS.

- [ ] **Step 5: RuboCop the server work.**

Run: `bundle exec rubocop engines/learning_routes_engine/app/services/learning_routes_engine/reinforcement_parents.rb engines/learning_routes_engine/app/services/learning_routes_engine/adaptive_difficulty.rb engines/learning_routes_engine/app/services/learning_routes_engine/module_access_policy.rb engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb lib/tasks/wp37_reinforcement_parents.rake test/tasks/wp37_reinforcement_parents_test.rb test/integration/learning_routes_engine/journey_map_data_test.rb`
Expected: `no offenses detected`.

- [ ] **Step 6: Commit.**

```bash
git add lib/tasks/wp37_reinforcement_parents.rake test/tasks/wp37_reinforcement_parents_test.rb
git commit -m "feat(tasks): wp37:reinforcement_parents, a read-only census of map parents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Run `bin/rails test` once (alone) and record the numbers.** Expected: 0 failures, 0 errors. `bin/rails test engines/*/test` shows exactly the four known `ci-engine-tests` failures and nothing else.

- [ ] **Step 8: CHECKPOINT 1 — STOP.** Report to the owner:
  - the commits of Tasks 1–4;
  - the red-then-green output of each new test;
  - both suite numbers;
  - the JSON of one stage from the purchased-module test, printed with `puts JSON.pretty_generate(stage)` in a scratch run and not committed.

  Do not start Task 5 until the owner says go.

---

### Task 5: Level colours become theme tokens

**Files:**
- Modify: `app/assets/tailwind/application.css:34-37` (`:root`) and the `html[data-theme="dark"]` block (`:163`)
- Create: `test/assets/journey_level_tokens_test.rb`

**Interfaces:**
- Produces: `--color-node-nv1`, `--color-node-nv2`, `--color-node-nv3`, defined in both themes. Task 9's CSS reads them through `--jm-level`.

- [ ] **Step 1: Write the failing test.**

```ruby
require "test_helper"

# WP-37 §3.6. The level colours were fixed hex in RoutesController::LEVEL_COLORS
# and never changed with the theme. They are tokens now, defined for BOTH themes;
# their contrast is measured by test/system/journey_map_test.rb.
class JourneyLevelTokensTest < ActiveSupport::TestCase
  CSS = Rails.root.join("app/assets/tailwind/application.css").read
  DARK = CSS[/html\[data-theme="dark"\]\s*\{(.*?)\n\}/m, 1]
  LIGHT = CSS.split('html[data-theme="dark"]').first

  %w[nv1 nv2 nv3].each do |level|
    test "--color-node-#{level} is defined in both themes, differently" do
      light = LIGHT[/--color-node-#{level}:\s*([^;]+);/, 1]
      dark = DARK.to_s[/--color-node-#{level}:\s*([^;]+);/, 1]

      assert light, "no light value for --color-node-#{level}"
      assert dark, "no dark value for --color-node-#{level}: the colour would not change with the theme"
      refute_equal light.strip, dark.strip
    end
  end

  test "the three levels are distinguishable in each theme" do
    light = %w[nv1 nv2 nv3].map { |l| LIGHT[/--color-node-#{l}:\s*([^;]+);/, 1].to_s.strip }
    assert_equal 3, light.uniq.size, "every level is #{light.first}: the level tag carries no information"
  end
end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/assets/journey_level_tokens_test.rb`
Expected: 4 failures. There's no dark value, and the light values are all `#B0A898`.

- [ ] **Step 3: Set the tokens.** In `:root`, replace `:34-35` and `:37` (leave `mm`, `exam`, `goal` alone):

```css
  /* Journey level colours (WP-37 §3.6). Text-safe on --color-bg: each is
     >= 4.5:1, measured by test/system/journey_map_test.rb. */
  --color-node-nv1: #2E6B4B;
  --color-node-nv2: #2C5F8E;
  --color-node-mm: #B0A898;
  --color-node-nv3: #5A4C9E;
```

Inside `html[data-theme="dark"] {`, add:

```css
  --color-node-nv1: #7CC4A0;
  --color-node-nv2: #8DB6E0;
  --color-node-nv3: #B2A8E6;
```

- [ ] **Step 4: Rebuild and run.**

Run: `env -u RAILS_MASTER_KEY bin/rails tailwindcss:build && bin/rails test test/assets/journey_level_tokens_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/assets/tailwind/application.css test/assets/journey_level_tokens_test.rb
git commit -m "feat(theme): journey level colours are tokens in both themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `journey_map_layout.js` — tidy-tree rules at depth 3

**Files:**
- Create: `app/javascript/lib/journey_map_layout.js`
- Create: `test/javascript/journey_map_layout_test.rb`

**Interfaces:**
- Consumes: the stage JSON from Tasks 2–3 (`module_id`, `level`, `label`, `tag`, `readable`, and `topics[]` with `id`, `name`, `status`, `progress`, `reinforcement`, `parent_id`, `current`, `path`) and the root `{ title }`.
- Produces (used by Tasks 7 and 9):
  - `DEFAULTS`: the frozen options below.
  - `buildTree(root, stages) -> { root, modules: [{ id: "m:<uuid>", moduleId, index, stage, readable, cells: [{ kind: "step"|"anchor", topic|null, children: [topic] }] }] }`.
  - `layoutJourney(tree, overrides) -> { nodes, edges, cells, modules, bounds }`:
    - `nodes`: `[{ id, kind: "root"|"module"|"step"|"anchor"|"reinforcement", x, y, w, h, cx, cy, moduleId?, topic?, stage?, readable?, level? }]`, in DOM / route order. Ids are `"root"`, `"m:<uuid>"`, `"s:<uuid>"`, `"a:<uuid>"`.
    - `edges`: `[{ from, to, kind: "spine"|"module"|"route"|"fan", points: [[x, y], …], locked }]`.
    - `cells`: `[{ id, x, y, w, h, children }]`, one subtree box per head.
    - `modules`: `[{ id, moduleId, box: {x, y, w, h}, spineHalf, gutters: { left: [x0, x1], right: [x0, x1] }, rows: [{ top, bottom, direction: "ltr"|"rtl", heads: [id] }] }]`.
    - `bounds`: `{ x, y, w, h }`.

- [ ] **Step 1: Write the failing node tests.** They measure the JSON in Ruby; the module's own helpers are never trusted.

```ruby
require "test_helper"
require "json"
require "open3"

# WP-37 §2. The map's geometry is a pure module, asserted under node without a
# browser — the same arrangement WP-35 used, in `bin/rails test`.
#
# Every assertion is computed HERE from the raw boxes and polylines, never by a
# helper exported from the module under test.
class JourneyMapLayoutTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_map_layout.js")
  EPS = 0.5

  # ── Shapes ──────────────────────────────────────────────────────────
  def self.topic(id, reinforcement: false, parent_id: nil)
    { "id" => id, "name" => "Tema #{id}", "status" => "available", "progress" => 0,
      "reinforcement" => reinforcement, "parent_id" => parent_id, "current" => false, "path" => "/x" }
  end

  def self.stage(id, primaries:, fans: {}, orphans: 0, readable: true)
    topics = []
    orphans.times { |i| topics << topic("#{id}-o#{i}", reinforcement: true) }
    primaries.times do |i|
      pid = "#{id}-p#{i}"
      topics << topic(pid)
      fans.fetch(i, 0).times { |j| topics << topic("#{pid}-r#{j}", reinforcement: true, parent_id: pid) }
    end
    { "module_id" => id, "level" => "nv1", "label" => "Módulo #{id}", "tag" => "NV1",
      "status" => readable ? "current" : "locked", "readable" => readable, "topics" => topics }
  end

  SHAPES = {}.tap do |shapes|
    [1, 7, 8, 20, 43].product([1, 2, 5]).each do |count, modules|
      shapes["#{count} steps x #{modules} modules"] =
        (0...modules).map { |m| stage("m#{m}", primaries: count) }
    end
    shapes["43 peers"] = [stage("m0", primaries: 43)]
    shapes["7 + 36 behind one step"] = [stage("m0", primaries: 7, fans: { 2 => 36 })]
    shapes["production 7 + 13"] = [stage("m0", primaries: 7, fans: { 1 => 3, 2 => 3, 4 => 7 })]
    shapes["orphans then fans"] = [stage("m0", primaries: 5, orphans: 2, fans: { 0 => 2, 3 => 4 })]
    shapes["two fans in one row"] = [stage("m0", primaries: 4, fans: { 0 => 3, 3 => 3 })]
    shapes["preview + locked"] = [stage("m0", primaries: 7, fans: { 2 => 3 }), stage("m1", primaries: 9, readable: false)]
  end.freeze

  # ── Per-shape invariants ────────────────────────────────────────────
  SHAPES.each do |name, stages|
    test "#{name}: no two node boxes intersect" do
      boxes = solid_nodes(layout(stages))
      pair = first_pair(boxes) { |a, b| intersect?(a, b) }
      assert_nil pair, "nodes #{pair&.map { |n| n['id'] }.inspect} overlap"
    end

    test "#{name}: no two subtree boxes intersect" do
      pair = first_pair(layout(stages)["cells"]) { |a, b| intersect?(a, b) }
      assert_nil pair, "subtrees #{pair&.map { |c| c['id'] }.inspect} overlap"
    end

    test "#{name}: no edge crosses a node box except its own two endpoints" do
      result = layout(stages)
      boxes = solid_nodes(result)
      result["edges"].each do |edge|
        edge["points"].each_cons(2) do |p, q|
          hit = boxes.find { |b| b["id"] != edge["from"] && b["id"] != edge["to"] && segment_hits?(p, q, b) }
          assert_nil hit, "#{edge['kind']} edge #{edge['from']}->#{edge['to']} crosses #{hit&.dig('id')}"
        end
      end
    end

    test "#{name}: nodes come back in route order" do
      ids = layout(stages)["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }.map { |n| n["id"] }
      expected = stages.flat_map { |s| s["topics"].map { |t| "s:#{t['id']}" } }
      assert_equal expected, ids
    end

    test "#{name}: one edge per connection, and every endpoint exists" do
      result = layout(stages)
      ids = result["nodes"].map { |n| n["id"] }.to_set
      result["edges"].each do |e|
        assert_includes ids, e["from"]
        assert_includes ids, e["to"]
      end
      assert_equal expected_edge_count(stages), result["edges"].size
    end

    test "#{name}: the spine column and the row gutters hold no step" do
      result = layout(stages)
      steps = result["nodes"].select { |n| %w[step reinforcement].include?(n["kind"]) }
      result["modules"].each do |mod|
        half = mod["spineHalf"]
        lanes = [[-half, half], mod["gutters"]["left"], mod["gutters"]["right"]]
        # The spine column is every module's; a module's gutters are its own (a
        # wider module below may legitimately put cells at that x).
        steps.select { |n| n["moduleId"] == mod["id"] }.each do |node|
          lanes.each do |x0, x1|
            overlapping = node["x"] < x1 - EPS && x0 < node["x"] + node["w"] - EPS
            refute overlapping, "#{node['id']} sits in a reserved lane [#{x0}, #{x1}]"
          end
        end
      end
    end

    test "#{name}: rows stack below the tallest subtree; modules below the lowest box" do
      result = layout(stages)
      cells = result["cells"].index_by { |c| c["id"] }
      result["modules"].each do |mod|
        mod["rows"].each_cons(2) do |above, below|
          lowest = above["heads"].map { |id| cells[id]["y"] + cells[id]["h"] }.max
          assert_operator below["top"], :>=, lowest - EPS
        end
      end
      result["modules"].each_cons(2) do |a, b|
        assert_operator b["box"]["y"], :>=, a["box"]["y"] + a["box"]["h"] - EPS
      end
    end
  end

  # ── Rules that need a specific shape ────────────────────────────────
  test "four steps lie in one row beside the module; five wrap below it" do
    four = layout([self.class.stage("m0", primaries: 4)])
    mod = four["nodes"].find { |n| n["kind"] == "module" }
    assert_equal 1, four["modules"].first["rows"].size
    four["nodes"].select { |n| n["kind"] == "step" }.each { |n| assert_in_delta mod["cy"], n["cy"], 0.01 }

    five = layout([self.class.stage("m0", primaries: 5)])
    mod5 = five["nodes"].find { |n| n["kind"] == "module" }
    rows = five["modules"].first["rows"]
    assert_equal 2, rows.size
    assert_operator rows.first["top"], :>=, mod5["y"] + mod5["h"]
  end

  test "rows alternate direction, so route order reads as one path" do
    result = layout([self.class.stage("m0", primaries: 20)])
    nodes = result["nodes"].index_by { |n| n["id"] }
    result["modules"].first["rows"].each_with_index do |row, i|
      xs = row["heads"].map { |id| nodes[id]["cx"] }
      assert_equal(i.even? ? "ltr" : "rtl", row["direction"])
      assert_equal(i.even? ? xs.sort : xs.sort.reverse, xs)
    end
  end

  test "a reinforcement is drawn as a child, not a peer" do
    result = layout([self.class.stage("m0", primaries: 1, fans: { 0 => 3 })])
    steps = result["nodes"].select { |n| n["kind"] == "step" }
    kids = result["nodes"].select { |n| n["kind"] == "reinforcement" }
    assert_equal 1, steps.size
    assert_equal 3, kids.size
    fan_edges = result["edges"].select { |e| e["kind"] == "fan" }
    assert_equal [steps.first["id"]] * 3, fan_edges.map { |e| e["from"] }
    kids.each { |k| assert_operator k["y"], :>, steps.first["y"] + steps.first["h"] }
  end

  test "a parent is centred over its fan, and identical subtrees are identical" do
    result = layout([self.class.stage("m0", primaries: 4, fans: { 0 => 3, 3 => 3 })])
    nodes = result["nodes"]
    %w[m0-p0 m0-p3].each do |pid|
      parent = nodes.find { |n| n["id"] == "s:#{pid}" }
      kids = nodes.select { |n| n["id"].start_with?("s:#{pid}-r") }
      span = [kids.map { |k| k["x"] }.min, kids.map { |k| k["x"] + k["w"] }.max]
      assert_in_delta (span[0] + span[1]) / 2.0, parent["cx"], 0.01
    end
    a, b = result["cells"].select { |c| c["children"] == 3 }
    assert_equal [a["w"], a["h"]], [b["w"], b["h"]]
  end

  test "thirty-six reinforcement steps wrap into a fan, not a line" do
    result = layout(SHAPES["7 + 36 behind one step"])
    kids = result["nodes"].select { |n| n["kind"] == "reinforcement" }
    assert_equal 3, kids.map { |k| k["x"] }.uniq.size
    assert_equal 12, kids.map { |k| k["y"] }.uniq.size
  end

  test "a label width is an option, and the box the layout spaces by includes it" do
    wide = layout([self.class.stage("m0", primaries: 2)], { labelWidth: 240 })
    assert wide["nodes"].select { |n| n["kind"] == "step" }.all? { |n| n["w"] == 240 }
  end

  private

  def layout(stages, overrides = {})
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        const tree = m.buildTree({ title: "Ruta" }, #{stages.to_json})
        process.stdout.write(JSON.stringify(m.layoutJourney(tree, #{overrides.to_json})))
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end

  def solid_nodes(result) = result["nodes"].select { |n| n["w"].positive? && n["h"].positive? }

  def intersect?(a, b)
    a["x"] < b["x"] + b["w"] - EPS && b["x"] < a["x"] + a["w"] - EPS &&
      a["y"] < b["y"] + b["h"] - EPS && b["y"] < a["y"] + a["h"] - EPS
  end

  def first_pair(items)
    items.each_with_index do |a, i|
      items.drop(i + 1).each { |b| return [a, b] if yield(a, b) }
    end
    nil
  end

  # Liang–Barsky against the box shrunk by EPS: touching an edge is not a crossing.
  def segment_hits?(p, q, box)
    x0, y0 = p
    dx = q[0] - x0
    dy = q[1] - y0
    t0 = 0.0
    t1 = 1.0
    [[-dx, x0 - (box["x"] + EPS)], [dx, (box["x"] + box["w"] - EPS) - x0],
     [-dy, y0 - (box["y"] + EPS)], [dy, (box["y"] + box["h"] - EPS) - y0]].each do |pp, qq|
      if pp.zero?
        return false if qq.negative?
      else
        r = qq / pp.to_f
        pp.negative? ? (t0 = [t0, r].max) : (t1 = [t1, r].min)
        return false if t0 > t1
      end
    end
    true
  end

  # spine: one per module (root→first, then module→next); per module:
  # module→first cell, route edges between consecutive cells, one fan edge per
  # reinforcement. Cells = primaries + 1 anchor when orphans exist.
  def expected_edge_count(stages)
    stages.sum do |stage|
      topics = stage["topics"]
      reinforcement = topics.count { |t| t["reinforcement"] }
      primaries = topics.count { |t| !t["reinforcement"] }
      orphans = topics.count { |t| t["reinforcement"] && t["parent_id"].nil? }
      cells = primaries + (orphans.positive? ? 1 : 0)
      1 + (cells.positive? ? 1 : 0) + [cells - 1, 0].max + reinforcement
    end
  end
end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/javascript/journey_map_layout_test.rb`
Expected: every test fails with `node failed: … Cannot find module …/journey_map_layout.js`.

- [ ] **Step 3: Write the module.**

```javascript
// WP-37 — the journey as a map. Pure geometry: NO DOM, no Stimulus, no CSS, so
// every rule below is asserted under node by test/javascript/journey_map_layout_test.rb.
//
// THE TREE. Route → modules (along a spine) → primary steps → reinforcement.
// It is never deeper than that, and every node of a kind has the same size.
//
// THE ALGORITHM, NAMED HONESTLY. This implements Reingold–Tilford's RULES — no
// two boxes overlap, a parent is centred over its children, children keep their
// order, identical subtrees are drawn identically — at the tree's real depth. At
// depth 3 with fixed boxes the contour threads of Buchheim's general algorithm
// reduce to subtree widths, so it does not carry them. It is not a general
// tidy-tree; a deeper tree needs that algorithm, not an extra level here.
//
// THE PICTURE. Modules own a reserved SPINE COLUMN (x ≈ 0). Up to `rowSize`
// steps lie in one row BESIDE their module; more wrap into rows BELOW it,
// alternating direction (a snake), so route order reads as one path. Every row
// has a reserved GUTTER at each end, and the hop from one row to the next runs
// down the gutter, never through the fan hanging under the row-end step.
// Reinforcement hangs under its step in a fan of `fanRowSize` columns; its edges
// run along "streets" in the gaps between fan rows and a trunk in the fan's own
// left gutter, so no edge passes through a box it does not end at.

export const DEFAULTS = Object.freeze({
  labelWidth: 168,
  labelFontPx: 13,
  labelLineHeight: 18,
  labelLines: 2,
  labelGap: 8,
  rootWidth: 360,
  rootHeight: 76,
  rootGap: 56,
  moduleDiameter: 56,
  stepDiameter: 44,
  reinforcementDiameter: 32,
  cellGap: 24,
  rowGap: 40,
  gutter: 32,
  moduleGap: 72,
  fanGutter: 24,
  fanGap: 16,
  fanRowGap: 20,
  rowSize: 4,
  fanRowSize: 3
});

const isReinforcement = (topic) => topic.reinforcement === true;

// The controller's JSON → the tree. Reinforcement goes under its parent_id when
// that parent is a primary step of the same module; otherwise it is an ORPHAN,
// and the orphans of a module share one anchor cell placed first.
export function buildTree(root, stages) {
  return {
    root: { title: (root && root.title) || "" },
    modules: (stages || []).map((stage, index) => {
      const topics = stage.topics || [];
      const cells = [];
      const byId = new Map();
      for (const topic of topics) {
        if (isReinforcement(topic)) continue;
        const cell = { kind: "step", topic, children: [] };
        cells.push(cell);
        byId.set(topic.id, cell);
      }
      const orphans = [];
      for (const topic of topics) {
        if (!isReinforcement(topic)) continue;
        const parent = topic.parent_id == null ? null : byId.get(topic.parent_id);
        (parent ? parent.children : orphans).push(topic);
      }
      if (orphans.length) cells.unshift({ kind: "anchor", topic: null, children: orphans });
      return {
        id: `m:${stage.module_id}`,
        moduleId: stage.module_id,
        index,
        stage,
        readable: stage.readable === true,
        cells
      };
    })
  };
}

function nodeSize(kind, o) {
  const d = kind === "module" ? o.moduleDiameter
    : kind === "reinforcement" ? o.reinforcementDiameter
    : o.stepDiameter;
  return { d, w: Math.max(o.labelWidth, d), h: d + o.labelGap + o.labelLines * o.labelLineHeight };
}

function measureCell(cell, o) {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const n = cell.children.length;
  if (n === 0) return { w: step.w, h: step.h, fanW: 0 };
  const cols = Math.min(o.fanRowSize, n);
  const rows = Math.ceil(n / o.fanRowSize);
  const fanW = cols * kid.w + (cols - 1) * o.fanGap;
  return { w: Math.max(step.w, o.fanGutter + fanW), h: step.h + rows * (kid.h + o.fanRowGap), fanW };
}

const edge = (from, to, kind, points, locked) => ({ from: from.id, to: to.id, kind, points, locked });

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function placeCell(measured, left, top, mod, o, out) {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const { cell } = measured;
  const kids = cell.children;
  const fanLeft = left + o.fanGutter;
  // Centred over its fan — Reingold–Tilford's rule — or over its own cell.
  const cx = kids.length ? fanLeft + measured.fanW / 2 : left + measured.w / 2;
  const cy = top + step.d / 2;
  const shared = { moduleId: mod.id, readable: mod.readable, level: mod.stage.level };
  const head = cell.kind === "anchor"
    ? { id: `a:${mod.moduleId}`, kind: "anchor", x: cx, y: cy, w: 0, h: 0, cx, cy, ...shared }
    : { id: `s:${cell.topic.id}`, kind: "step", x: cx - step.w / 2, y: top, w: step.w, h: step.h, cx, cy,
        topic: cell.topic, ...shared };
  out.nodes.push(head);

  const headBottom = top + step.h;
  const trunkX = left + o.fanGutter / 2;
  const street0 = headBottom + o.fanRowGap / 2;
  kids.forEach((topic, i) => {
    const row = Math.floor(i / o.fanRowSize);
    const col = i % o.fanRowSize;
    const rowTop = headBottom + o.fanRowGap + row * (kid.h + o.fanRowGap);
    const x = fanLeft + col * (kid.w + o.fanGap);
    const child = { id: `s:${topic.id}`, kind: "reinforcement", x, y: rowTop, w: kid.w, h: kid.h,
                    cx: x + kid.w / 2, cy: rowTop + kid.d / 2, topic, ...shared };
    out.nodes.push(child);
    const street = rowTop - o.fanRowGap / 2;
    const points = row === 0
      ? [[cx, cy], [cx, street0], [child.cx, street0], [child.cx, child.cy]]
      : [[cx, cy], [cx, street0], [trunkX, street0], [trunkX, street], [child.cx, street], [child.cx, child.cy]];
    out.edges.push(edge(head, child, "fan", points, !mod.readable));
  });

  out.cells.push({ id: head.id, x: left, y: top, w: measured.w, h: measured.h, children: kids.length });
  return head;
}

export function layoutJourney(tree, overrides = {}) {
  const o = { ...DEFAULTS, ...overrides };
  const out = { nodes: [], edges: [], cells: [], modules: [] };
  const moduleSize = nodeSize("module", o);
  const step = nodeSize("step", o);
  const spineHalf = Math.max(o.labelWidth, o.moduleDiameter) / 2;
  const rowLeft = spineHalf + o.gutter;

  const root = { id: "root", kind: "root", x: -o.rootWidth / 2, y: 0, w: o.rootWidth, h: o.rootHeight,
                 cx: 0, cy: o.rootHeight / 2 };
  out.nodes.push(root);

  let top = o.rootHeight + o.rootGap;
  let previous = root;
  for (const mod of tree.modules) {
    const moduleNode = { id: mod.id, kind: "module", x: -moduleSize.w / 2, y: top, w: moduleSize.w,
                         h: moduleSize.h, cx: 0, cy: top + moduleSize.d / 2, moduleId: mod.id,
                         stage: mod.stage, readable: mod.readable, level: mod.stage.level };
    out.nodes.push(moduleNode);
    out.edges.push(edge(previous, moduleNode, "spine", [[0, previous.cy], [0, moduleNode.cy]], false));
    previous = moduleNode;

    const measured = mod.cells.map((cell) => ({ cell, ...measureCell(cell, o) }));
    const single = measured.length <= o.rowSize;
    const rows = chunk(measured, o.rowSize);
    const widths = rows.map((row) => row.reduce((sum, c) => sum + c.w, 0) + (row.length - 1) * o.cellGap);
    const blockRight = rowLeft + Math.max(0, ...widths);
    let rowTop = single ? moduleNode.cy - step.d / 2 : moduleNode.y + moduleNode.h + o.rowGap;
    let blockBottom = moduleNode.y + moduleNode.h;
    const placedRows = [];

    rows.forEach((row, r) => {
      const ltr = r % 2 === 0;
      let cursor = ltr ? rowLeft : blockRight;
      const height = Math.max(...row.map((c) => c.h));
      const heads = row.map((c) => {
        const left = ltr ? cursor : cursor - c.w;
        cursor = ltr ? cursor + c.w + o.cellGap : cursor - c.w - o.cellGap;
        return placeCell(c, left, rowTop, mod, o, out);
      });
      placedRows.push({ top: rowTop, bottom: rowTop + height, direction: ltr ? "ltr" : "rtl", heads });
      blockBottom = Math.max(blockBottom, rowTop + height);
      rowTop += height + o.rowGap;
    });

    const locked = !mod.readable;
    const sequence = placedRows.flatMap((row) => row.heads.map((head) => ({ head, row })));
    if (sequence.length) {
      const first = sequence[0].head;
      const points = single
        ? [[0, moduleNode.cy], [first.cx, first.cy]]
        : [[0, moduleNode.cy], [0, first.cy], [first.cx, first.cy]];
      out.edges.push(edge(moduleNode, first, "module", points, locked));
    }
    const leftGutterX = spineHalf + o.gutter / 2;
    const rightGutterX = blockRight + o.gutter / 2;
    for (let i = 0; i + 1 < sequence.length; i++) {
      const a = sequence[i];
      const b = sequence[i + 1];
      let points;
      if (a.row === b.row) {
        points = [[a.head.cx, a.head.cy], [b.head.cx, b.head.cy]];
      } else {
        const gx = a.row.direction === "ltr" ? rightGutterX : leftGutterX;
        points = [[a.head.cx, a.head.cy], [gx, a.head.cy], [gx, b.head.cy], [b.head.cx, b.head.cy]];
      }
      out.edges.push(edge(a.head, b.head, "route", points, locked));
    }

    out.modules.push({
      id: mod.id,
      moduleId: mod.moduleId,
      box: { x: -spineHalf, y: moduleNode.y, w: blockRight + o.gutter + spineHalf, h: blockBottom - moduleNode.y },
      spineHalf,
      gutters: { left: [spineHalf, rowLeft], right: [blockRight, blockRight + o.gutter] },
      rows: placedRows.map((row) => ({ top: row.top, bottom: row.bottom, direction: row.direction,
                                        heads: row.heads.map((h) => h.id) }))
    });
    top = blockBottom + o.moduleGap;
  }

  out.bounds = boundsOf(out);
  return out;
}

function boundsOf({ nodes, edges }) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const take = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const n of nodes) { take(n.x, n.y); take(n.x + n.w, n.y + n.h); }
  for (const e of edges) for (const [x, y] of e.points) take(x, y);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
```

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.

  If an edge-crossing test fails, fix the routing in the module, never the test. The test is the spec's §2.5.

- [ ] **Step 5: Commit.**

```bash
git add app/javascript/lib/journey_map_layout.js test/javascript/journey_map_layout_test.rb
git commit -m "feat(journey): the map's pure layout — tidy-tree rules at depth 3

Reserved spine column, snake rows with reserved gutters, wrapped reinforcement
fans with street/trunk edges. Node tests at 1/7/8/20/43 x 1/2/5 modules, both
43 shapes and 7+13: no node, subtree or edge-through-box overlap.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `journey_camera.js` — one safe area, fit, zoom, initial camera → **CHECKPOINT 2**

**Files:**
- Create: `app/javascript/lib/journey_camera.js`
- Create: `test/javascript/journey_camera_test.rb`

**Interfaces:**
- Consumes: world boxes `{ x, y, w, h }` from Task 6.
- Produces (used by Task 9). A camera is `{ x, y, k }`, with screen = world × k + (x, y), in viewport-local pixels. Rects are `{ left, top, width, height }`.
  - `safeRect(viewport, overlays) -> rect`
  - `clampScale(k, { min, max }) -> number`
  - `centerOn(point{x, y}, safe, k) -> camera`
  - `fitCamera(box, safe, { padding = 32, min = 0.05, max = 1 }) -> camera`
  - `zoomAbout(camera, point{x, y}, factor, { min, max }) -> camera`
  - `screenBox(camera, box) -> rect`
  - `ensureVisible(camera, box, safe, margin = 24) -> camera`
  - `initialCamera({ moduleBox, node, safe, minScale, padding = 24 }) -> camera`

- [ ] **Step 1: Write the failing node tests.**

```ruby
require "test_helper"
require "json"
require "open3"

# WP-37 §3.2-3.4. Camera math, pure. ONE safe area — the viewport minus the
# overlays — is what (c), Fit, the rail and focus-follows-camera all mean.
class JourneyCameraTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_camera.js")
  DESKTOP = { left: 0, top: 0, width: 1440, height: 1000 }.freeze
  PHONE = { left: 0, top: 0, width: 390, height: 844 }.freeze
  TOPBAR = { left: 0, top: 0, width: 1440, height: 52 }.freeze
  CONTROLS = { left: 1290, top: 924, width: 134, height: 44 }.freeze
  RAIL = { left: 1415, top: 440, width: 10, height: 120 }.freeze

  test "a full-width bar at the top insets the top" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    assert_equal({ "left" => 0, "top" => 52, "width" => 1440, "height" => 948 }, safe)
  end

  test "each overlay insets the edge that costs the least, and overlays outside are ignored" do
    outside = { left: 2000, top: 10, width: 50, height: 50 }
    safe = call("safeRect", DESKTOP, [TOPBAR, CONTROLS, RAIL, outside])
    assert_equal 52, safe["top"]
    assert_equal 1000 - 924, 1000 - (safe["top"] + safe["height"]), "the controls inset the bottom"
    assert_equal 1440 - 1415, 1440 - (safe["left"] + safe["width"]), "the rail insets the right"
    assert_equal 0, safe["left"]
  end

  test "on a phone the same overlays leave a usable rect" do
    phone_controls = { left: 246, top: 784, width: 134, height: 44 }
    phone_rail = { left: 365, top: 362, width: 10, height: 120 }
    safe = call("safeRect", PHONE, [{ left: 0, top: 0, width: 390, height: 72 }, phone_controls, phone_rail])
    assert_operator safe["width"], :>=, 340
    assert_operator safe["height"], :>=, 700
  end

  test "zooming about a point keeps that point fixed" do
    cam = call("zoomAbout", { x: 100, y: 50, k: 1 }, { x: 400, y: 300 }, 1.5, { min: 0.1, max: 2 })
    world_before = [(400 - 100) / 1.0, (300 - 50) / 1.0]
    assert_in_delta 400, world_before[0] * cam["k"] + cam["x"], 1e-6
    assert_in_delta 300, world_before[1] * cam["k"] + cam["y"], 1e-6
  end

  test "zoom is clamped" do
    assert_equal 2, call("zoomAbout", { x: 0, y: 0, k: 1.8 }, { x: 0, y: 0 }, 4, { min: 0.1, max: 2 })["k"]
  end

  test "fit puts the whole box inside the safe rect" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    box = { x: -84, y: 0, w: 2400, h: 3000 }
    cam = call("fitCamera", box, safe, { padding: 32, min: 0.05, max: 1 })
    s = call("screenBox", cam, box)
    assert_inside s, safe
  end

  test "initial camera: a module that fits is centred whole, at no more than 1x" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    mod = { x: -84, y: 132, w: 900, h: 300 }
    node = { x: 400, y: 150, w: 168, h: 88 }
    cam = call("initialCamera", { moduleBox: mod, node: node, safe: safe, minScale: 12 / 13.0 })
    assert_operator cam["k"], :<=, 1
    assert_inside call("screenBox", cam, mod), safe
  end

  test "initial camera: a module too big at the legible floor centres the current step instead" do
    safe = call("safeRect", PHONE, [{ left: 0, top: 0, width: 390, height: 72 }])
    mod = { x: -84, y: 132, w: 900, h: 3000 }
    node = { x: 600, y: 2000, w: 168, h: 88 }
    cam = call("initialCamera", { moduleBox: mod, node: node, safe: safe, minScale: 12 / 13.0 })
    assert_in_delta 12 / 13.0, cam["k"], 1e-9, "labels must be at least 12px at first paint"
    assert_inside call("screenBox", cam, node), safe
  end

  test "initial camera with no module (nothing readable) centres the root at 1x" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    root = { x: -180, y: 0, w: 360, h: 76 }
    cam = call("initialCamera", { moduleBox: nil, node: root, safe: safe, minScale: 12 / 13.0 })
    assert_equal 1, cam["k"]
    assert_inside call("screenBox", cam, root), safe
  end

  test "ensureVisible moves an off-screen box just inside the safe rect" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    box = { x: 3000, y: 2000, w: 168, h: 88 }
    cam = call("ensureVisible", { x: 0, y: 0, k: 1 }, box, safe, 24)
    assert_inside call("screenBox", cam, box), safe
  end

  private

  def call(fn, *args)
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        process.stdout.write(JSON.stringify(m.#{fn}(...#{args.to_json})))
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end

  def assert_inside(screen, safe)
    assert_operator screen["left"], :>=, safe["left"] - 0.01
    assert_operator screen["top"], :>=, safe["top"] - 0.01
    assert_operator screen["left"] + screen["width"], :<=, safe["left"] + safe["width"] + 0.01
    assert_operator screen["top"] + screen["height"], :<=, safe["top"] + safe["height"] + 0.01
  end
end
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `bin/rails test test/javascript/journey_camera_test.rb`
Expected: every test fails, `Cannot find module …/journey_camera.js`.

- [ ] **Step 3: Write the module.**

```javascript
// WP-37 §3.2-3.4 — camera math for the journey map. Pure: no DOM.
//
// A camera is { x, y, k }: a world point p appears at p * k + (x, y) in
// viewport-local pixels. World boxes are { x, y, w, h } (from
// journey_map_layout.js); screen rects are { left, top, width, height }.

// THE SAFE AREA. Everything that asks "is it on screen?" — the initial camera,
// Fit, the rail, focus-follows-camera — means the viewport MINUS the overlays
// drawn over it (the fixed topbar, the controls, the rail, the list link). Each
// overlay insets the one viewport edge it costs the least to clear, measured as
// a fraction of that dimension: a full-width bar insets the top, a corner button
// group the nearer short side, a thin rail the right.
export function safeRect(viewport, overlays = []) {
  const inset = { top: 0, bottom: 0, left: 0, right: 0 };
  const vRight = viewport.left + viewport.width;
  const vBottom = viewport.top + viewport.height;
  for (const o of overlays) {
    if (!o || o.width <= 0 || o.height <= 0) continue;
    const oRight = o.left + o.width;
    const oBottom = o.top + o.height;
    if (oRight <= viewport.left || o.left >= vRight || oBottom <= viewport.top || o.top >= vBottom) continue;
    const options = [
      ["top", oBottom - viewport.top, viewport.height],
      ["bottom", vBottom - o.top, viewport.height],
      ["left", oRight - viewport.left, viewport.width],
      ["right", vRight - o.left, viewport.width]
    ];
    const [side, amount] = options.reduce((best, c) => (c[1] / c[2] < best[1] / best[2] ? c : best));
    inset[side] = Math.max(inset[side], amount);
  }
  return {
    left: viewport.left + inset.left,
    top: viewport.top + inset.top,
    width: Math.max(0, viewport.width - inset.left - inset.right),
    height: Math.max(0, viewport.height - inset.top - inset.bottom)
  };
}

export function clampScale(k, { min = 0.05, max = 2 } = {}) {
  return Math.min(max, Math.max(min, k));
}

export function centerOn(point, safe, k) {
  return { x: safe.left + safe.width / 2 - point.x * k, y: safe.top + safe.height / 2 - point.y * k, k };
}

const centerOf = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

export function fitCamera(box, safe, { padding = 32, min = 0.05, max = 1 } = {}) {
  const k = clampScale(
    Math.min((safe.width - 2 * padding) / box.w, (safe.height - 2 * padding) / box.h),
    { min, max }
  );
  return centerOn(centerOf(box), safe, k);
}

export function zoomAbout(camera, point, factor, range) {
  const k = clampScale(camera.k * factor, range);
  const wx = (point.x - camera.x) / camera.k;
  const wy = (point.y - camera.y) / camera.k;
  return { x: point.x - wx * k, y: point.y - wy * k, k };
}

export function screenBox(camera, box) {
  return { left: box.x * camera.k + camera.x, top: box.y * camera.k + camera.y,
           width: box.w * camera.k, height: box.h * camera.k };
}

// The smallest camera move that brings `box` inside the safe rect (with margin).
// A box larger than the rect is aligned to its top-left.
export function ensureVisible(camera, box, safe, margin = 24) {
  const s = screenBox(camera, box);
  const L = safe.left + margin;
  const R = safe.left + safe.width - margin;
  const T = safe.top + margin;
  const B = safe.top + safe.height - margin;
  let dx = 0;
  let dy = 0;
  if (s.width > R - L || s.left < L) dx = L - s.left;
  else if (s.left + s.width > R) dx = R - (s.left + s.width);
  if (s.height > B - T || s.top < T) dy = T - s.top;
  else if (s.top + s.height > B) dy = B - (s.top + s.height);
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

// §3.4. Fit the current module, never zoomed past 1x and never below the scale
// that keeps labels legible. If the whole module fits at that scale, centre it;
// otherwise centre the current node. With no module (nothing readable), centre
// the given node — the root — at 1x.
export function initialCamera({ moduleBox, node, safe, minScale, padding = 24 }) {
  if (!moduleBox) return centerOn(centerOf(node), safe, 1);
  const fit = Math.min((safe.width - 2 * padding) / moduleBox.w, (safe.height - 2 * padding) / moduleBox.h);
  const k = clampScale(fit, { min: minScale, max: 1 });
  const fits = moduleBox.w * k <= safe.width - 2 * padding + 0.5 &&
               moduleBox.h * k <= safe.height - 2 * padding + 0.5;
  return centerOn(centerOf(fits ? moduleBox : node), safe, k);
}
```

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/javascript/lib/journey_camera.js test/javascript/journey_camera_test.rb
git commit -m "feat(journey): pure camera math with one safe area

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: CHECKPOINT 2 — STOP.** Report to the owner:
  - the commits of Tasks 5–7;
  - the red-then-green output of both node test files;
  - the exact commands to run them himself: `bin/rails test test/javascript/journey_map_layout_test.rb test/javascript/journey_camera_test.rb`;
  - the shape list (`SHAPES` keys).

  Do not start Task 8 until the owner says go.

---

### Task 8: `journey_map_test.rb` — the measured system test, written RED against today's page

**Files:**
- Create: `test/system/journey_map_test.rb`

**Interfaces:**
- Consumes (from Task 9, which turns it green):
  - `[data-journey-ready='true']` on the controller element;
  - `.jm-viewport`, `.jm-world`, `.jm-nodes`;
  - `.jm-node` with `data-node-id`;
  - `.jm-node--current`, `.jm-node--masked`;
  - `.jm-node__label`, `.jm-node__tag`, `.jm-root` (the `<h1>`);
  - `[data-lock-glyph]`, `[data-journey-overlay]`, `#journey-topbar`;
  - `[data-action~='route-journey#fit']`, `[data-route-journey-target='railDot']`.

- [ ] **Step 1: Write the test file.**

```ruby
require "application_system_test_case"

# WP-37 §4.3. Measured, not trusted: what the student SEES at first paint —
# pixels, contrast, legible text, nothing under an overlay — at 7 and 43, in both
# themes, on a desktop and on a phone.
#
# `SCREENSHOT=1 bin/rails test test/system/journey_map_test.rb` writes the five
# handoff captures from the same renders the assertions measured.
class JourneyMapTest < ApplicationSystemTestCase
  MIN_LABEL_PX = 12
  MIN_CONTRAST = 4.5
  # Real-length Spanish titles (40-70 chars), plus Review Focus 1 (one 70-char
  # word) and 2 (markup and quotes that must render as text).
  TITLES = [
    "Pronombres personales y el verbo ser en presente",
    "Saludos formales e informales en situaciones de viaje",
    "Comparar <b>ser</b> y \"estar\" con ejemplos cotidianos",
    "Números del uno al cien y cómo pedir precios en el mercado",
    "Supercalifragilisticoespialidosoextraordinariamenteincomprensible",
    "Pedir direcciones y entender las respuestas más comunes",
    "El pretérito perfecto para contar lo que hiciste hoy"
  ].freeze

  def setup
    @user = Core::User.create!(
      name: "Mapa", email: "map-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
  end

  def teardown
    page.driver.browser.execute_cdp("Emulation.setEmulatedMedia", features: [])
    page.current_window.resize_to(1440, 1000)
  end

  # ── (a)(b)(c) + no page scroll, both themes, 7 and 43 ─────────────────
  [7, 43].each do |size|
    %w[light dark].each do |theme|
      test "#{size} steps, #{theme}: labels legible and apart, current step clear of the overlays" do
        route = build_route(size)
        open_journey(route, theme: theme, reduced_motion: size == 43)

        labels = measure_labels
        assert_operator labels.size, :>=, size, "every step must carry a label"
        assert_nil first_overlap(label_boxes(labels)), "two labels overlap on screen"
        labels.each do |l|
          assert_operator l["px"], :>=, MIN_LABEL_PX - 0.01, "#{l['text'].inspect} renders at #{l['px']}px"
          assert_operator l["contrast"], :>=, MIN_CONTRAST,
            "#{l['text'].inspect} (#{l['cls']}) measures #{format('%.2f', l['contrast'])}:1 on #{theme}"
        end
        assert_current_clear(route)
        assert_no_page_scroll
        report_ellipsis(size, theme, labels)
        screenshot("#{size}-#{theme}")
      end
    end
  end

  # ── Phone ─────────────────────────────────────────────────────────────
  [7, 43].each do |size|
    test "#{size} steps on a phone: legible, apart, current step clear of every overlay" do
      page.current_window.resize_to(390, 844)
      route = build_route(size)
      open_journey(route)

      labels = measure_labels
      assert_nil first_overlap(label_boxes(labels))
      labels.each do |l|
        assert_operator l["px"], :>=, MIN_LABEL_PX - 0.01
        assert_operator l["contrast"], :>=, MIN_CONTRAST
      end
      assert_current_clear(route)
      assert_no_page_scroll
      screenshot("phone") if size == 7
    end
  end

  # ── (d) Tab order ─────────────────────────────────────────────────────
  test "Tab walks the readable steps in route order, each step then its reinforcement" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    expected = route.route_steps.where(route_module: preview_of(route)).order(:position).pluck(:id).map { |id| "s:#{id}" }

    page.execute_script("document.querySelector('.jm-viewport').focus()")
    seen = []
    (expected.size + 5).times do
      page.driver.browser.action.send_keys(:tab).perform
      id = page.evaluate_script("document.activeElement && document.activeElement.dataset.nodeId")
      break if seen.any? && !id.to_s.start_with?("s:")

      seen << id if id.to_s.start_with?("s:")
    end
    assert_equal expected, seen
  end

  # ── (e) Locked masking ────────────────────────────────────────────────
  test "a locked module leaks no titles, in text, title or aria-label" do
    route = build_route(7)
    open_journey(route)
    refute_includes page.html, "SECRETO", "a locked module leaked the titles the student has not bought"
    assert_selector ".jm-node--masked", count: 2
  end

  # ── Purchased ─────────────────────────────────────────────────────────
  test "a purchased module is readable: titles in the DOM and no lock glyph" do
    route = build_route(7)
    pay_for_route!(route)
    open_journey(route)

    assert_includes page.html, "SECRETO 0"
    assert_equal 0, page.evaluate_script("document.querySelectorAll('.jm-node--masked, [data-lock-glyph]').length")
  end

  # ── (f) Reduced motion ────────────────────────────────────────────────
  test "with reduced motion the first paint is the final picture" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)

    first = node_boxes
    sleep 1
    assert_equal 0, page.evaluate_script("document.getAnimations().length")
    assert_equal first, node_boxes
  end

  # ── Review Focus 2: titles are text ───────────────────────────────────
  test "markup in a title renders as text" do
    route = build_route(7)
    open_journey(route)
    assert_equal 0, page.evaluate_script("document.querySelectorAll('.jm-nodes b').length")
    assert_includes page.evaluate_script("document.querySelector('.jm-nodes').textContent"), "<b>ser</b>"
  end

  # ── Interactions (reduced motion: no transition to wait for) ──────────
  test "Fit shows every node clear of the overlays" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    find("[data-action~='route-journey#fit']").click
    node_boxes.each { |box| assert_clear box }
  end

  test "a rail click brings that module into view" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    all("[data-route-journey-target='railDot']").last.click
    locked = route.route_modules.find_by!(access_state: :locked)
    assert_clear box_of("m:#{locked.id}")
  end

  test "a pointer drag pans by the dragged distance; a drag from a node does not navigate" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    before = translate
    x, y = empty_point
    page.driver.browser.action.move_to_location(x, y).click_and_hold.move_by(120, 80).release.perform
    after = translate
    assert_in_delta before[0] + 120, after[0], 1
    assert_in_delta before[1] + 80, after[1], 1

    url = page.current_url
    node = find(".jm-node--current").native
    page.driver.browser.action.move_to(node).click_and_hold.move_by(60, 0).release.perform
    assert_equal url, page.current_url, "a drag that starts on a node navigated"
  end

  test "a plain click on a node still navigates" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    find(".jm-node--current").click
    assert_current_path %r{/steps/}
  end

  test "a plain wheel pans and does not zoom" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    before = matrix
    origin = Selenium::WebDriver::WheelActions::ScrollOrigin.element(find(".jm-viewport").native)
    page.driver.browser.action.scroll_from(origin, 0, 200).perform
    after = matrix
    assert_in_delta before["a"], after["a"], 1e-6, "a plain wheel zoomed"
    assert_in_delta before["f"] - 200, after["f"], 1
  end

  test "Tab onto an off-screen node brings it into view" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    last_id = page.evaluate_script("[...document.querySelectorAll('a.jm-node')].pop().dataset.nodeId")
    page.execute_script("document.querySelector(`[data-node-id='#{last_id}']`).focus()")
    assert_clear box_of(last_id)
  end

  # ── Review Focus 4: resize after load ─────────────────────────────────
  test "after the window resizes, the current step is still clear of the overlays" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    page.current_window.resize_to(390, 844)
    sleep 0.3
    assert_current_clear(route)
  end

  private

  def build_route(size)
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués para viajar", locale: "es", status: :active, current_step: 2
    )
    preview = preview_of(route)
    position = 0
    7.times do |i|
      step = route.route_steps.create!(
        route_module: preview, title: TITLES[i], position: position,
        status: i < 2 ? :completed : (i == 2 ? :available : :locked),
        content_type: :lesson, level: :nv1, bloom_level: 1
      )
      position += 1
      next unless size == 43 && i == 2

      36.times do |j|
        route.route_steps.create!(
          route_module: preview, title: "Refuerzo #{j + 1}: #{TITLES[j % TITLES.size]}", position: position,
          status: :locked, content_type: :lesson, level: :nv1, bloom_level: 1,
          metadata: { "reinforcement" => true, "triggering_step_id" => step.id }
        )
        position += 1
      end
    end
    locked = route.route_modules.create!(position: 2, title: "Módulo avanzado", access_state: :locked,
                                         generation_state: :ready)
    2.times do |i|
      route.route_steps.create!(route_module: locked, title: "SECRETO #{i}", position: 100 + i,
                                status: :locked, content_type: :lesson, level: :nv1, bloom_level: 1)
    end
    route
  end

  def preview_of(route)
    LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
  end

  def open_journey(route, theme: "light", reduced_motion: false)
    if reduced_motion
      page.driver.browser.execute_cdp("Emulation.setEmulatedMedia",
                                      features: [{ name: "prefers-reduced-motion", value: "reduce" }])
    end
    sign_in_through_ui
    visit learning_routes_engine.journey_route_path(route)
    page.execute_script("document.documentElement.setAttribute('data-theme', #{theme.to_json})")
    assert_selector "[data-journey-ready='true']", wait: 10
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end

  MEASURE_LABELS = <<~JS.freeze
    (() => {
      const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null
        const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const backing = (el) => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0.99) return c } return parse(getComputedStyle(document.body).backgroundColor) }
      const scale = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".jm-world")).transform).a
      return [...document.querySelectorAll(".jm-node__label, .jm-node__tag, .jm-root")].map((el) => {
        const L1 = lum(parse(getComputedStyle(el).color)), L2 = lum(backing(el)), b = el.getBoundingClientRect()
        return { text: el.textContent.trim(), cls: el.className,
                 px: parseFloat(getComputedStyle(el).fontSize) * scale,
                 contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
                 box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
                 clipped: el.scrollHeight > el.clientHeight + 1 }
      })
    })()
  JS

  def measure_labels = page.evaluate_script(MEASURE_LABELS)

  # Tags sit INSIDE their module's label, so they are measured for contrast and
  # size but excluded from the overlap check.
  def label_boxes(labels) = labels.reject { |l| l["cls"].include?("jm-node__tag") }.map { |l| l["box"] }

  def overlay_boxes
    page.evaluate_script(<<~JS)
      [...document.querySelectorAll("#journey-topbar, [data-journey-overlay]")].map((el) => {
        const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
    JS
  end

  def box_of(node_id)
    page.evaluate_script(<<~JS)
      (() => { const b = document.querySelector(`[data-node-id='#{node_id}']`).getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })()
    JS
  end

  def node_boxes
    page.evaluate_script(<<~JS)
      [...document.querySelectorAll(".jm-node")].map((el) => { const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
    JS
  end

  def assert_clear(box)
    w, h = page.evaluate_script("[innerWidth, innerHeight]")
    assert_operator box["left"], :>=, 0
    assert_operator box["top"], :>=, 0
    assert_operator box["right"], :<=, w
    assert_operator box["bottom"], :<=, h
    hit = overlay_boxes.find { |o| first_overlap([box, o]) }
    assert_nil hit, "the node sits under an overlay #{hit.inspect}"
  end

  def assert_current_clear(route)
    expected = route.route_steps.find_by!(position: route.current_step)
    assert_equal "s:#{expected.id}", page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId")
    assert_clear box_of("s:#{expected.id}")
  end

  def assert_no_page_scroll
    scroll, client = page.evaluate_script(
      "[document.documentElement.scrollHeight, document.documentElement.clientHeight]"
    )
    assert_equal client, scroll, "the page scrolls"
  end

  def matrix
    page.evaluate_script(<<~JS)
      (() => { const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".jm-world")).transform)
        return { a: m.a, e: m.e, f: m.f } })()
    JS
  end

  def translate = matrix.values_at("e", "f")

  def empty_point
    page.evaluate_script(<<~JS)
      (() => { for (let y = 140; y < innerHeight - 140; y += 16) for (let x = 40; x < innerWidth - 80; x += 16) {
        const el = document.elementFromPoint(x, y)
        if (el && (el.classList.contains("jm-viewport") || el.classList.contains("jm-world") || el.closest(".jm-edges")))
          return [x, y] } return null })()
    JS
  end

  def first_overlap(boxes)
    boxes.each_with_index do |a, i|
      boxes.drop(i + 1).each do |b|
        overlaps = a["left"] < b["right"] - 1 && b["left"] < a["right"] - 1 &&
                   a["top"] < b["bottom"] - 1 && b["top"] < a["bottom"] - 1
        return [a, b] if overlaps
      end
    end
    nil
  end

  def report_ellipsis(size, theme, labels)
    steps = labels.select { |l| l["cls"].include?("jm-node__label") }
    puts "[wp37] #{size} steps #{theme}: #{steps.count { |l| l['clipped'] }}/#{steps.size} labels ellipsized " \
         "(labelWidth 168px, 13px)"
  end

  def screenshot(name)
    return unless ENV["SCREENSHOT"]

    path = Rails.root.join("tmp", "wp37-journey-#{name}.png")
    page.save_screenshot(path.to_s)
    puts "[#{name}] screenshot -> #{path}"
  end

  # The same purchase the paywall tests build (module_lock_authorization_test.rb:182).
  def pay_for_route!(route)
    quote = Commerce::RouteQuote.create_snapshot!(
      user: @user, learning_route: route, currency: "USD",
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
    Commerce::RoutePurchase.create!(
      user: @user, learning_route: route, route_quote: quote, state: "pending",
      provider: "lemon_squeezy", test_mode: true, amount_cents: 299, currency: "USD",
      estimated_ai_cost_microcents: 1_000_000, estimated_fee_cents: 40
    ).mark_paid!(order_id: "ord_#{SecureRandom.hex(3)}", actual_fee_cents: 45, paid_at: Time.current)
  end
end
```

- [ ] **Step 2: Run it and confirm it is RED against today's page.**

Run: `bin/rails test test/system/journey_map_test.rb`
Expected: every test fails or errors, because `[data-journey-ready='true']` is never present. Capture the summary line for the checkpoint report.

  This is the spec's "legibility test red today". Also record, from today's page, the measured label font-size of a satellite (`[data-sat-idx]`, 28 px box) to quote in the handoff:

  `bin/rails runner` can't measure; read it in the browser console against dev, `getComputedStyle(document.querySelector('[data-sat-idx] div')).fontSize`, and paste the value.

- [ ] **Step 3: Commit the red test.**

```bash
git add test/system/journey_map_test.rb
git commit -m "test(journey): the measured map test, red against the scrolling journey

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The canvas — markup, styles, controller, keys → green → **CHECKPOINT 3**

**Files:**
- Modify: `engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb` (full rewrite)
- Modify: `app/javascript/controllers/route_journey_controller.js` (full rewrite)
- Modify: `app/assets/tailwind/application.css` (append the map block)
- Modify: `config/importmap.rb` (add two pins after `:11`)
- Modify: `config/locales/en.yml`, `config/locales/es.yml` (the `learning_engine.journey` block, `:1059`)
- Modify: `routes_controller.rb` (remove `LEVEL_COLORS` and the `color:` key)

**Interfaces:**
- Consumes: Task 3's JSON (`stages`, `root`), Task 6's `buildTree` / `layoutJourney` / `DEFAULTS`, Task 7's camera functions, Task 5's tokens.
- Produces: the DOM contract Task 8 measures (see Task 8's Interfaces).

- [ ] **Step 1: Locale keys.** Inside `learning_engine.journey` in `en.yml`, replace `scroll_to_explore: "Scroll to explore"` with:

```yaml
      drag_to_explore: "Drag to explore"
      map_keys: "Route map. Arrow keys pan, plus and minus zoom, 0 shows the whole route."
      fit: "Fit"
      fit_label: "Show the whole route"
      zoom_in: "Zoom in"
      zoom_out: "Zoom out"
      status_current: "You are here"
      status_available: "Available"
      status_reinforcement: "Reinforcement"
```

In `es.yml`, replace `scroll_to_explore: "Desplaza para explorar"` with:

```yaml
      drag_to_explore: "Arrastra para explorar"
      map_keys: "Mapa de la ruta. Las flechas desplazan, más y menos acercan o alejan, 0 muestra toda la ruta."
      fit: "Encajar"
      fit_label: "Ver toda la ruta"
      zoom_in: "Acercar"
      zoom_out: "Alejar"
      status_current: "Estás aquí"
      status_available: "Disponible"
      status_reinforcement: "Refuerzo"
```

Confirm nothing else uses the removed key: `grep -rn "scroll_to_explore" app engines test`. Expected: no output after the view rewrite in Step 3.

- [ ] **Step 2: Pins.** In `config/importmap.rb`, after `pin "journey_layout", …` (deleted in Task 10):

```ruby
# WP-37: the journey map's pure geometry and camera (no DOM), tested under node
# by test/javascript/journey_map_layout_test.rb and journey_camera_test.rb.
pin "journey_map_layout", to: "lib/journey_map_layout.js"
pin "journey_camera", to: "lib/journey_camera.js"
```

- [ ] **Step 3: Rewrite `journey.html.erb`.**

```erb
<% content_for(:title, "#{@route.localized_topic} #{t('learning_engine.route.title_suffix')}") %>

<%
  total_count = @steps.size
  labels = {
    current: t("learning_engine.journey.status_current"),
    available: t("learning_engine.journey.status_available"),
    completed: t("learning_engine.journey.completed"),
    locked: t("learning_engine.journey.locked_topic"),
    reinforcement: t("learning_engine.journey.status_reinforcement")
  }
%>

<%# WP-37: the journey is a map. The page does not scroll; the camera moves.
    Nodes are built by route_journey_controller.js from the JSON below; the
    route title is the root node and the page's only <h1>. %>
<div id="journey-map" class="jm"
     data-controller="route-journey"
     data-route-journey-stages-value="<%= ERB::Util.html_escape(@stages.to_json) %>"
     data-route-journey-root-value="<%= ERB::Util.html_escape(@journey_root.to_json) %>"
     data-route-journey-labels-value="<%= ERB::Util.html_escape(labels.to_json) %>">

  <div class="jm-viewport" data-route-journey-target="viewport" tabindex="0" role="region"
       aria-label="<%= t('learning_engine.journey.map_keys') %>">
    <div class="jm-world" data-route-journey-target="world">
      <svg class="jm-edges" data-route-journey-target="edges" aria-hidden="true"></svg>
      <div class="jm-nodes" data-route-journey-target="nodes">
        <h1 class="jm-root" data-route-journey-target="root" data-node-id="root"><%= @journey_root[:title] %></h1>
      </div>
    </div>
  </div>

  <p class="jm-overlay jm-subtitle" data-journey-overlay>
    <%= t("learning_engine.journey.subtitle", stages: @stages.size, topics: total_count, subject: @route.localized_subject_area.presence || @route.localized_topic) %>
    · <%= t("learning_engine.journey.drag_to_explore") %>
  </p>

  <nav class="jm-overlay jm-rail" data-journey-overlay aria-label="<%= t('learning_engine.journey.stage_navigation') %>">
    <% @stages.each_with_index do |stage, i| %>
      <button type="button" class="jm-rail__dot" data-route-journey-target="railDot"
              data-action="click->route-journey#focusModule" data-stage-index="<%= i %>"
              style="--jm-level: var(--color-node-<%= stage[:level] %>);"
              aria-label="<%= t('learning_engine.journey.stage_of', current: i + 1, total: @stages.size) %> - <%= stage[:label] %>"></button>
    <% end %>
  </nav>

  <div class="jm-overlay jm-controls" data-journey-overlay>
    <button type="button" data-action="route-journey#zoomOut" aria-label="<%= t('learning_engine.journey.zoom_out') %>">−</button>
    <button type="button" data-action="route-journey#zoomIn" aria-label="<%= t('learning_engine.journey.zoom_in') %>">+</button>
    <button type="button" data-action="route-journey#fit" aria-label="<%= t('learning_engine.journey.fit_label') %>"><%= t("learning_engine.journey.fit") %></button>
  </div>

  <%= link_to route_path(@route), class: "jm-overlay jm-list-link", data: { journey_overlay: "" } do %>
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <%= t("learning_engine.journey.list_view") %>
  <% end %>
</div>
```

- [ ] **Step 4: Remove the colour from the JSON.** In `routes_controller.rb`, delete the `LEVEL_COLORS = …` constant and the `color: …` line in `build_journey_stages`. Nothing reads them now.

- [ ] **Step 5: Append the map styles** to `app/assets/tailwind/application.css`:

```css
/* ── WP-37 journey map ─────────────────────────────────────────────────── */
.jm { position: fixed; inset: 0; overflow: hidden; background: var(--color-bg); }
.jm-viewport { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; outline: none; }
.jm-viewport:focus-visible { box-shadow: inset 0 0 0 2px var(--color-txt); }
.jm-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.jm-world--animate { transition: transform 250ms ease; }
.jm-edges { position: absolute; overflow: visible; pointer-events: none; }
.jm-edge { fill: none; stroke: var(--color-faint); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.jm-edge--spine { stroke-width: 3; }
.jm-edge--locked { stroke-dasharray: 6 6; }
.jm-nodes { position: absolute; left: 0; top: 0; }
.jm-node { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px;
           text-decoration: none; color: var(--color-txt); }
.jm-node:focus-visible { outline: 2px solid var(--color-txt); outline-offset: 4px; border-radius: 8px; }
.jm-node__dot { position: relative; flex: none; border-radius: 50%; display: grid; place-items: center;
                background: var(--color-bg); border: 2px solid var(--jm-level); color: var(--jm-level); }
.jm-node--step .jm-node__dot { width: 44px; height: 44px; }
.jm-node--reinforcement .jm-node__dot { width: 32px; height: 32px; }
.jm-node--module .jm-node__dot { width: 56px; height: 56px; }
.jm-node--completed .jm-node__dot { background: var(--jm-level); color: var(--color-bg); }
.jm-node--current .jm-node__dot { box-shadow: 0 0 0 4px var(--color-bg), 0 0 0 6px var(--jm-level); }
.jm-node--current .jm-node__dot::after { content: ""; position: absolute; inset: -10px; border-radius: 50%;
                                          border: 2px solid var(--jm-level); animation: jm-pulse 2.4s ease-in-out infinite; }
.jm-node--locked .jm-node__dot, .jm-node--masked .jm-node__dot { border-style: dashed; border-color: var(--color-muted); }
.jm-node__ring { position: absolute; inset: -2px; transform: rotate(-90deg); }
.jm-node__ring circle { fill: none; stroke: var(--jm-level); stroke-width: 3; }
.jm-node__label { width: 168px; max-height: 36px; font-family: 'DM Sans', sans-serif; font-size: 13px; line-height: 18px;
                  text-align: center; color: var(--color-txt); display: -webkit-box; -webkit-line-clamp: 2;
                  -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.jm-node__tag { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 1px; color: var(--jm-level); margin-right: 4px; }
.jm-root { position: absolute; margin: 0; font-family: 'DM Sans', sans-serif; font-size: 24px; line-height: 30px;
           font-style: italic; font-weight: 400; text-align: center; color: var(--color-txt);
           display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jm-overlay { position: fixed; z-index: 20; }
.jm-subtitle { top: 60px; left: 28px; margin: 0; max-width: calc(100vw - 56px);
               font: 400 12px/16px 'DM Sans', sans-serif; color: var(--color-sub); }
.jm-rail { right: 16px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; }
.jm-rail__dot { width: 8px; height: 8px; border-radius: 50%; border: none; padding: 0; cursor: pointer; background: var(--jm-level); }
.jm-controls { right: 16px; bottom: 16px; display: flex; gap: 6px; }
.jm-controls button { min-width: 44px; height: 44px; padding: 0 10px; border-radius: 10px; cursor: pointer;
                      border: 1px solid var(--color-border-subtle); background: var(--color-card); color: var(--color-txt);
                      font: 500 14px 'DM Sans', sans-serif; }
.jm-list-link { left: 16px; bottom: 16px; display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
                font: 400 12px 'DM Sans', sans-serif; color: var(--color-sub); background: var(--color-card);
                border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 8px 12px; }
@keyframes jm-pulse { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: .1; transform: scale(1.15); } }
@media (prefers-reduced-motion: reduce) {
  .jm-world--animate { transition: none; }
  .jm-node--current .jm-node__dot::after { animation: none; }
}
```

Then: `env -u RAILS_MASTER_KEY bin/rails tailwindcss:build && grep -c "jm-node__label" app/assets/builds/tailwind.css`. Expected: ≥ 1.

- [ ] **Step 6: Rewrite the controller.** Replace `app/javascript/controllers/route_journey_controller.js` entirely:

```javascript
import { Controller } from "@hotwired/stimulus"
import { buildTree, layoutJourney, DEFAULTS } from "journey_map_layout"
import { safeRect, fitCamera, centerOn, zoomAbout, ensureVisible, initialCamera } from "journey_camera"

// WP-37 — the journey as a pannable, zoomable map. Geometry lives in
// journey_map_layout.js and camera math in journey_camera.js, both pure and
// tested under node; this controller renders and wires events, nothing else.
//
// Colours are CSS custom properties (var(--color-…)), never values read once at
// mount: a theme toggle repaints with no re-render.
const MIN_LABEL_PX = 12
const SVG_NS = "http://www.w3.org/2000/svg"
const DRAG_THRESHOLD = 4
const KEY_PAN = 60
const KEY_ZOOM = 1.2

export default class extends Controller {
  static targets = ["viewport", "world", "edges", "nodes", "root", "railDot"]
  static values = { stages: Array, root: Object, labels: Object }

  connect() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    this.layout = layoutJourney(buildTree(this.rootValue, this.stagesValue), DEFAULTS)
    this.nodeById = new Map(this.layout.nodes.map((n) => [n.id, n]))
    this._renderEdges()
    this._renderNodes()

    const safe = this._safe()
    const fitAll = fitCamera(this.layout.bounds, safe, { padding: 32, min: 0.01, max: 1 })
    this.minScale = MIN_LABEL_PX / DEFAULTS.labelFontPx
    this.zoomRange = { min: Math.min(fitAll.k, this.minScale), max: 2 }
    this.camera = this._initialCamera(safe)
    this._apply(false)

    this._bind()
    this.resizeObserver = new ResizeObserver(() => this._onResize())
    this.resizeObserver.observe(this.viewportTarget)
    this.element.dataset.journeyReady = "true"
  }

  disconnect() {
    this.resizeObserver?.disconnect()
    const vp = this.viewportTarget
    vp.removeEventListener("pointerdown", this.onPointerDown)
    vp.removeEventListener("pointermove", this.onPointerMove)
    vp.removeEventListener("pointerup", this.onPointerUp)
    vp.removeEventListener("pointercancel", this.onPointerUp)
    vp.removeEventListener("wheel", this.onWheel)
    vp.removeEventListener("keydown", this.onKeyDown)
    vp.removeEventListener("focusin", this.onFocusIn)
    vp.removeEventListener("click", this.onClickCapture, true)
  }

  // ── Actions ──────────────────────────────────────────────────────────
  fit() {
    this.camera = fitCamera(this.layout.bounds, this._safe(), { padding: 32, min: this.zoomRange.min, max: 1 })
    this._apply(true)
  }

  zoomIn() { this._zoomCenter(KEY_ZOOM) }
  zoomOut() { this._zoomCenter(1 / KEY_ZOOM) }

  focusModule(event) {
    const stage = this.stagesValue[Number(event.currentTarget.dataset.stageIndex)]
    const mod = stage && this.layout.modules.find((m) => m.moduleId === stage.module_id)
    if (!mod) return
    this.camera = fitCamera(mod.box, this._safe(), { padding: 32, min: this.zoomRange.min, max: 1 })
    this._apply(true)
  }

  // ── Rendering ────────────────────────────────────────────────────────
  _renderEdges() {
    const { x, y, w, h } = this.layout.bounds
    const svg = this.edgesTarget
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`)
    svg.setAttribute("width", w)
    svg.setAttribute("height", h)
    Object.assign(svg.style, { left: `${x}px`, top: `${y}px` })
    for (const edge of this.layout.edges) {
      const path = document.createElementNS(SVG_NS, "path")
      path.setAttribute("d", edge.points.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" "))
      path.setAttribute("class", `jm-edge jm-edge--${edge.kind}${edge.locked ? " jm-edge--locked" : ""}`)
      svg.appendChild(path)
    }
  }

  _renderNodes() {
    const layer = this.nodesTarget
    for (const node of this.layout.nodes) {
      if (node.kind === "root") { this._place(this.rootTarget, node); continue }
      if (node.kind === "anchor") continue
      const el = node.kind === "module" ? this._moduleNode(node) : this._topicNode(node)
      this._place(el, node)
      layer.appendChild(el)
    }
  }

  _place(el, node) {
    Object.assign(el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` })
    el.style.setProperty("--jm-level", `var(--color-node-${node.level || "nv1"})`)
  }

  _moduleNode(node) {
    const el = document.createElement("div")
    el.className = `jm-node jm-node--module${node.readable ? "" : " jm-node--locked"}`
    el.dataset.nodeId = node.id
    el.appendChild(this._dot(null))
    const label = document.createElement("span")
    label.className = "jm-node__label"
    const tag = document.createElement("span")
    tag.className = "jm-node__tag"
    tag.textContent = node.stage.tag
    label.append(tag, document.createTextNode(node.stage.label))
    el.appendChild(label)
    return el
  }

  _topicNode(node) {
    const topic = node.topic
    const masked = !node.readable
    const status = topic.current ? "current" : (topic.status === "completed" ? "completed"
      : (topic.status === "locked" ? "locked" : "available"))
    const el = document.createElement(topic.path ? "a" : "div")
    if (topic.path) {
      el.href = topic.path
      // A native link drag would fire pointercancel and steal the pan.
      el.draggable = false
    }
    el.className = [
      "jm-node", `jm-node--${node.kind}`, `jm-node--${status}`, masked ? "jm-node--masked" : ""
    ].filter(Boolean).join(" ")
    el.dataset.nodeId = node.id
    const statusText = this.labelsValue[status] || ""
    const parts = [topic.name, statusText, node.kind === "reinforcement" ? this.labelsValue.reinforcement : null]
    el.setAttribute("aria-label", parts.filter(Boolean).join(", "))
    if (!masked) el.title = topic.name
    if (masked) el.setAttribute("role", "img")

    el.appendChild(this._dot(masked ? "lock" : (status === "completed" ? "check" : null), topic.progress))
    const label = document.createElement("span")
    label.className = "jm-node__label"
    label.textContent = topic.name
    el.appendChild(label)
    return el
  }

  _dot(glyph, progress = 0) {
    const dot = document.createElement("span")
    dot.className = "jm-node__dot"
    dot.setAttribute("aria-hidden", "true")
    if (progress > 0 && progress < 100) {
      const ring = document.createElementNS(SVG_NS, "svg")
      ring.setAttribute("class", "jm-node__ring")
      ring.setAttribute("viewBox", "0 0 36 36")
      const c = document.createElementNS(SVG_NS, "circle")
      c.setAttribute("cx", "18"); c.setAttribute("cy", "18"); c.setAttribute("r", "16")
      c.setAttribute("pathLength", "100")
      c.setAttribute("stroke-dasharray", `${progress} 100`)
      ring.appendChild(c)
      dot.appendChild(ring)
    }
    if (glyph) {
      const svg = document.createElementNS(SVG_NS, "svg")
      svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("viewBox", "0 0 16 16")
      if (glyph === "lock") svg.dataset.lockGlyph = ""
      const path = document.createElementNS(SVG_NS, "path")
      path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor")
      path.setAttribute("stroke-width", "1.6"); path.setAttribute("stroke-linecap", "round")
      path.setAttribute("d", glyph === "lock" ? "M4 7h8v6H4zM6 7V5a2 2 0 0 1 4 0v2" : "M3.5 8.5l3 3 6-7")
      svg.appendChild(path)
      dot.appendChild(svg)
    }
    return dot
  }

  // ── Camera ───────────────────────────────────────────────────────────
  _safe() {
    const vp = this.viewportTarget.getBoundingClientRect()
    const overlays = [...document.querySelectorAll("#journey-topbar, [data-journey-overlay]")].map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left - vp.left, top: r.top - vp.top, width: r.width, height: r.height }
    })
    this.lastSafe = safeRect({ left: 0, top: 0, width: vp.width, height: vp.height }, overlays)
    return this.lastSafe
  }

  _initialCamera(safe) {
    const current = this.layout.nodes.find((n) => n.topic && n.topic.current)
    const moduleBox = current ? this.layout.modules.find((m) => m.id === current.moduleId)?.box : null
    return initialCamera({ moduleBox, node: current || this.nodeById.get("root"), safe,
                           minScale: this.minScale, padding: 24 })
  }

  _apply(animate) {
    const { x, y, k } = this.camera
    this.worldTarget.classList.toggle("jm-world--animate", animate && !this.reduced.matches)
    this.worldTarget.style.transform = `translate(${x}px, ${y}px) scale(${k})`
  }

  _zoomCenter(factor) {
    const s = this._safe()
    this.camera = zoomAbout(this.camera, { x: s.left + s.width / 2, y: s.top + s.height / 2 }, factor, this.zoomRange)
    this._apply(true)
  }

  _onResize() {
    if (!this.lastSafe || !this.camera) return
    const old = this.lastSafe
    const world = { x: (old.left + old.width / 2 - this.camera.x) / this.camera.k,
                    y: (old.top + old.height / 2 - this.camera.y) / this.camera.k }
    this.camera = centerOn(world, this._safe(), this.camera.k)
    this._keepCurrentVisible()
    this._apply(false)
  }

  _keepCurrentVisible() {
    const current = this.layout.nodes.find((n) => n.topic && n.topic.current)
    if (current) this.camera = ensureVisible(this.camera, current, this.lastSafe, 24)
  }

  // ── Events ───────────────────────────────────────────────────────────
  _bind() {
    const vp = this.viewportTarget
    this.pointers = new Map()
    this.onPointerDown = (e) => this._onPointerDown(e)
    this.onPointerMove = (e) => this._onPointerMove(e)
    this.onPointerUp = (e) => this._onPointerUp(e)
    this.onWheel = (e) => this._onWheel(e)
    this.onKeyDown = (e) => this._onKeyDown(e)
    this.onFocusIn = (e) => this._onFocusIn(e)
    this.onClickCapture = (e) => this._onClickCapture(e)
    vp.addEventListener("pointerdown", this.onPointerDown)
    vp.addEventListener("pointermove", this.onPointerMove)
    vp.addEventListener("pointerup", this.onPointerUp)
    vp.addEventListener("pointercancel", this.onPointerUp)
    vp.addEventListener("wheel", this.onWheel, { passive: false })
    vp.addEventListener("keydown", this.onKeyDown)
    vp.addEventListener("focusin", this.onFocusIn)
    vp.addEventListener("click", this.onClickCapture, true)
  }

  _local(e) {
    const r = this.viewportTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  _onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return
    this.pointers.set(e.pointerId, this._local(e))
    this.dragged = false
    this.dragStart = { point: this._local(e), camera: { ...this.camera } }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                     camera: { ...this.camera } }
    }
  }

  _onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return
    const p = this._local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const zoomed = zoomAbout(this.pinch.camera, this.pinch.mid, Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist,
                               this.zoomRange)
      this.camera = { ...zoomed, x: zoomed.x + mid.x - this.pinch.mid.x, y: zoomed.y + mid.y - this.pinch.mid.y }
      this.dragged = true
      this._apply(false)
      return
    }
    const dx = p.x - this.dragStart.point.x
    const dy = p.y - this.dragStart.point.y
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!this.dragged) {
      this.dragged = true
      this.viewportTarget.setPointerCapture(e.pointerId)
    }
    this.camera = { ...this.dragStart.camera, x: this.dragStart.camera.x + dx, y: this.dragStart.camera.y + dy }
    this._apply(false)
  }

  _onPointerUp(e) {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.pinch = null
    if (this.pointers.size === 1) {
      const [remaining] = [...this.pointers.values()]
      this.dragStart = { point: remaining, camera: { ...this.camera } }
    }
  }

  // A drag that began on a node link must not navigate; a plain click still does.
  _onClickCapture(e) {
    if (!this.dragged) return
    e.preventDefault()
    e.stopPropagation()
    this.dragged = false
  }

  _onWheel(e) {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? this.viewportTarget.clientHeight : 1)
    if (e.ctrlKey) {
      this.camera = zoomAbout(this.camera, this._local(e), Math.exp(-e.deltaY * unit * 0.01), this.zoomRange)
    } else {
      // A plain wheel PANS: a page that does not scroll must not trap a mouse user.
      this.camera = { ...this.camera, x: this.camera.x - e.deltaX * unit, y: this.camera.y - e.deltaY * unit }
    }
    this._apply(false)
  }

  _onKeyDown(e) {
    if (e.target !== this.viewportTarget) return
    const pan = (dx, dy) => { this.camera = { ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy }; this._apply(true) }
    switch (e.key) {
      case "ArrowLeft": pan(KEY_PAN, 0); break
      case "ArrowRight": pan(-KEY_PAN, 0); break
      case "ArrowUp": pan(0, KEY_PAN); break
      case "ArrowDown": pan(0, -KEY_PAN); break
      case "+": case "=": this.zoomIn(); break
      case "-": case "_": this.zoomOut(); break
      case "0": this.fit(); break
      default: return
    }
    e.preventDefault()
  }

  // Focus follows the camera: Tab onto a node outside the safe area brings it in.
  _onFocusIn(e) {
    const el = e.target.closest?.(".jm-node")
    const node = el && this.nodeById.get(el.dataset.nodeId)
    if (!node) return
    this.camera = ensureVisible(this.camera, node, this._safe(), 24)
    this._apply(true)
  }
}
```

**Status forms, as implemented.** Spec §4.2's "locked" row describes the **paywall mask**: `.jm-node--masked` is drawn with a dashed outline, the lock glyph (`[data-lock-glyph]`), no title, and is not focusable.

A step in a *readable* module whose own status is `locked` (not yet reached) keeps its title and link and gets the dashed outline **without** the glyph. This is what lets the purchased-module test assert "no lock glyph" for a bought module whose steps are not yet reached. It's flagged for the owner at Checkpoint 3.

- [ ] **Step 7: Run the system test.**

Run: `bin/rails test test/system/journey_map_test.rb`
Expected: PASS.

  If (b) fails on a `.jm-node__tag`, the level token is below 4.5:1 in that theme. Darken it (light) or lighten it (dark) in `application.css`, rebuild, and rerun. The **test sets the value**, never eye.

  If (a) fails at 43 on the phone, raise `rowGap` or `cellGap` in `DEFAULTS` and rerun Task 6's tests too.

- [ ] **Step 8: Run the neighbours.** `bin/rails test test/integration/learning_routes_engine/journey_map_data_test.rb test/controllers/learning_routes_engine/module_lock_authorization_test.rb test/integration/journey_page_test.rb test/integration/landing_redirects_signed_in_students_test.rb`. Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add engines/learning_routes_engine/app/views/learning_routes_engine/routes/journey.html.erb \
        engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb \
        app/javascript/controllers/route_journey_controller.js app/assets/tailwind/application.css \
        config/importmap.rb config/locales/en.yml config/locales/es.yml
git commit -m "feat(journey): the journey is a map — a pannable canvas over the tidy layout

The page no longer scrolls; the camera moves inside a safe area that excludes
the fixed topbar and the overlays. The route title is the root node and the
page's <h1>. Colours are CSS custom properties, so a theme toggle repaints.
LEVEL_COLORS and the stage's colour key go with their last consumer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Screenshots.** Run `SCREENSHOT=1 bin/rails test test/system/journey_map_test.rb`. Expected: PASS, plus five lines `[…] screenshot -> tmp/wp37-journey-{7-light,7-dark,43-light,43-dark,phone}.png`, and four `[wp37] … labels ellipsized` lines. Open each PNG and look at it.

- [ ] **Step 11: CHECKPOINT 3 — STOP.** Report to the owner:
  - the commits of Tasks 8–9;
  - the red summary from Task 8 and the green run;
  - the five screenshots;
  - the four ellipsis lines.

  Do not start Task 10 until the owner says go.

---

### Task 10: One layout module — delete the old one

**Files:**
- Delete: `app/javascript/lib/journey_layout.js`, `test/javascript/journey_layout_test.rb`, `test/system/journey_has_no_overlapping_satellites_test.rb`
- Modify: `config/importmap.rb` (remove `:9-11`: the comment and the `journey_layout` pin)
- Modify: `test/javascript/journey_map_layout_test.rb` (add the guard)

- [ ] **Step 1: Write the failing guard.** Append to `JourneyMapLayoutTest`, before `private`:

```ruby
  # The prompt's test 5: one layout module, not two.
  test "the old satellite layout is gone" do
    refute File.exist?(Rails.root.join("app/javascript/lib/journey_layout.js")),
      "journey_layout.js still exists beside journey_map_layout.js"
    refute_match(/pin "journey_layout"/, Rails.root.join("config/importmap.rb").read)
  end
```

- [ ] **Step 2: Run it and confirm it fails.** `bin/rails test test/javascript/journey_map_layout_test.rb -n "/old satellite layout/"`. Expected: FAIL, "journey_layout.js still exists".

- [ ] **Step 3: Delete.**

```bash
git rm app/javascript/lib/journey_layout.js test/javascript/journey_layout_test.rb \
       test/system/journey_has_no_overlapping_satellites_test.rb
```

Remove the three lines at `config/importmap.rb:9-11` (the two-line comment and `pin "journey_layout", to: "lib/journey_layout.js"`). Then `grep -rn "journey_layout\b\|layoutStage\|data-sat-idx" app engines test config`. Expected: no output.

- [ ] **Step 4: Run it again.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add config/importmap.rb test/javascript/journey_map_layout_test.rb
git commit -m "chore(journey): one layout module — delete the satellite layout and its tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verification and handoff

**Files:**
- Create: `WP37_HANDOFF.md`

- [ ] **Step 1: RuboCop.** `bundle exec rubocop`. Expected: `no offenses detected`.

- [ ] **Step 2: Three suites, three runs each, one at a time, from a clean tree** (`git status --short` empty):

```bash
for i in 1 2 3; do bin/rails test 2>&1 | tail -1; done
for i in 1 2 3; do bin/rails test engines/*/test 2>&1 | tail -1; done
for i in 1 2 3; do bin/rails test:system 2>&1 | tail -1; done
```

Expected: the app and system suites have 0 failures and 0 errors in all three runs. The engine suite shows only the four known `ci-engine-tests` failures (route generator, route-generation job, gap-analysis job, reinforcement job), identical in all three runs.

- [ ] **Step 3: Browser pass against dev.**
  1. **Restart** `bin/dev` (engine views don't hot-reload; the Tailwind watcher must be running).
  2. Check the seeded route and a 43 fixture, in both themes, with reduced motion on and off (DevTools → Rendering → `prefers-reduced-motion`).
  3. Check pan, wheel, pinch (trackpad), the + / − / Fit buttons, a rail click, and Tab.
  4. Check the phone size (DevTools device toolbar, 390 × 844).

  Note anything the tests did not catch.

- [ ] **Step 4: Write `WP37_HANDOFF.md`**, with these sections, filled from runs you made:
  1. **§0:**
     - the owner's `wp29:census` and `wp29:cleanup` outputs from 21 September (36 → 13 reinforcement; 20 steps);
     - `wp37:reinforcement_parents` as the **owner's post-deploy step**: `bin/kamal app exec -r job 'bin/rails wp37:reinforcement_parents'`. Its numbers belong to that run, not to this handoff.
  2. **The legibility triple, together:** `labelWidth` 168 px, label font 13 px (≥ 12 px on screen at initial zoom), and the measured ellipsis counts at 7 and 43 from Task 9 Step 10. Also give today's satellite label size from Task 8 Step 2 for comparison.
  3. **Suites:** all nine lines from Step 2; RuboCop.
  4. **Screenshots:** the five PNGs, by path.
  5. **What changed for a buyer:** a purchased module is readable on the journey and the list (Task 2).
  6. **Not done:** anything from Step 3, and the spec's "not in this package" list.
  7. **Merge context:**
     - branched off `main` at `5e07c80f`;
     - `ci-engine-tests` is still unmerged, so the engine suite shows the same four failures until it lands;
     - `.github/workflows/deploy.yml` deploys on green CI on `main`;
     - acceptance is the owner's, in production, with his own screenshot at 7 primary steps (the real route of 20) answering *does it read as a map?*

- [ ] **Step 5: Commit the handoff.**

```bash
git add WP37_HANDOFF.md
git commit -m "docs(wp37): handoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Request the code review** (superpowers:requesting-code-review) over `main..wp37-journey-map`, then stop. Nothing is pushed.
