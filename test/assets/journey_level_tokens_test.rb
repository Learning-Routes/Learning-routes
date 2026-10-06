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
