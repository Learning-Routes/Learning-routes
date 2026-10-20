require "application_system_test_case"
require "support/route_purchase_helpers"

# WP-37 §4.3. Measured, not trusted: what the student SEES at first paint —
# pixels, contrast, legible text, nothing under an overlay — at 7 and 43, in both
# themes, on a desktop and on a phone.
#
# `SCREENSHOT=1 bin/rails test test/system/journey_map_test.rb` writes the
# WP-37b renders (7, 7+13 and 43 × light/dark × 1440/390) to tmp/wp37b/renders/.
#
# WP-37b (brief §6) adds the drawn map's own checks: no line crosses a label,
# one path per module route, contrast of the chrome, the Continue card, the
# popover, LOD, the two camera openings and the entrance.
class JourneyMapTest < ApplicationSystemTestCase
  include RoutePurchaseHelpers

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

  # Production's reinforcement titles are these three locale strings, never a
  # primary step's 40–70 characters; the route is in Spanish.
  REINFORCEMENT_TITLES = %w[review practice reassessment].map do |kind|
    I18n.t("learning_engine.reinforcement.#{kind}.title", locale: :es)
  end.freeze

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
    page.driver.browser.execute_cdp("Emulation.clearDeviceMetricsOverride")
    page.current_window.resize_to(1440, 1000)
  end

  # ── (a)(b)(c) + no page scroll, both themes, 7 and 43 ─────────────────
  [7, 43].each do |size|
    %w[light dark].each do |theme|
      test "#{size} steps, #{theme}: labels legible and apart, current step clear of the overlays" do
        route = build_route(size)
        open_journey(route, theme: theme, reduced_motion: size == 43)

        labels = measure_labels
        topics = route.route_steps.count # every step, readable or masked, has exactly one node label
        drawn = page.evaluate_script("document.querySelectorAll('.jm-node--step .jm-node__label, .jm-node--reinforcement .jm-node__label').length")
        assert_equal topics, drawn, "every step must carry exactly one label"
        assert_nil first_overlap(label_boxes(labels)), "two labels overlap on screen"
        labels.each do |l|
          assert_operator l["px"], :>=, MIN_LABEL_PX - 0.01, "#{l['text'].inspect} renders at #{l['px']}px"
          assert_operator l["contrast"], :>=, MIN_CONTRAST,
            "#{l['text'].inspect} (#{l['cls']}) measures #{format('%.2f', l['contrast'])}:1 on #{theme}"
        end
        # WP-37b: no box behind a label, a cartographic halo instead — and no
        # drawn line ever passes through one (brief §6.1).
        assert_equal 0, page.evaluate_script(<<~JS), "a label lost its halo"
          [...document.querySelectorAll(".jm-node__label")].filter((el) => getComputedStyle(el).textShadow === "none").length
        JS
        assert_empty lines_through_labels
        assert_one_path_per_route
        assert_chrome_contrast(theme)
        assert_current_clear(route)
        assert_no_page_scroll
        report_ellipsis(size, theme, labels)
      end
    end
  end

  # ── Phone ─────────────────────────────────────────────────────────────
  [7, 43].each do |size|
    test "#{size} steps on a phone: legible, apart, current step clear of every overlay" do
      viewport(390, 844)
      route = build_route(size)
      open_journey(route)

      labels = measure_labels
      assert_nil first_overlap(label_boxes(labels))
      labels.each do |l|
        assert_operator l["px"], :>=, MIN_LABEL_PX - 0.01
        assert_operator l["contrast"], :>=, MIN_CONTRAST
      end
      assert_empty lines_through_labels
      assert_current_clear(route)
      assert_no_page_scroll
    end
  end

  # ── Direction cue: the route position inside every step not yet done ──
  [7, 43].each do |size|
    %w[light dark].each do |theme|
      test "#{size} steps, #{theme}: each step not done shows its place among its module's primary steps" do
        route = build_route(size)
        open_journey(route, theme: theme)

        assert_equal expected_numbers(route), drawn_numbers
        numbers = measure_text(".jm-node__num")
        refute_empty numbers
        numbers.each do |n|
          assert_operator n["px"], :>=, MIN_LABEL_PX - 0.01, "number #{n['text']} renders at #{n['px']}px"
          assert_operator n["contrast"], :>=, MIN_CONTRAST,
            "number #{n['text']} measures #{format('%.2f', n['contrast'])}:1 on #{theme}"
        end
      end
    end
  end

  test "a purchased module counts its own primary steps from 1" do
    route = build_route(7)
    pay_for_route!(route)
    open_journey(route)

    first_bought = route.route_modules.find_by!(title: "Módulo avanzado").route_steps.order(:position).first
    assert_equal "1", drawn_numbers["s:#{first_bought.id}"]
    assert_equal expected_numbers(route), drawn_numbers
  end

  # The current step can be one already done: the preview finished, the next
  # step behind the paywall. It is drawn done — check, no number — and says so.
  test "a finished free preview draws its last step as done, not as one still to do" do
    route = build_route(7, all_done: true)
    open_journey(route)

    last = LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).where.not(position: 100..).order(:position).last
    current = find(".jm-node--current")
    assert_equal "s:#{last.id}", current["data-node-id"]
    assert_includes current[:class].split, "jm-node--completed"
    assert current.has_css?(".jm-node__dot svg path", visible: :all), "the done step lost its check"
    assert_empty drawn_numbers
    aria = current["aria-label"]
    assert_includes aria, I18n.t("learning_engine.journey.completed", locale: :es)
    refute_includes aria, I18n.t("learning_engine.journey.status_current", locale: :es)
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
    # The MAP's animations: the layout's own body colour transition belongs to
    # the theme switch, not to the map's first paint.
    assert_equal 0, page.evaluate_script("document.querySelector('.jm').getAnimations({ subtree: true }).length")
    assert_equal first, node_boxes
  end

  # ── Review Focus 2: titles are text ───────────────────────────────────
  # STEP 39 PR 2: a title with markup is plain text — tags stripped, never
  # rendered as markup and never shown as escaped "<b>" either.
  test "markup in a title shows as plain text, on the map and in the Continue card" do
    route = build_route(7)
    open_journey(route)
    # Chips use <b> for their numbers; a title is never markup.
    assert_equal 0, page.evaluate_script("document.querySelectorAll('.jm-node__label b, .jm-root__title b, .jm-pop b:not(:first-child)').length")
    text = page.evaluate_script("document.querySelector('.jm-nodes').textContent + document.querySelector('.jm-card').textContent")
    assert_includes text, "Comparar ser y"
    assert_not_includes text, "<b>"
  end

  # ── Interactions (reduced motion: no transition to wait for) ──────────
  # STEP 38 §4: "Encajar" returns to the opening view — fitted, the current step centred.
  test "Encajar returns to the opening view: fitted, the current step centred" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    opening = matrix
    drag_by(0, -1500)
    assert_operator (matrix["f"] - opening["f"]).abs, :>, 100, "the drag did not move the map"
    find("[data-action~='route-journey#fit']").click
    opening.each { |key, value| assert_in_delta value, matrix[key], 0.5, "Encajar did not return to the opening #{key}" }
    assert_clear box_of(page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId"))
  end

  # WP-37b §4.1: the rail is gone; a module's chip (and its disc) jump to it.
  test "a module chip brings that module into view" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    assert_no_selector ".jm-rail"
    locked = route.route_modules.find_by!(access_state: :locked)
    chip = ".jm-chip[data-module-node-id='m:#{locked.id}']"
    # The camera is on a leash (STEP 38 §4): drag the chip on screen first.
    vp = rect_of(".jm-viewport")
    drag_by(0, -(rect_of(chip)["top"] - (vp["top"] + vp["bottom"]) / 2))
    find(chip).click
    assert_clear box_of("m:#{locked.id}")
  end

  # Inside the leash: the 43-step route is taller than the screen, so a vertical
  # drag moves it by exactly the dragged distance.
  test "a pointer drag pans by the dragged distance; a drag from a node does not navigate" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    before = translate
    x, y = empty_point
    page.driver.browser.action.move_to_location(x, y).click_and_hold.move_by(0, -80).release.perform
    after = translate
    assert_in_delta before[1] - 80, after[1], 1

    # Turbo changes the URL only after its fetch returns, so comparing the URL
    # right after the gesture proves nothing. Count visits STARTED instead, and
    # give any late navigation time to surface.
    page.execute_script("window.__visits = 0; document.addEventListener('turbo:before-visit', () => window.__visits++)")
    node = find(".jm-node--current").native
    page.driver.browser.action.move_to(node).click_and_hold.move_by(60, 0).release.perform
    sleep 0.5
    assert_equal 0, page.evaluate_script("window.__visits"), "a drag that starts on a node started a visit"
    assert_no_current_path %r{/steps/}
  end

  test "a plain click on a node still navigates" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    find(".jm-node--current").click
    assert_current_path %r{/steps/}
  end

  # STEP 38 §4, the leash: "a drag of 10,000 px leaves the map within bounds".
  test "a drag of 10,000 px leaves the map within bounds" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    [[10_000, 0], [-10_000, 0], [0, 10_000], [0, -10_000]].each do |dx, dy|
      drag_by(dx, dy)
      nodes = node_boxes
      vp = rect_of(".jm-viewport")
      assert nodes.any? { |b| b["left"] < vp["right"] && b["right"] > vp["left"] && b["top"] < vp["bottom"] && b["bottom"] > vp["top"] },
             "after a drag of #{dx},#{dy} no step is on screen"
      held = matrix
      drag_by(dx, dy)
      assert_in_delta held["e"], matrix["e"], 0.5, "a second drag of #{dx},#{dy} moved the map past its bound"
      assert_in_delta held["f"], matrix["f"], 0.5, "a second drag of #{dx},#{dy} moved the map past its bound"
    end
  end

  # Review finding: past the bound, reversing the same drag moves the map at once,
  # not only after coming back the whole distance dragged beyond it.
  test "reversing a drag that went past the bound moves the map at once" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    x, y = empty_point
    at_bound = nil
    drag_path([[x, y], [x, y + 3000]]) { at_bound = matrix["f"] }
    drag_path([[x, y + 3000], [x, y + 2800]], press: false)
    assert_in_delta at_bound - 200, matrix["f"], 1, "the map waited for the pointer to come back 3,000 px"
  end

  # STEP 38 §4: "wheel without a modifier does not change the camera".
  test "wheel without a modifier does not change the camera" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    before = matrix
    origin = Selenium::WebDriver::WheelActions::ScrollOrigin.element(find(".jm-viewport").native)
    page.driver.browser.action.scroll_from(origin, 0, 400).perform
    page.driver.browser.action.scroll_from(origin, 300, 0).perform
    sleep 0.1
    assert_equal before, matrix
  end

  test "Ctrl + wheel zooms, never past twice the fitted scale nor below it" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    fitted = matrix["a"]
    ctrl_wheel(-5000)
    assert_in_delta 2 * fitted, matrix["a"], 1e-3
    ctrl_wheel(5000)
    assert_in_delta fitted, matrix["a"], 1e-3
  end

  # §3.3: a resize keeps the camera's centre. Once the student has moved the
  # map, the current step does not pull the camera back to it.
  test "a resize after panning away keeps the view and does not jump back to the current step" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    drag_by(0, -1500)
    current_id = page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId")
    assert_operator box_of(current_id)["bottom"], :<, 0, "the drag should have panned the current step off the top"
    before = translate

    page.current_window.resize_to(1200, 900)
    sleep 0.5
    assert_operator box_of(current_id)["bottom"], :<, 0, "the resize pulled the camera back to the current step"
    after = translate
    assert_operator (after[1] - before[1]).abs, :<, 100, "the resize moved the view by #{after[1] - before[1]}px"
  end

  test "Tab onto an off-screen node brings it into view" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    last_id = page.evaluate_script("[...document.querySelectorAll('a.jm-node')].pop().dataset.nodeId")
    page.execute_script("document.querySelector(`[data-node-id='#{last_id}']`).focus()")
    assert_clear box_of(last_id)
  end

  # Turbo restores a cached copy of the page on Back; connecting again must not
  # draw the map a second time.
  test "going Back to the map draws it once" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    nodes = page.evaluate_script("document.querySelectorAll('.jm-node').length")
    edges = page.evaluate_script("document.querySelectorAll('.jm-edges path').length")
    find(".jm-node--current").click
    assert_current_path %r{/steps/}
    page.go_back
    # The cached snapshot already carries data-journey-ready, so it cannot tell
    # us Stimulus reconnected; give the reconnect time before counting.
    assert_selector "[data-journey-ready='true']", wait: 10
    sleep 0.5
    assert_equal nodes, page.evaluate_script("document.querySelectorAll('.jm-node').length")
    assert_equal edges, page.evaluate_script("document.querySelectorAll('.jm-edges path').length")
  end

  # A phone rotates: Encajar fits the viewport it has NOW, legible, the current step clear.
  test "after a resize, Encajar fits the viewport it has now" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    viewport(390, 844)
    sleep 0.3
    find("[data-action~='route-journey#fit']").click
    assert_in_delta 12 / 13.0, matrix["a"], 1e-3, "the phone opens at the legible floor"
    current = page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId")
    assert_clear box_of(current)
  end

  # Ctrl/Cmd with = - 0 is the BROWSER's page zoom; the map must not take it.
  test "modifier keys are left to the browser" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    page.execute_script("document.querySelector('.jm-viewport').focus()")
    before = matrix
    page.driver.browser.action.key_down(:control).send_keys("0").key_up(:control).perform
    page.driver.browser.action.key_down(:alt).send_keys(:arrow_left).key_up(:alt).perform
    assert_equal before, matrix, "a modified key moved the map"
  end

  # ── Review Focus 4: resize after load ─────────────────────────────────
  test "after the window resizes, the current step is still clear of the overlays" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    viewport(390, 844)
    sleep 0.3
    assert_current_clear(route)
  end

  # ── WP-37b §4.1: one title, no rail, the legend, the counter ──────────
  test "the page has one title, the counter and the legend; the legend leaves under 700 px" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)

    assert_selector "h1", count: 1
    assert_selector ".jm-root .jm-root__title", text: "Portugués para viajar"
    assert_no_selector "#journey-topbar", text: "Portugués para viajar"
    assert_no_selector ".jm-subtitle"
    assert_selector "#journey-topbar .jm-counter__text", text: "2 de 9 · 22 %"
    assert_selector ".jm-legend", visible: true

    viewport(390, 844)
    assert_selector ".jm-legend", visible: :hidden
  end

  # ── WP-37b §6.1/6.2 on the production shape ───────────────────────────
  %w[light dark].each do |theme|
    test "7+13, #{theme}: no line through a label, one path per route, contrast held" do
      route = build_route(:production)
      open_journey(route, theme: theme, reduced_motion: true)

      assert_empty lines_through_labels
      assert_one_path_per_route
      assert_chrome_contrast(theme)
      labels = measure_labels
      assert_nil first_overlap(label_boxes(labels))
      report_ellipsis("7+13", theme, labels)
    end
  end

  # ── WP-37b §5.1: the Continue card ────────────────────────────────────
  [7, 43].each do |size|
    test "#{size} steps: Continue goes to the current step and the card is an overlay the camera avoids" do
      route = build_route(size)
      open_journey(route, reduced_motion: true)

      current = route.route_steps.find_by!(position: route.current_step)
      cta = find(".jm-card [data-journey-continue]")
      assert_equal learning_routes_engine.route_step_path(route, current), URI(cta[:href]).path
      assert_selector ".jm-card[data-journey-overlay]"
      assert_selector ".jm-card__eyebrow", text: "Sigues en · Vista previa gratuita · paso 3 de 7"
      assert_current_clear(route)
    end
  end

  test "a finished route says so and Continue goes to the list" do
    route = build_route(7, all_done: true)
    open_journey(route, reduced_motion: true)

    assert_selector ".jm-card__title", text: I18n.t("learning_engine.journey.route_completed", locale: :es)
    assert_equal learning_routes_engine.route_path(route), URI(find(".jm-card [data-journey-continue]")[:href]).path
  end

  test "with nothing readable there is no Continue card" do
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Sin vista previa", locale: "es", status: :active, current_step: 100
    )
    locked = route.route_modules.create!(position: 2, title: "Módulo", access_state: :locked, generation_state: :ready)
    route.route_steps.create!(route_module: locked, title: "SECRETO", position: 100, status: :locked,
                              content_type: :lesson, level: :nv1, bloom_level: 1)
    open_journey(route, reduced_motion: true)

    assert_no_selector ".jm-card"
    assert_selector ".jm-node--masked", count: 1
  end

  test "the I key and the locate button bring the current step back" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    current_id = page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId")
    drag_by(0, -1500)
    assert_operator box_of(current_id)["bottom"], :<, 0

    page.execute_script("document.querySelector('.jm-viewport').focus()")
    page.driver.browser.action.send_keys("i").perform
    assert_clear box_of(current_id)

    drag_by(0, -1500)
    find(".jm-card .jm-iconbtn").click
    assert_clear box_of(current_id)
  end

  # ── WP-37b §5.2: the popover ──────────────────────────────────────────
  test "focus on step 4 opens the popover with the full title and its action; Escape closes it" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    step4 = route.route_steps.find_by!(position: 3)

    page.execute_script("document.querySelector(`[data-node-id='s:#{step4.id}']`).focus()")
    assert_selector ".jm-pop.jm-pop--show[aria-hidden='false']"
    assert_selector ".jm-pop__title", text: TITLES[3]
    assert_selector ".jm-pop__eyebrow", text: "Vista previa gratuita · paso 4 de 7"
    assert_selector ".jm-pop__act", text: I18n.t("learning_engine.journey.act_locked", locale: :es)
    # A step not yet reachable is "still ahead", never "available" (browser pass).
    assert_selector ".jm-pop__meta", text: /\A#{I18n.t("learning_engine.journey.legend_ahead", locale: :es)} · 11 min\z/
    assert_equal "jm-pop", find("[data-node-id='s:#{step4.id}']")["aria-describedby"]
    assert_popover_contrast

    page.driver.browser.action.send_keys(:escape).perform
    assert_selector ".jm-pop[aria-hidden='true']", visible: :all
    assert_no_selector ".jm-pop.jm-pop--show", visible: :all
  end

  test "hover opens the popover; a drag closes it; the module node has none" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)

    node = find(".jm-node--current")
    page.driver.browser.action.move_to(node.native).perform
    assert_selector ".jm-pop.jm-pop--show"
    assert_selector ".jm-pop__act", text: I18n.t("learning_engine.journey.act_continue", locale: :es)
    # A drag that starts ON the node and stays over it: only the drag can close it.
    page.driver.browser.action.click_and_hold(node.native).move_by(10, 0).perform
    assert_equal false, page.evaluate_script("document.querySelector('.jm-pop').classList.contains('jm-pop--show')"),
      "the drag did not close the popover"
    page.driver.browser.action.release.perform

    page.driver.browser.action.move_to(find(".jm-node--module", match: :first).native).perform
    sleep 0.3
    assert_no_selector ".jm-pop.jm-pop--show", visible: :all
  end

  test "with a mouse, the popover's link can be reached and opens the step" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    current = route.route_steps.find_by!(position: route.current_step)

    node = find(".jm-node--current")
    page.driver.browser.action.move_to(node.native).perform
    assert_selector ".jm-pop.jm-pop--show"
    href = find(".jm-pop__act")["href"]
    from = rect_of(".jm-node--current")
    to = rect_of(".jm-pop__act")
    # A person's pace: across the gap and onto the link in ~400 ms, longer than the close delay.
    a = [(from["left"] + from["right"]) / 2, (from["top"] + from["bottom"]) / 2]
    b = [(to["left"] + to["right"]) / 2, (to["top"] + to["bottom"]) / 2]
    mouse = ->(type, (x, y), buttons = 0) {
      page.driver.browser.execute_cdp("Input.dispatchMouseEvent", type: type, x: x, y: y,
                                      button: "left", buttons: buttons, clickCount: 1)
    }
    20.times do |i|
      mouse.call("mouseMoved", [a[0] + (b[0] - a[0]) * (i + 1) / 20, a[1] + (b[1] - a[1]) * (i + 1) / 20])
      sleep 0.02
    end
    assert_selector ".jm-pop.jm-pop--show"
    mouse.call("mousePressed", b, 1)
    mouse.call("mouseReleased", b)

    assert_no_selector "#journey-map", wait: 5
    assert_current_path URI(href).path
    assert_equal learning_routes_engine.route_step_path(route, current), URI(href).path
  end

  test "leaving the open popover closes it after the delay" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)

    page.driver.browser.action.move_to(find(".jm-node--current").native).perform
    assert_selector ".jm-pop.jm-pop--show"
    page.driver.browser.action.move_to(find(".jm-pop__title").native).perform
    sleep 0.3
    assert_selector ".jm-pop.jm-pop--show"
    x, y = empty_point
    page.driver.browser.execute_cdp("Input.dispatchMouseEvent", type: "mouseMoved", x: x, y: y, button: "none", buttons: 0)
    assert_no_selector ".jm-pop.jm-pop--show", visible: :all
  end

  test "a masked node's popover is generic and leaks no title" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    find(".jm-chip--locked").click

    page.driver.browser.action.move_to(find(".jm-node--masked", match: :first).native).perform
    assert_selector ".jm-pop.jm-pop--show"
    assert_selector ".jm-pop__title", text: I18n.t("learning_engine.journey.pop_masked_title", locale: :es)
    assert_selector ".jm-pop__act", text: I18n.t("learning_engine.journey.act_masked", locale: :es)
    refute_includes page.html, "SECRETO"
  end

  test "on a phone, a popover near the top flips below and stays inside the viewport" do
    # A true 390 px viewport (CDP): macOS Chrome keeps a window at least 500 px
    # wide, so resize_to(390, …) measured this at 500 locally and 390 on CI.
    viewport(390, 844)
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    first = route.route_steps.find_by!(position: 0)
    box = box_of("s:#{first.id}")
    topbar = page.evaluate_script("document.getElementById('journey-topbar').getBoundingClientRect().bottom")
    # The phone opens on the current step, so the first one starts off the left edge.
    drag_by(8 - box["left"], -(box["top"] - topbar - 6))

    page.driver.browser.action.move_to(find("[data-node-id='s:#{first.id}'] .jm-node__dot").native).perform
    assert_selector ".jm-pop.jm-pop--show.jm-pop--below"
    pop = page.evaluate_script("(() => { const b = document.querySelector('.jm-pop').getBoundingClientRect(); return { left: b.left, right: b.right } })()")
    assert_operator pop["left"], :>=, 0
    assert_operator pop["right"], :<=, 390
  end

  # ── WP-37b §5.3: double-click (LOD far is out of reach on the leash) ──
  test "double-click on the canvas zooms in there; on the module disc it centres it at 1.2 or more" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    before = matrix["a"]
    x, y = empty_point
    page.driver.browser.action.move_to_location(x, y).double_click.perform
    assert_in_delta [before * 1.6, 2].min, matrix["a"], 0.01

    find(".jm-node--module .jm-node__dot", match: :first).double_click
    assert_operator matrix["a"], :>=, 1.2 - 1e-6
  end

  # ── WP-37b §5.4: the two camera openings ──────────────────────────────
  # A true 1440 × 1000 viewport (CDP), as the prototype's renders: resize_to
  # sizes the WINDOW, whose page area is ~140 px shorter. The production
  # module is 1476 px wide, so it opens width-limited at ≈ 0.93.
  { 7 => 1.0, production: 0.932 }.each do |shape, expected|
    test "#{shape} at 1440 × 1000: the title, the chip and the whole first module open in view" do
      viewport(1440, 1000)
      route = build_route(shape)
      open_journey(route, reduced_motion: true)

      k = matrix["a"]
      assert_in_delta expected, k, 0.02, "the opening scale is #{k}"
      assert_clear rect_of(".jm-root__title")
      assert_clear rect_of(".jm-chip")
      assert_clear rect_of(".jm-panel")
    end
  end

  # The owner's screenshot: a current step deep in a reinforcement fan opened
  # with the route's title half under the blurred top bar. The title opens
  # clear of it while the step stays in view; when both cannot fit, the step
  # wins and the title is wholly off the top, never half under the bar.
  [[1440, 1000, 3, :clear], [390, 844, 1, :clear], [1440, 1000, 30, :off]].each do |w, h, kid, expect|
    test "at #{w} with the current step at reinforcement #{kid + 1}, the title opens #{expect} of the top bar" do
      viewport(w, h, scale: w < 700 ? 3 : 1)
      route = build_route(43)
      current = route.route_steps.where("metadata->>'reinforcement' = 'true'").order(:position)[kid]
      current.update!(status: :available)
      route.update!(current_step: current.position)
      open_journey(route, reduced_motion: true)

      root = rect_of(".jm-root")
      bar = rect_of("#journey-topbar")
      if expect == :clear
        assert_operator root["top"], :>=, bar["bottom"], "the title opens under the top bar: #{root.inspect}"
      else
        assert_operator root["bottom"], :<=, 0, "the title opens half under the top bar: #{root.inspect}"
      end
      assert_current_clear(route)
    end
  end

  test "on a phone the current step opens centred at the legible floor" do
    viewport(390, 844)
    route = build_route(:production)
    open_journey(route, reduced_motion: true)

    assert_in_delta 12.0 / 13, matrix["a"], 1e-3
    current = box_of(page.evaluate_script("document.querySelector('.jm-node--current').dataset.nodeId"))
    dot = rect_of(".jm-node--current .jm-node__dot")
    safe_mid = page.evaluate_script("innerWidth / 2")
    assert_in_delta safe_mid, (dot["left"] + dot["right"]) / 2, 2
    assert_clear current
  end

  # ── WP-37b §4.5: entrance and motion ──────────────────────────────────
  test "the first paint of a visit draws in; a Turbo restore does not replay it" do
    route = build_route(7)
    open_journey(route)
    assert_selector ".jm-world.jm-world--enter"

    find(".jm-node--current").click
    assert_current_path %r{/steps/}
    page.go_back
    assert_selector "[data-journey-ready='true']", wait: 10
    sleep 0.3
    assert_no_selector ".jm-world.jm-world--enter"
  end

  test "under reduced motion the orbit does not turn" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    assert_equal "none", page.evaluate_script("getComputedStyle(document.querySelector('.jm-node__orbit')).animationName")
  end

  # ── WP-37b §9 checkpoint 2: the renders the owner compares ────────────
  test "renders for the owner" do
    skip "SCREENSHOT=1 to write the renders" unless ENV["SCREENSHOT"]

    signed_in = false
    { 7 => "7", production: "7+13", 43 => "43" }.each do |shape, name|
      [[1440, 1000, "1440"], [390, 844, "390"]].each do |w, h, width|
        %w[light dark].each do |theme|
          viewport(w, h, scale: w < 700 ? 2 : 1) # a phone at its real density (STEP 39 §2b)
          route = build_route(shape)
          open_journey(route, theme: theme, reduced_motion: true, sign_in: !signed_in)
          signed_in = true
          assert_equal w, page.evaluate_script("document.documentElement.clientWidth")
          screenshot("#{name}-#{theme}-#{width}")
          page.driver.browser.execute_cdp("Emulation.setEmulatedMedia", features: [])
        end
      end
    end
    viewport(1440, 1000)
    route = build_route(7)
    open_journey(route, reduced_motion: true, sign_in: false)
    page.driver.browser.action.move_to(find(".jm-node--current").native).perform
    assert_selector ".jm-pop.jm-pop--show"
    screenshot("7-light-1440-popover")
  end

  # ── Fresh review (Task 14) ────────────────────────────────────────────
  test "Back to the map finds the popover closed, though it was open on leaving" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    # Opened and left from the keyboard, so no pointer hovers the node on return.
    page.execute_script("document.querySelector('.jm-viewport').focus()")
    page.driver.browser.action.send_keys(:tab).perform until page.evaluate_script("document.activeElement.classList.contains('jm-node--current')")
    assert_selector ".jm-pop.jm-pop--show"
    page.driver.browser.action.send_keys(:enter).perform
    assert_current_path %r{/steps/}

    page.go_back
    assert_selector "[data-journey-ready='true']", wait: 10
    sleep 0.3
    assert_no_selector ".jm-pop.jm-pop--show", visible: :all
    assert_selector ".jm-pop[aria-hidden='true']", visible: :all
  end

  test "after a touch, Enter on a focused step still navigates" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)
    touch_tap(".jm-node--current")
    touch_tap(".jm-node--current") # a second tap closes the popover
    page.execute_script("document.querySelector('.jm-node--current').focus()")
    page.driver.browser.action.send_keys(:enter).perform
    assert_current_path %r{/steps/}
  end

  test "a tap opens the touch popover and keeps it open; a second tap closes it" do
    route = build_route(7)
    open_journey(route, reduced_motion: true)

    touch_tap(".jm-node--current")
    assert_selector ".jm-pop.jm-pop--show.jm-pop--touch"
    assert_no_current_path %r{/steps/}

    touch_tap(".jm-node--current")
    assert_no_selector ".jm-pop.jm-pop--show", visible: :all
  end

  test "Tab onto an off-screen chip or unlock pill brings it into view" do
    route = build_route(43)
    open_journey(route, reduced_motion: true)
    locked = route.route_modules.find_by!(access_state: :locked)
    chip = ".jm-chip[data-module-node-id='m:#{locked.id}']"
    assert_operator rect_of(chip)["top"], :>, page.evaluate_script("innerHeight"), "the chip should start off-screen"

    page.execute_script("document.querySelector(#{chip.to_json}).focus()")
    assert_clear rect_of(chip)

    drag_by(0, 3000)
    page.execute_script("document.querySelector('.jm-unlock').focus()")
    assert_clear rect_of(".jm-unlock")
  end

  [[1024, 768], [1180, 820], [800, 1000]].each do |w, h|
    test "at #{w} × #{h} the overlays never overlap and the legend holds its items" do
      viewport(w, h)
      route = build_route(:production)
      open_journey(route, reduced_motion: true)

      boxes = overlay_boxes
      assert_nil first_overlap(boxes), "two overlays overlap at #{w}: #{first_overlap(boxes).inspect}"
      spill = page.evaluate_script(<<~JS)
        (() => { const l = document.querySelector(".jm-legend"); if (!l || !l.offsetWidth) return []
          const b = l.getBoundingClientRect()
          return [...l.children].map((c) => c.getBoundingClientRect())
            .filter((c) => c.right > b.right + 0.5 || c.left < b.left - 0.5 || c.bottom > b.bottom + 0.5).length ? ["spill"] : [] })()
      JS
      assert_empty spill, "a legend item spills out of its box at #{w}"
      assert_current_clear(route)
    end
  end

  private

  # all_done: every preview step completed, current_step past the paywall —
  # where advance_current_step! leaves a student who finished the free preview.
  # 7: seven primary steps. 43: plus 36 reinforcement under step 3.
  # :production: 7+13 — fans of 3, 3, 3 and 4 under steps 2, 3, 5 and 6 (brief §9).
  PRODUCTION_FANS = { 1 => 3, 2 => 3, 4 => 3, 5 => 4 }.freeze

  def build_route(size, all_done: false)
    route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: @profile, topic: "Portugués para viajar", locale: "es", status: :active,
      current_step: all_done ? 100 : 2
    )
    preview = preview_of(route)
    position = 0
    fans = size == :production ? PRODUCTION_FANS : (size == 43 ? { 2 => 36 } : {})
    current_position = nil
    7.times do |i|
      status = all_done || i < 2 ? :completed : (i == 2 ? :available : :locked)
      step = route.route_steps.create!(
        route_module: preview, title: TITLES[i], position: position, status: status,
        content_type: :lesson, level: :nv1, bloom_level: 1, estimated_minutes: 8 + ((i * 7) % 9)
      )
      current_position = position if i == 2
      position += 1
      fans.fetch(i, 0).times do |j|
        kid_status = if status == :completed then (j.zero? ? :completed : :available) else :locked end
        route.route_steps.create!(
          route_module: preview, title: REINFORCEMENT_TITLES[j % REINFORCEMENT_TITLES.size], position: position,
          status: kid_status, content_type: :lesson, level: :nv1, bloom_level: 1, estimated_minutes: 4,
          metadata: { "reinforcement" => true, "triggering_step_id" => step.id }
        )
        position += 1
      end
    end
    route.update!(current_step: current_position) unless all_done
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

  def open_journey(route, theme: "light", reduced_motion: false, sign_in: true)
    if reduced_motion
      page.driver.browser.execute_cdp("Emulation.setEmulatedMedia",
                                      features: [{ name: "prefers-reduced-motion", value: "reduce" }])
    end
    sign_in_through_ui if sign_in
    visit learning_routes_engine.journey_route_path(route)
    page.execute_script("document.documentElement.setAttribute('data-theme', #{theme.to_json})")
    assert_selector "[data-journey-ready='true']", wait: 10
    # The layout's <body> transitions its background over 0.3 s on a theme
    # change; text whose backing is the body (the counter) is measured after.
    Timeout.timeout(3) { sleep 0.05 until page.evaluate_script("document.body.getAnimations().length").zero? }
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end

  MEASURE_TEXT = <<~JS.freeze
    ((selector) => {
      const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null
        const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const backing = (el) => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0.99) return c } return parse(getComputedStyle(document.body).backgroundColor) }
      const scale = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".jm-world")).transform).a
      return [...document.querySelectorAll(selector)].map((el) => {
        const L1 = lum(parse(getComputedStyle(el).color)), L2 = lum(backing(el)), b = el.getBoundingClientRect()
        return { text: el.textContent.trim(), cls: el.className, node: el.closest(".jm-node")?.className || "",
                 px: parseFloat(getComputedStyle(el).fontSize) * scale,
                 contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
                 box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
                 clipped: el.scrollHeight > el.clientHeight + 1 }
      })
    })
  JS

  def measure_text(selector) = page.evaluate_script("#{MEASURE_TEXT}(#{selector.to_json})")
  def measure_labels = measure_text(".jm-node__label, .jm-root__title")

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
    count = lambda do |kind|
      of_kind = steps.select { |l| l["node"].split.include?("jm-node--#{kind}") }
      "#{kind} #{of_kind.count { |l| l['clipped'] }}/#{of_kind.size}"
    end
    puts "[wp37b] #{size} steps #{theme}: #{steps.count { |l| l['clipped'] }}/#{steps.size} labels ellipsized — " \
         "#{%w[step reinforcement module].map(&count).join(', ')} (labelWidth 124px, 13px/16px, " \
         "#{page.evaluate_script("getComputedStyle(document.querySelector('.jm-world')).getPropertyValue('--jm-lines')").strip} lines)"
  end

  def screenshot(name)
    return unless ENV["SCREENSHOT"]

    dir = Rails.root.join("tmp", "wp37b", "renders")
    FileUtils.mkdir_p(dir)
    path = dir.join("mapa-#{ENV.fetch("SCREENSHOT_PREFIX", "")}#{name}.png")
    page.save_screenshot(path.to_s)
    puts "[#{name}] screenshot -> #{path}"
  end


  # The page area itself, not the window (CDP device metrics).
  def viewport(width, height, scale: 1)
    page.driver.browser.execute_cdp("Emulation.setDeviceMetricsOverride",
                                    width: width, height: height, deviceScaleFactor: scale, mobile: width < 700)
  end

  # A touch tap as the browser delivers it: pointerdown (touch), focus, pointerup, click.
  def touch_tap(selector)
    page.execute_script(<<~JS)
      (() => { const el = document.querySelector(#{selector.to_json}); const r = el.querySelector(".jm-node__dot").getBoundingClientRect()
        const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
                     pointerId: 7, pointerType: "touch", isPrimary: true }
        el.dispatchEvent(new PointerEvent("pointerdown", at)); el.focus()
        el.dispatchEvent(new PointerEvent("pointerup", at)); el.dispatchEvent(new MouseEvent("click", { ...at, detail: 1 })) })()
    JS
    sleep 0.15
  end

  def ctrl_wheel(dy)
    page.execute_script(<<~JS)
      document.querySelector(".jm-viewport").dispatchEvent(new WheelEvent("wheel", { deltaY: #{dy}, ctrlKey: true, bubbles: true, cancelable: true }))
    JS
    sleep 0.1
  end

  # A real mouse drag from an empty point, through CDP: unlike WebDriver actions
  # it may travel past the window's edge, as a 10,000 px drag must. The pan is
  # what the map would do for a wheel of (-dx, -dy) before the leash.
  # One gesture along `points`; with press: false it continues a drag already
  # pressed. The block runs mid-gesture, the button still down.
  def drag_path(points, press: true, steps: 20)
    send = ->(type, px, py, buttons) {
      page.driver.browser.execute_cdp("Input.dispatchMouseEvent", type: type, x: px, y: py,
                                      button: "left", buttons: buttons, clickCount: 1)
    }
    if press
      send.call("mouseMoved", *points.first, 0)
      send.call("mousePressed", *points.first, 1)
    end
    points.each_cons(2) do |(ax, ay), (bx, by)|
      (1..steps).each { |i| send.call("mouseMoved", ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps, 1) }
    end
    sleep 0.1
    if block_given?
      yield
    else
      send.call("mouseReleased", *points.last, 0)
      sleep 0.1
    end
  end

  def drag_by(dx, dy, steps: 20)
    x, y = empty_point
    send = ->(type, px, py, buttons) {
      page.driver.browser.execute_cdp("Input.dispatchMouseEvent", type: type, x: px, y: py,
                                      button: "left", buttons: buttons, clickCount: 1)
    }
    send.call("mouseMoved", x, y, 0)
    send.call("mousePressed", x, y, 1)
    (1..steps).each { |i| send.call("mouseMoved", x + dx * i / steps, y + dy * i / steps, 1) }
    send.call("mouseReleased", x + dx, y + dy, 0)
    sleep 0.1
  end

  def rect_of(selector)
    page.evaluate_script(<<~JS)
      (() => { const b = document.querySelector(#{selector.to_json}).getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })()
    JS
  end

  # Brief §6.1 — the DOM twin of journey_map_paths_test.rb: sample every drawn
  # line every 3 px (getPointAtLength, mapped to the screen) and report every
  # sample inside a label's box.
  def lines_through_labels
    page.evaluate_script(<<~JS)
      (() => {
        const labels = [...document.querySelectorAll(".jm-node__label")].map((el) => {
          const b = el.getBoundingClientRect()
          return { id: el.closest(".jm-node").dataset.nodeId, l: b.left + 1, r: b.right - 1, t: b.top + 1, b: b.bottom - 1 }
        })
        const hits = new Set()
        for (const path of document.querySelectorAll(".jm-edges path.jm-track, .jm-edges path.jm-travelled, .jm-edges path.jm-branch, .jm-edges path.jm-trunk")) {
          const total = path.getTotalLength()
          const m = path.getScreenCTM()
          for (let s = 0; s <= total; s += 3) {
            const p = new DOMPoint(path.getPointAtLength(s).x, path.getPointAtLength(s).y).matrixTransform(m)
            for (const b of labels) {
              if (p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b) hits.add(`${path.getAttribute("class")} through ${b.id}`)
            }
          }
        }
        return [...hits]
      })()
    JS
  end

  # Brief §6.2: one continuous path per module route.
  def assert_one_path_per_route
    routes = page.evaluate_script(<<~JS)
      [...document.querySelectorAll(".jm-edges path[data-module-id]")].map((p) => [p.dataset.moduleId, p.getAttribute("d")])
    JS
    modules = page.evaluate_script("document.querySelectorAll('.jm-node--module').length")
    assert_equal modules, routes.map(&:first).uniq.size, "every module draws its route"
    assert_equal routes.size, routes.map(&:first).uniq.size, "a module's route is drawn in more than one path"
    routes.each { |id, d| assert_equal 1, d.count("M"), "#{id}'s route restarts: #{d[0, 80]}…" }
  end

  # Brief §6.3: chips, the Continue card, the legend and the counter.
  def assert_chrome_contrast(theme)
    texts = measure_text(".jm-chip > span, .jm-chip > b, .jm-unlock, .jm-card__eyebrow, .jm-card__title, .jm-cta, " \
                         ".jm-legend span, .jm-counter__text, .jm-root__eyebrow, .jm-root__meta")
    refute_empty texts
    texts.each do |t|
      next if t["text"].blank? || t["text"] == "·"

      assert_operator t["contrast"], :>=, MIN_CONTRAST,
        "#{t['text'].inspect} (#{t['cls']}) measures #{format('%.2f', t['contrast'])}:1 on #{theme}"
    end
  end

  def assert_popover_contrast
    texts = measure_text(".jm-pop__eyebrow, .jm-pop__title, .jm-pop__meta, .jm-pop__act")
    texts.each do |t|
      assert_operator t["contrast"], :>=, MIN_CONTRAST, "#{t['text'].inspect} measures #{format('%.2f', t['contrast'])}:1"
    end
  end

  def pay_for_route!(route) = purchase_route!(route, user: @user)

  # Computed from the database, not the page: per module, its primary steps in
  # position order, 1-based; only steps not done, on a readable module, show one.
  def expected_numbers(route)
    readable = page.evaluate_script(<<~JS)
      [...document.querySelectorAll(".jm-node--step:not(.jm-node--masked)")].map((el) => el.dataset.nodeId)
    JS
    LearningRoutesEngine::RouteStep.where(learning_route_id: route.id).reject { |s| s.metadata["reinforcement"] }
                                   .group_by(&:route_module_id).flat_map do |_, steps|
      steps.sort_by(&:position).each_with_index.filter_map do |step, i|
        id = "s:#{step.id}"
        [id, (i + 1).to_s] if readable.include?(id) && !step.completed?
      end
    end.to_h
  end

  def drawn_numbers
    page.evaluate_script(<<~JS).to_h
      [...document.querySelectorAll(".jm-node__num")].map((el) => [el.closest(".jm-node").dataset.nodeId, el.textContent])
    JS
  end
end
