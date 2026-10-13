require "test_helper"
require "json"
require "open3"

# WP-37b §4.3. The faint contour lines behind the map are a pure module: seeded
# noise → marching squares → one path string per level. Ruby parses the strings.
class JourneyTerrainTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/journey_terrain.js")
  LEVELS = [-0.32, -0.16, 0, 0.16, 0.32].freeze

  test "the same seed draws the same terrain; another seed draws another" do
    rect = { x: -700, y: -700, w: 1600, h: 1200 }
    a = contours(rect, seed: 37)
    assert_equal a, contours(rect, seed: 37)
    refute_equal a, contours(rect, seed: 38)
  end

  test "one path string per level, each with segments" do
    paths = contours({ x: 0, y: 0, w: 1200, h: 900 }, levels: LEVELS)
    assert_equal LEVELS.size, paths.size
    paths.each { |d| assert_operator segments(d).size, :>, 0 }
  end

  # The bounds of a layout are not whole numbers. A grid that overshoots the
  # requested rectangle by up to a cell would draw past it.
  [{ x: 0, y: 0, w: 1200, h: 900 }, { x: -97.3, y: 12.6, w: 1234.5, h: 777.7 }].each do |rect|
    test "every point lies inside the requested rectangle #{rect.inspect}" do
      contours(rect).each do |d|
        segments(d).flatten(1).each do |x, y|
          assert_operator x, :>=, rect[:x]
          assert_operator x, :<=, rect[:x] + rect[:w]
          assert_operator y, :>=, rect[:y]
          assert_operator y, :<=, rect[:y] + rect[:h]
        end
      end
    end
  end

  test "a 3000 × 3000 field stays under 40,000 segments" do
    count = contours({ x: 0, y: 0, w: 3000, h: 3000 }).sum { |d| segments(d).size }
    assert_operator count, :<, 40_000
  end

  private

  def contours(rect, seed: 37, levels: LEVELS)
    script = <<~JS
      import(#{MODULE_PATH.to_s.to_json}).then((m) => {
        process.stdout.write(JSON.stringify(m.contours(#{rect.to_json}, #{{ seed:, cell: 18, levels: }.to_json})))
      })
    JS
    stdout, stderr, status = Open3.capture3("node", "--input-type=module", "-e", script)
    assert status.success?, "node failed: #{stderr}"
    JSON.parse(stdout)
  end

  # "Mx yLx y" pairs → [[[x, y], [x, y]], …]; anything else in the string fails.
  def segments(d)
    pattern = /M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)L(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/
    assert_equal "", d.gsub(pattern, ""), "unexpected text in a contour path"
    d.scan(pattern).map { |a, b, c, e| [[a.to_f, b.to_f], [c.to_f, e.to_f]] }
  end
end
