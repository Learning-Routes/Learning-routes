require "test_helper"
require "json"
require "open3"

# WP-35 §4. The journey geometry is a PURE module — no DOM, no Stimulus, no CSS
# — precisely so the thing that broke can be asserted without a browser.
#
# The old `getSatPositions` put every topic of a stage on one arc of
# `Math.PI * 0.9` at radius 185. That arc is ~523px long and a satellite is
# ~90px wide, so it holds about six, and there was no rule for what happens
# after that. Production has a module with 43 steps: forty-three overlapping
# circles in one ring. It failed at 8 on a healthy route.
#
# The counts below are the ones that matter: 1 (a stage with one step), 7 (what
# the owner's route looks like after the WP-29 reinforcement cleanup), 8 (the
# first count the old layout could not hold), 20, and 43 (the screenshot the
# owner is judging by).
#
# There is no JS test runner in this repo and no package.json, so rather than
# introduce one this runs the module under node and asserts on its JSON. It
# therefore lives in `bin/rails test`, where the team already looks.
class JourneyLayoutTest < ActiveSupport::TestCase
  COUNTS = [1, 7, 8, 20, 43].freeze
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_layout.js")

  # A stage element is this wide in the layout the controller renders.
  STAGE_WIDTH = 720

  COUNTS.each do |count|
    test "#{count} topics: no two satellite boxes intersect" do
      result = layout(count)

      assert_nil result["overlap"],
        "two satellites collide at #{count} topics: #{result['overlap'].inspect}"
      assert_equal count, result["satellites"].size
    end

    test "#{count} topics: every satellite lies inside the stage box" do
      result = layout(count)
      box = result["box"]

      result["satellites"].each do |sat|
        assert_operator sat["x"] - sat["r"], :>=, box["left"] - 0.001, "satellite escapes left"
        assert_operator sat["x"] + sat["r"], :<=, box["right"] + 0.001, "satellite escapes right"
        assert_operator sat["y"] - sat["r"], :>=, box["top"] - 0.001, "satellite escapes top"
        assert_operator sat["y"] + sat["r"], :<=, box["bottom"] + 0.001, "satellite escapes bottom"
      end
    end

    test "#{count} topics: the spine stays inside the stage's width" do
      result = layout(count)

      assert_operator result["box"]["width"], :<=, STAGE_WIDTH + 0.001,
        "the overflow spine ran wider than the stage at #{count} topics"
    end

    test "#{count} topics: order is preserved, so tab order follows the route" do
      result = layout(count)

      assert_equal (0...count).to_a, result["satellites"].map { |s| s["index"] },
        "satellites came back reordered; reinforcement steps would drift away " \
        "from the step that triggered them and keyboard order would not match the route"
    end
  end

  # The capacity is measured, never a constant. If someone replaces it with a
  # magic number this fails at the radius that number was chosen for.
  test "capacity follows the ring length and the satellite diameter" do
    wide = layout(43, ringRadius: 400)["capacity"]
    narrow = layout(43, ringRadius: 120)["capacity"]
    fat = layout(43, ringRadius: 400, satelliteRadius: 80, minSatelliteRadius: 80)["capacity"]

    assert_operator wide, :>, narrow, "a longer arc must hold more satellites"
    assert_operator fat, :<, wide, "bigger satellites must hold fewer on the same arc"
  end

  # Seven is the post-cleanup case and must look like a ring, not a ring plus a
  # stub of a spine.
  test "seven topics all sit on the ring" do
    placements = layout(7)["satellites"].map { |s| s["placement"] }

    assert_equal ["ring"] * 7, placements,
      "the count the route will have after the WP-29 cleanup must render as one clean ring"
  end

  # Forty-three is the screenshot. It must overflow rather than pile up.
  test "forty-three topics fill the ring and send the rest to the spine" do
    satellites = layout(43)["satellites"]
    ring = satellites.count { |s| s["placement"] == "ring" }
    spine = satellites.count { |s| s["placement"] == "spine" }

    assert_operator ring, :>, 0
    assert_operator spine, :>, 0
    assert_equal 43, ring + spine
    assert_equal (0...ring).to_a, satellites.take(ring).map { |s| s["index"] },
      "the ring must hold the FIRST steps; the spine continues the same order"
  end

  test "an empty stage lays out nothing and asks for no space" do
    result = layout(0)

    assert_equal [], result["satellites"]
    assert_equal 0, result["box"]["width"]
  end

  private

  def layout(count, **overrides)
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        const result = m.layoutStage(#{count}, #{overrides.to_json});
        process.stdout.write(JSON.stringify({
          satellites: result.satellites,
          capacity: result.capacity,
          satelliteRadius: result.satelliteRadius,
          box: result.box,
          overlap: m.anyOverlap(result.satellites)
        }));
      });
    JS

    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end
end
