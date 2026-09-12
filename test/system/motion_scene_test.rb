require "application_system_test_case"

# WP-36 task 9 §5. mc.js is ~186 KB and most lessons have no scene at all, so
# the Stimulus controller lazy-imports it inside `play()` rather than at the
# top of the file. An `import` that quietly moved back to the top would ship
# that bundle to every lesson, with nothing failing — this is the test that
# would catch it.
#
# Task 18 appends more motion-scene cases to this same file; this is
# deliberately its first.
class MotionSceneTest < ApplicationSystemTestCase
  def setup
    @user = Core::User.create!(
      name: "Motion", email: "motion-#{SecureRandom.hex(4)}@example.com",
      password: "password123", password_confirmation: "password123",
      email_verified_at: Time.current, locale: "es"
    )
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    @step = @route.route_steps.create!(
      route_module: preview, title: "Sin escena", position: 0, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        # No "motion" section anywhere — the premise of the test below.
        "parsed_sections" => [
          { "type" => "concept", "title" => "Concepto", "body" => "Contenido sin movimiento." }
        ],
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(route_step: @step, content_type: :text, body: "## Concepto: x\nContenido sin movimiento.")
  end

  test "a lesson with no motion block never fetches the runtime" do
    visit_lesson_without_motion

    assert_selector ".lesson-sections-container", wait: 10
    requested = page.evaluate_script(
      "performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('mc'))"
    )
    assert_equal [], requested,
      "mc.js was fetched on a lesson with no scene: the import is no longer lazy"
  end

  # ── Checkpoint 2: the scene must be LEGIBLE, not merely present ──────────
  #
  # Found in the browser at Task 11: the canvas drew correct ink (`#1C1812`
  # sampled from its pixels) and the student on the app's dark theme saw
  # nothing. `main.ts` sets a transparent project background, both scenes
  # hardcoded the light palette, and `learning.html.erb` stamps `data-theme`
  # from `current_user.theme`. Present in the DOM, invisible on screen — the
  # WP-33/WP-35 class.
  #
  # A box assertion cannot see this: `lesson_block_visibility_test.rb` already
  # proves the motion block occupies real pixels, and it passed throughout.
  # Only the PIXELS tell the truth, so this reads them and computes the real
  # WCAG contrast ratio between the ink the scene painted and the ground it
  # was painted on.

  # A `transform` payload with every `hi` emptied, derived from the scene's own
  # schema example so it cannot drift from the vocabulary.
  #
  # Emptying `hi` is what makes the ink sample PROVABLE rather than lucky. With
  # no highlighted token, `transform.tsx` never fills a chip, so the only thing
  # ever painted onto the transparent canvas is glyph interiors: the tokens
  # (fontWeight 700, fontSize 62) and the small step tags. Every fully-opaque
  # pixel is therefore ink by construction, and the most common one is the
  # tokens' ink because those glyphs dwarf the fontSize-20 tags.
  FLAT_TRANSFORM = {
    "steps" => ContentEngine::MotionScenes.example("transform")["steps"].map { |s| s.merge("hi" => []) }
  }.freeze

  # A bold 62px glyph run at 1600x900 paints tens of thousands of solid pixels.
  # 2_000 is far above antialiasing noise and far below a real render, so it
  # separates "the scene painted its ink" from "the canvas is blank".
  MIN_INK_PIXELS = 2_000

  # WCAG 2.1 relative luminance, the real formula — sRGB channel to linear,
  # then L = 0.2126R + 0.7152G + 0.0722B.
  def relative_luminance(rgb)
    linear = rgb.map do |value|
      channel = value.to_f / 255.0
      channel <= 0.03928 ? channel / 12.92 : (((channel + 0.055) / 1.055)**2.4)
    end
    (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2])
  end

  def contrast_ratio(one, other)
    lighter, darker = [relative_luminance(one), relative_luminance(other)].minmax.reverse
    (lighter + 0.05) / (darker + 0.05)
  end

  test "the flat transform payload highlights nothing, which is what makes the ink sample provable" do
    assert_equal [], ContentEngine::MotionScenes.validate("transform", FLAT_TRANSFORM.deep_dup),
      "the sampling payload must satisfy the scene's own schema or the scene never renders"
    assert FLAT_TRANSFORM["steps"].all? { |s| s["hi"].empty? },
      "a highlighted token fills a chip, and a chip fill is a fully-opaque non-ink pixel: " \
      "the ink sample below would no longer be ink by construction"
    assert_operator FLAT_TRANSFORM["steps"].size, :>=, 1
  end

  %w[dark light].each do |theme|
    test "the scene's ink is legible against the card on the #{theme} theme" do
      open_lesson_with_motion(theme)

      assert_equal theme, page.evaluate_script("document.documentElement.getAttribute('data-theme')"),
        "the #{theme} theme was not stamped on <html>, so this test proves nothing"

      find("[data-motion-scene-target='play']").click

      sample = sample_painted_ink
      backing = sample_backing_colour

      ink = sample["ink"]
      refute_nil ink,
        "no fully-opaque pixel anywhere on the canvas: the scene painted nothing at all"

      ratio = contrast_ratio(ink, backing)

      assert_operator ratio.round(2), :>=, 4.5,
        "the scene's ink #{hex(ink)} sits on #{hex(backing)} (from #{backing_source}) at " \
        "#{ratio.round(2)}:1 — below WCAG AA 4.5:1. The scene is drawing a palette of its " \
        "own instead of the page's tokens, so the student on the #{theme} theme cannot read it."

      # Certifies the sample AFTER the measurement, so a red run reports the
      # ratio rather than these.
      #
      # Measured on this payload: the canvas carries exactly TWO fully-opaque
      # colours — the tokens' ink (~9_700 px) and the step tags' muted grey
      # (~300 px) — so the dominant one is the token ink by a factor of ~32.
      # The share assertion says so out loud: if a future change fills a chip
      # or paints a wash, the dominant mass stops being ink and this fails
      # instead of quietly measuring the wrong pixel.
      share = sample["inkPixels"].to_f / sample["opaque"]
      assert_operator share, :>=, 0.6,
        "the dominant opaque colour is only #{(share * 100).round}% of the #{sample['opaque']} " \
        "opaque pixels (#{sample['distinct']} distinct): the canvas is painting some other " \
        "mass and this is no longer a sample of the token text's ink"

      assert_equal token_rgb("--color-txt"), ink,
        "the dominant opaque pixel #{hex(ink)} is not --color-txt: either the scene is not " \
        "taking its ink from the page's tokens, or this sample is no longer sampling ink"
    end
  end

  private

  def hex(rgb) = format("#%02X%02X%02X", *rgb)

  def token_rgb(name)
    value = page.evaluate_script(
      "getComputedStyle(document.documentElement).getPropertyValue('#{name}').trim()"
    )
    match = value.match(/\A#(\h\h)(\h\h)(\h\h)\z/)
    raise "--color token #{name} is #{value.inspect}, not a 6-digit hex" unless match

    match.captures.map { |pair| pair.to_i(16) }
  end

  # The most common FULLY-OPAQUE colour on the canvas bitmap.
  #
  # The alpha filter is the whole trick. `main.ts` keeps the project background
  # transparent on purpose (the card behind shows through), so an unpainted
  # pixel has alpha 0 — and a naive read that ignored alpha would see
  # rgba(0,0,0,0) as opaque BLACK, which on the light theme scores 17:1 against
  # the card and passes a blank canvas. Requiring alpha 255 also rejects glyphs
  # mid-fade (transform.tsx holds context rows at opacity 0.35), so what comes
  # back is settled, fully-drawn ink.
  INK_JS = <<~JS.freeze
    (() => {
      const canvas = document.querySelector(".lesson-motion__stage canvas");
      if (!canvas) return { error: "no canvas in the stage" };
      // getImageData raises IndexSizeError on a zero-sized rect, and the
      // canvas is briefly 0x0 between `el.replaceChildren(canvas)` and
      // `stage.configure` — polled, not an error worth raising to Ruby.
      if (!canvas.width || !canvas.height) return { error: "the canvas has no bitmap yet" };
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "canvas has no 2d context" };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts = new Map();
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] !== 255) continue;
        opaque += 1;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let best = -1;
      let bestCount = 0;
      for (const [key, count] of counts) {
        if (count > bestCount) { bestCount = count; best = key; }
      }
      return {
        width: canvas.width, height: canvas.height, opaque, distinct: counts.size,
        inkPixels: bestCount,
        ink: best < 0 ? null : [(best >> 16) & 255, (best >> 8) & 255, best & 255]
      };
    })()
  JS

  # What the student actually sees behind the canvas: the first ancestor with a
  # fully-opaque background, with every translucent layer between it and the
  # canvas composited back over it (source-over), because a glass card would
  # otherwise be reported as the colour underneath it.
  BACKING_JS = <<~JS.freeze
    (() => {
      const parse = (value) => {
        const match = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (!match) return null;
        const parts = match[1].split(",").map((piece) => parseFloat(piece));
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
      };
      let node = document.querySelector(".lesson-motion__stage canvas");
      if (!node) return { error: "no canvas in the stage" };
      const layers = [];
      while (node) {
        layers.push({ bg: parse(getComputedStyle(node).backgroundColor), node });
        node = node.parentElement;
      }
      const start = layers.findIndex((layer) => layer.bg && layer.bg[3] >= 0.999);
      if (start < 0) return { error: "no ancestor of the canvas has an opaque background" };
      const describe = (el) => el.tagName.toLowerCase() +
        (el.id ? "#" + el.id : "") +
        (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "");
      let rgb = layers[start].bg.slice(0, 3);
      const composited = [];
      for (let i = start - 1; i >= 0; i--) {
        const bg = layers[i].bg;
        if (!bg || bg[3] === 0) continue;
        rgb = [0, 1, 2].map((c) => (bg[c] * bg[3]) + (rgb[c] * (1 - bg[3])));
        composited.push(describe(layers[i].node));
      }
      return { rgb: rgb.map((c) => Math.round(c)), source: describe(layers[start].node), composited };
    })()
  JS

  # Polls because the scene is an animation: `transform.tsx` fades its first row
  # in over 0.25s and plops the tokens in one at a time, so the canvas is
  # legitimately empty for the first frames and dips back under the threshold
  # mid-transition (measured: 10_709 settled ink pixels one moment, 261 the
  # next, while a row crosses fade).
  #
  # A driver-level failure counts as "not ready", not as a result. Measured on
  # this page: the FIRST getImageData round trip after the play click comes back
  # as an errorless chromedriver failure (an empty `error`, hence a bare
  # WebDriverError whose message is its own class name) while the renderer is
  # still executing the 186 KB `import("mc")`; a trivial script in the same
  # instant succeeds, and the next poll 0.15s later returns pixels. Swallowing
  # it cannot turn a red into a green — the loop only ever exits on a real
  # sample or on the deadline, which flunks with whatever the last poll said.
  def sample_painted_ink(timeout: 20)
    assert_selector ".lesson-motion__stage canvas", wait: 10
    deadline = Time.current + timeout
    last = nil
    loop do
      begin
        last = page.evaluate_script(INK_JS)
      rescue Selenium::WebDriver::Error::WebDriverError => e
        last = { "error" => "#{e.class}: #{e.message}" }
      end
      break last if last.is_a?(Hash) && last["ink"] && last["inkPixels"].to_i >= MIN_INK_PIXELS

      if Time.current > deadline
        flunk "the canvas never painted #{MIN_INK_PIXELS} settled ink pixels in #{timeout}s. " \
              "Last sample: #{last.inspect}"
      end
      sleep 0.15
    end
  end

  def sample_backing_colour
    @backing = page.evaluate_script(BACKING_JS)
    raise @backing["error"] if @backing["error"]

    @backing["rgb"]
  end

  def backing_source
    return "unknown" unless @backing

    [@backing["source"], *@backing["composited"]].join(" under ")
  end

  def open_lesson_with_motion(theme)
    @user.update!(theme: theme)
    preview = LearningRoutesEngine::RouteModule.find_by!(
      learning_route_id: @route.id, access_state: :preview
    )
    step = @route.route_steps.create!(
      route_module: preview, title: "Escena", position: 1, status: :in_progress,
      content_type: :lesson, level: :nv1, bloom_level: 1,
      metadata: {
        "parsed_sections" => [
          { "type" => "motion", "scene" => "transform", "data" => FLAT_TRANSFORM.deep_dup,
            "narration" => "Observa cómo cambia la frase." }
        ],
        "content_ready" => true
      }
    )
    ContentEngine::AiContent.create!(
      route_step: step, content_type: :text, body: "## Concepto: x\nContenido."
    )

    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, step)
    assert_selector ".lesson-motion", wait: 10
  end

  def sign_in_through_ui
    visit core.sign_in_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    assert_field "email", with: @user.email
    find("input[type='submit']").click
    assert_no_current_path core.sign_in_path, wait: 5
  end

  def visit_lesson_without_motion
    sign_in_through_ui
    visit learning_routes_engine.route_step_path(@route, @step)
  end
end
