require "application_system_test_case"

# WP-35 §4, measured in a real browser rather than in the geometry module.
#
# `JourneyLayoutTest` proves the maths; this proves the maths reaches the page.
# The owner's screenshot is forty-three overlapping circles in one ring around
# "Fundamentos", labels stacked into a knot — 43 is what production has in one
# module today, and ~7 is what it will have after the WP-29 reinforcement
# cleanup. Both must be right; only one of them is a screenshot.
class JourneyHasNoOverlappingSatellitesTest < ApplicationSystemTestCase
  def setup
    @user = Core::User.create!(
      name: "Journey", email: "journey-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
  end

  test "a 43-step module draws no two satellites that overlap" do
    route = build_route_with(43)
    visit_journey(route)

    boxes = satellite_boxes
    assert_equal 43, boxes.size, "every step must be drawn"
    assert_nil first_overlap(boxes), "two satellites overlap on screen: #{first_overlap(boxes).inspect}"
  end

  test "a 7-step module draws no two satellites that overlap" do
    route = build_route_with(7)
    visit_journey(route)

    boxes = satellite_boxes
    assert_equal 7, boxes.size
    assert_nil first_overlap(boxes)
  end

  test "every satellite is inside its stage box" do
    route = build_route_with(43)
    visit_journey(route)

    escaped = page.evaluate_script(<<~JS)
      (() => {
        const stage = document.querySelector("[data-route-journey-target='stageSvg']")
        const s = stage.getBoundingClientRect()
        return [...stage.querySelectorAll("[data-sat-idx]")].filter((el) => {
          const b = el.getBoundingClientRect()
          return b.left < s.left - 1 || b.right > s.right + 1 || b.top < s.top - 1 || b.bottom > s.bottom + 1
        }).length
      })()
    JS

    assert_equal 0, escaped, "satellites are drawn outside the stage that contains them"
  end

  test "every satellite carries its full title and is focusable in route order" do
    route = build_route_with(8)
    visit_journey(route)

    labels = page.evaluate_script(<<~JS)
      [...document.querySelectorAll("[data-sat-idx]")].map((el) => ({
        aria: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        tabindex: el.getAttribute("tabindex")
      }))
    JS

    assert_equal 8, labels.size
    labels.each_with_index do |label, i|
      assert_equal "Paso #{i}", label["aria"], "the aria-label must carry the FULL title"
      assert_equal "Paso #{i}", label["title"]
      assert_equal "0", label["tabindex"], "every satellite must be a tab stop"
    end
  end

  # Stages are MODULES now. A route has exactly one preview module and the rest
  # are locked, so this also pins that locked modules become stages — otherwise
  # "stages are modules" would mean "one stage".
  test "a locked module is its own stage and does not leak its step titles" do
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(learning_route_id: route.id, access_state: :preview)
    locked = LearningRoutesEngine::RouteModule.create!(
      learning_route: route, title: "Módulo de pago", position: 2, access_state: :locked
    )
    3.times do |i|
      route.route_steps.create!(route_module: preview, title: "Gratis #{i}", position: i,
                               status: :available, content_type: :lesson, level: :nv1, bloom_level: 1)
    end
    3.times do |i|
      route.route_steps.create!(route_module: locked, title: "SECRETO #{i}", position: 10 + i,
                               status: :locked, content_type: :lesson, level: :nv1, bloom_level: 1)
    end

    visit_journey(route)

    assert_selector "[data-route-journey-target='stageSvg']", count: 2, visible: :all
    refute_match(/SECRETO/, page.text,
      "a locked module leaked the titles the student has not bought")
    assert_nil first_overlap(satellite_boxes)
  end

  private

  def build_route_with(step_count)
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: route.id, access_state: :preview
    )
    step_count.times do |i|
      route.route_steps.create!(
        route_module: preview, title: "Paso #{i}", position: i, status: :available,
        content_type: :lesson, level: :nv1, bloom_level: 1
      )
    end
    route
  end

  def visit_journey(route)
    sign_in_through_ui
    visit learning_routes_engine.journey_route_path(route)
    assert_selector "[data-sat-idx]", minimum: 1, wait: 10
  end

  def satellite_boxes
    page.evaluate_script(<<~JS)
      [...document.querySelectorAll("[data-sat-idx]")].map((el) => {
        const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
      })
    JS
  end

  # Real measured rectangles, not the model's own numbers.
  def first_overlap(boxes)
    boxes.each_with_index do |a, i|
      boxes.each_with_index do |b, j|
        next if j <= i

        overlaps = a["left"] < b["right"] - 1 && b["left"] < a["right"] - 1 &&
                   a["top"] < b["bottom"] - 1 && b["top"] < a["bottom"] - 1
        return [i, j, a, b] if overlaps
      end
    end
    nil
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end
end
