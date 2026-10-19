require "test_helper"
require "json"
require "open3"

# STEP 41 §1.3: a card you can act on tilts towards the pointer, at most 3°,
# and its highlight follows the pointer. Pure, like the journey modules.
class CardTiltTest < ActiveSupport::TestCase
  MODULE_PATH = Rails.root.join("app/javascript/lib/card_tilt.js")

  test "the centre is flat, with the highlight on it" do
    assert_equal({ "rx" => 0, "ry" => 0, "mx" => 50, "my" => 50 }, call("tiltFor", 0.5, 0.5))
  end

  test "the corners lean towards the pointer, never past 3 degrees" do
    top_right = call("tiltFor", 1, 0)
    bottom_left = call("tiltFor", 0, 1)

    assert_equal [2.5, 3], top_right.values_at("rx", "ry")
    assert_equal [-2.5, -3], bottom_left.values_at("rx", "ry")
  end

  test "a pointer outside the card counts as its edge" do
    assert_equal call("tiltFor", 1, 0), call("tiltFor", 1.4, -0.3)
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
end
