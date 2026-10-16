require "test_helper"
require "support/route_purchase_helpers"

# WP-37 §1. The journey's JSON is what the map draws, so its shape is asserted
# here, against the server, before any pixel exists.
class LearningRoutesEngine::JourneyMapDataTest < ActionDispatch::IntegrationTest
  include RoutePurchaseHelpers

  def setup
    # The UI locale is current_user.locale (core/application_controller.rb:54-60);
    # the fixture user is Spanish, so the assertions below are Spanish.
    @user = create_test_user(email_verified_at: Time.current, locale: "es")
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Map", locale: "es", status: :active, current_step: 1
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
    # The EXACT masked shape: any key added to the locked branch later is a
    # potential leak and must be decided here, not slip through.
    masked = {
      "content_type" => nil, "current" => false, "name" => "Bloqueado", "parent_id" => nil,
      "path" => nil, "progress" => 0, "reinforcement" => false, "status" => "locked"
    }
    stage["topics"].each { |topic| assert_equal masked, topic.except("id") }
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

  test "the journey header counts the purchased module's steps" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.journey_route_path(@route)

    # WP-37b: the count lives in the root's meta line ("2 módulos · 2 temas").
    assert_select ".jm-root__meta", text: /· 2 temas\z/, message: "@steps must come from the policy, not from access_preview?"
  end

  # STEP 38 §2: the header read "Camino personalizado · 3 etapas · 3 temas ·
  # Camino personalizado · 8 etapas · nivel beginner · …" — its own sentence
  # wrapped around a fallback route's subject_area sentence, two counts that
  # disagreed. One sentence, counted from what the map draws.
  test "the root's meta line is one sentence, counted from the map's modules and topics" do
    @route.update!(
      subject_area: "Camino personalizado · 8 etapas · nivel beginner",
      translations: { "es" => { "title" => "Map", "subject_area" => "Camino personalizado · 8 etapas · nivel beginner" } }
    )
    step!(@preview, 0, "Free lesson")
    step!(@preview, 1, "Second lesson")
    step!(@paid, 10, "Paid lesson")

    stages = journey_stages
    drawn_topics = stages.sum { |stage| stage["topics"].size }
    header = css_select(".jm-root__meta").first.text.squish

    assert_equal "#{stages.size} módulos · #{drawn_topics} temas", header
    assert_equal "2 módulos · 3 temas", header
  end

  test "the root's meta line counts in the singular" do
    @paid.destroy!
    step!(@preview, 0, "Only lesson")

    journey_stages

    assert_equal "1 módulo · 1 tema",
                 css_select(".jm-root__meta").first.text.squish
  end

  test "the list view lists a purchased module's steps without the lock" do
    step!(@preview, 0, "Free lesson")
    step!(@paid, 10, "Paid lesson")
    pay_for_route!(@route)

    get learning_routes_engine.route_path(@route)

    assert_response :success
    assert_includes response.body, "Paid lesson"
    assert_select "section[data-module-access='locked'] span[aria-label]", count: 0
    assert_select "section[data-module-access='locked']", text: /Comprado/
  end

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
    assert topics[orphan.id].key?("parent_id"), "parent_id must be emitted, nil for an orphan"
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

  # The step at current_step is one the fallback would NEVER pick (completed, after
  # an available step), so this fails if the position rule is dropped.
  test "exactly one topic is current: the step at route.current_step" do
    step!(@preview, 0, "Open earlier")
    at_current = step!(@preview, 1, "Just finished", status: :completed)
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

    topics = all_topics
    assert topics.all? { |t| t.key?("current") }, "every topic says whether it is current"
    assert_equal [], topics.select { |t| t["current"] }
  end

  test "fallback: an in_progress step beats an earlier available one" do
    @route.update!(current_step: 10)
    step!(@preview, 0, "Open", status: :available)
    started = step!(@preview, 1, "Started", status: :in_progress)
    step!(@paid, 10, "Behind the paywall")

    assert_equal [started.id], all_topics.select { |t| t["current"] }.map { |t| t["id"] }
  end

  test "fallback: the last readable step when none is in progress or available" do
    @route.update!(current_step: 10)
    step!(@preview, 0, "Done", status: :completed)
    last = step!(@preview, 1, "Done too", status: :completed)
    step!(@paid, 10, "Behind the paywall")

    assert_equal [last.id], all_topics.select { |t| t["current"] }.map { |t| t["id"] }
  end

  # Production's 7 + 13 shape: legacy triplets (no stored id) behind DIFFERENT
  # primary steps of one module each resolve to their own nearest primary.
  test "two legacy triplets under two primary steps resolve to two parents" do
    first = step!(@preview, 0, "First")
    first_triplet = (1..3).map { |pos| step!(@preview, pos, "R1-#{pos}", metadata: { "reinforcement" => true }) }
    second = step!(@preview, 4, "Second")
    second_triplet = (5..7).map { |pos| step!(@preview, pos, "R2-#{pos}", metadata: { "reinforcement" => true }) }

    topics = preview_topics
    first_triplet.each { |c| assert_equal first.id, topics[c.id]["parent_id"] }
    second_triplet.each { |c| assert_equal second.id, topics[c.id]["parent_id"] }
  end

  # A failed re-assessment inside a triplet stores a REINFORCEMENT step's id.
  test "a stored id naming a reinforcement step falls back to position" do
    primary = step!(@preview, 0, "Primary")
    reinforcement = step!(@preview, 1, "Reinforcement", metadata: { "reinforcement" => true })
    nested = step!(@preview, 2, "Nested",
                   metadata: { "reinforcement" => true, "triggering_step_id" => reinforcement.id })

    assert_equal primary.id, preview_topics[nested.id]["parent_id"]
  end

  # "No new queries": the journey's query count does not grow with the route.
  test "the journey makes the same number of queries at 7 steps and at 43" do
    seven = route_with_steps(primaries: 7)
    forty_three = route_with_steps(primaries: 7, reinforcement_after_third: 36)
    # Warm per-process caches on a THIRD route: a repeat request for the same
    # route is served from per-route caches with almost no SQL, so both measured
    # requests must be first requests.
    get learning_routes_engine.journey_route_path(route_with_steps(primaries: 1))

    baseline = journey_query_count(seven)
    assert_queries_count(baseline) { get learning_routes_engine.journey_route_path(forty_three) }
    assert_response :success
  end

  # ─── root ──────────────────────────────────────────────────────────

  test "the route root is its own value" do
    step!(@preview, 0, "First")
    get learning_routes_engine.journey_route_path(@route)

    node = css_select("[data-controller='route-journey']").first
    assert_equal({ "title" => "Map" }, JSON.parse(node["data-route-journey-root-value"]))
  end

  # ─── WP-37b brief §4.4 and §5.2: short names and minutes ─────────────

  # A reinforcement's label on the map drops the "Refuerzo:" prefix; `name`
  # keeps the full title for aria and the popover.
  %w[es en].each do |locale|
    %w[review practice reassessment].each do |kind|
      test "a #{kind} reinforcement in #{locale} gets its short name, without the prefix" do
        @user.update!(locale: locale)
        primary = step!(@preview, 0, "Primary")
        title = I18n.t("learning_engine.reinforcement.#{kind}.title", locale: locale)
        reinforcement = step!(@preview, 1, title, metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })

        topic = all_topics.find { |t| t["id"] == reinforcement.id }
        prefix = I18n.t("learning_engine.journey.status_reinforcement", locale: locale)
        assert_equal I18n.t("learning_engine.reinforcement.#{kind}.short", locale: locale), topic["short_name"]
        assert_not topic["short_name"].start_with?(prefix), "#{topic["short_name"].inspect} still carries #{prefix.inspect}"
        assert_equal title, topic["name"], "name stays the full title"
      end
    end
  end

  test "a reinforcement in the route's language on a page in the other language still gets a short name" do
    @user.update!(locale: "en")
    primary = step!(@preview, 0, "Primary")
    title = I18n.t("learning_engine.reinforcement.practice.title", locale: :es)
    reinforcement = step!(@preview, 1, title, metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })

    topic = all_topics.find { |t| t["id"] == reinforcement.id }
    assert_equal I18n.t("learning_engine.reinforcement.practice.short", locale: :en), topic["short_name"]
  end

  test "a reinforcement with its own title drops only the leading prefix" do
    primary = step!(@preview, 0, "Primary")
    reinforcement = step!(@preview, 1, "Refuerzo: los verbos irregulares",
                          metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })
    plain = step!(@preview, 2, "Sin prefijo", metadata: { "reinforcement" => true, "triggering_step_id" => primary.id })

    topics = all_topics.index_by { |t| t["id"] }
    assert_equal "los verbos irregulares", topics[reinforcement.id]["short_name"]
    assert_equal "Sin prefijo", topics[plain.id]["short_name"]
  end

  test "a primary step has no short name" do
    primary = step!(@preview, 0, "Primary")

    assert_not all_topics.find { |t| t["id"] == primary.id }.key?("short_name")
  end

  test "minutes come from estimated_minutes and are omitted when nil" do
    timed = step!(@preview, 0, "Timed")
    timed.update_column(:estimated_minutes, 11)
    untimed = step!(@preview, 1, "Untimed")
    untimed.update_column(:estimated_minutes, nil)

    topics = all_topics.index_by { |t| t["id"] }
    assert_equal 11, topics[timed.id]["minutes"]
    assert_not topics[untimed.id].key?("minutes")
  end

  private

  def all_topics = journey_stages.flat_map { |s| s["topics"] }

  def route_with_steps(primaries:, reinforcement_after_third: 0)
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Count", locale: "es", status: :active, current_step: 0
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    position = 0
    primaries.times do |i|
      route.route_steps.create!(route_module: preview, position: position, title: "P#{i}", status: :available,
                                content_type: :lesson, level: :nv1, bloom_level: 1)
      position += 1
      next unless i == 2

      reinforcement_after_third.times do |j|
        route.route_steps.create!(route_module: preview, position: position, title: "R#{j}", status: :locked,
                                  content_type: :lesson, level: :nv1, bloom_level: 1,
                                  metadata: { "reinforcement" => true })
        position += 1
      end
    end
    route
  end

  # The same counter assert_queries_count uses, so the two numbers compare.
  def journey_query_count(route)
    ActiveRecord::Base.lease_connection.materialize_transactions
    counter = ActiveRecord::Assertions::QueryAssertions::SQLCounter.new
    ActiveSupport::Notifications.subscribed(counter, "sql.active_record") do
      get learning_routes_engine.journey_route_path(route)
    end
    assert_response :success
    counter.log.size
  end

  def preview_topics
    journey_stages.find { |s| s["module_id"] == @preview.id }["topics"].index_by { |t| t["id"] }
  end

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

  def pay_for_route!(route) = purchase_route!(route, user: @user)
end
