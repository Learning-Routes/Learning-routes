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

  test "ensureVisible moves an off-screen box just inside the safe rect" do
    safe = call("safeRect", DESKTOP, [TOPBAR])
    box = { x: 3000, y: 2000, w: 168, h: 88 }
    cam = call("ensureVisible", { x: 0, y: 0, k: 1 }, box, safe, 24)
    assert_inside call("screenBox", cam, box), safe
  end

  private

  # STEP 38 §4, the leash: the content box plus a margin is the world; the
  # camera never shows past it, and zoom runs from fit-to-width to 2× that.
  WORLD = { x: -40, y: -40, w: 880, h: 2400 }.freeze

  test "a drag of 10,000 px in any direction leaves the world covering the screen" do
    safe = DESKTOP.merge(top: 52, height: 948)
    k = call("leashRange", WORLD, safe)["min"]
    [[10_000, 0], [-10_000, 0], [0, 10_000], [0, -10_000], [10_000, 10_000]].each do |dx, dy|
      cam = call("clampCamera", { x: dx, y: dy, k: k }, WORLD, safe)
      s = call("screenBox", cam, WORLD)
      assert_operator s["top"], :<=, safe[:top] + 0.01, "dragged #{dx},#{dy}: a gap above the world"
      assert_operator s["top"] + s["height"], :>=, safe[:top] + safe[:height] - 0.01, "dragged #{dx},#{dy}: a gap below"
      assert_in_delta safe[:left] + safe[:width] / 2.0, s["left"] + s["width"] / 2.0, 0.01,
                      "the world fits the width, so it stays centred across it"
    end
  end

  test "a world narrower than the screen at this zoom is centred, not pushed off" do
    cam = call("clampCamera", { x: -5000, y: 0, k: 0.2 }, WORLD, DESKTOP)
    s = call("screenBox", cam, WORLD)
    assert_in_delta 720, s["left"] + s["width"] / 2.0, 0.01
    assert_in_delta 500, s["top"] + s["height"] / 2.0, 0.01
  end

  test "zoom runs from fit-to-width to twice that" do
    range = call("leashRange", WORLD, PHONE)
    assert_in_delta 390.0 / 880, range["min"], 1e-9
    assert_in_delta 2 * 390.0 / 880, range["max"], 1e-9
  end

  test "the fitted scale is held between the legible floor and 1" do
    floor = 12 / 13.0
    assert_in_delta floor, call("leashRange", WORLD, PHONE, { floor: floor, ceiling: 1 })["min"], 1e-9,
                    "a phone fit-to-width under the floor would make labels illegible"
    assert_in_delta 1, call("leashRange", { x: 0, y: 0, w: 600, h: 900 }, DESKTOP, { floor: floor, ceiling: 1 })["min"], 1e-9,
                    "a small route is not blown up past its drawn size"
    assert_in_delta 2, call("leashRange", { x: 0, y: 0, w: 600, h: 900 }, DESKTOP, { floor: floor, ceiling: 1 })["max"], 1e-9
  end

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

  def assert_centred(box, cam, safe)
    s = call("screenBox", cam, box)
    assert_in_delta safe["left"] + safe["width"] / 2.0, s["left"] + s["width"] / 2.0, 0.01
    assert_in_delta safe["top"] + safe["height"] / 2.0, s["top"] + s["height"] / 2.0, 0.01
  end

  def assert_inside(screen, safe)
    assert_operator screen["left"], :>=, safe["left"] - 0.01
    assert_operator screen["top"], :>=, safe["top"] - 0.01
    assert_operator screen["left"] + screen["width"], :<=, safe["left"] + safe["width"] + 0.01
    assert_operator screen["top"] + screen["height"], :<=, safe["top"] + safe["height"] + 0.01
  end
end
