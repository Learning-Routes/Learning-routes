require "application_system_test_case"
require "support/route_purchase_helpers"

# WP-37 §4.3. Measured, not trusted: what the student SEES at first paint —
# pixels, contrast, legible text, nothing under an overlay — at 7 and 43, in both
# themes, on a desktop and on a phone.
#
# `SCREENSHOT=1 bin/rails test test/system/journey_map_test.rb` writes the five
# handoff captures from the same renders the assertions measured.
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
        # An edge may pass through its OWN endpoint's box (the spine through its
        # module's label). Every label therefore carries its own opaque backing,
        # so no line is ever drawn through text.
        transparent = page.evaluate_script(<<~JS)
          [...document.querySelectorAll(".jm-node__label")]
            .filter((el) => { const c = getComputedStyle(el).backgroundColor
              return c === "transparent" || /rgba\\(.*,\\s*0\\)$/.test(c) }).length
        JS
        assert_equal 0, transparent, "labels without a backing let edges run through their text"
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
    # The MAP's animations: the layout's own body colour transition belongs to
    # the theme switch, not to the map's first paint.
    assert_equal 0, page.evaluate_script("document.querySelector('.jm').getAnimations({ subtree: true }).length")
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

  def pay_for_route!(route) = purchase_route!(route, user: @user)
end
