require "test_helper"

# WP-37 §3.6. The level colours were fixed hex in RoutesController::LEVEL_COLORS
# and never changed with the theme. They are tokens now, defined for BOTH themes;
# their contrast is measured by test/system/journey_map_test.rb.
class JourneyLevelTokensTest < ActiveSupport::TestCase
  CSS = Rails.root.join("app/assets/tailwind/application.css").read
  DARK = CSS[/html\[data-theme="dark"\]\s*\{(.*?)\n\}/m, 1]
  # Split on the selector WITH its brace, so prose that names the selector
  # (a comment) cannot move the boundary.
  LIGHT = CSS.split(/^html\[data-theme="dark"\]\s*\{/).first

  %w[nv1 nv2 nv3].each do |level|
    test "--color-node-#{level} is defined in both themes, differently" do
      light = LIGHT[/--color-node-#{level}:\s*([^;]+);/, 1]
      dark = DARK.to_s[/--color-node-#{level}:\s*([^;]+);/, 1]

      assert light, "no light value for --color-node-#{level}"
      assert dark, "no dark value for --color-node-#{level}: the colour would not change with the theme"
      refute_equal light.strip, dark.strip
    end
  end

  # Tailwind 4 drops @theme variables it never sees written literally, and the
  # journey builds these names at runtime (`var(--color-node-${level})`). The
  # light values must therefore live in a plain :root block, and the COMPILED
  # CSS — what the browser gets — must carry every value in both themes.
  test "the light values sit in a plain :root block, not in @theme" do
    theme_block = CSS[/@theme\s*\{(.*?)\n\}/m, 1].to_s
    %w[nv1 nv2 nv3].each do |level|
      refute_match(/--color-node-#{level}:/, theme_block,
                   "--color-node-#{level} in @theme is tree-shaken unless its name appears literally somewhere")
    end
    roots = LIGHT.scan(/^:root\s*\{(.*?)\n\}/m).flatten.join
    %w[nv1 nv2 nv3].each { |level| assert_match(/--color-node-#{level}:/, roots) }
  end

  test "the compiled CSS carries every level value in both themes" do
    built = Rails.root.join("app/assets/builds/tailwind.css").read.downcase
    %w[nv1 nv2 nv3].each do |level|
      [LIGHT, DARK.to_s].each do |source|
        value = source[/--color-node-#{level}:\s*([^;]+);/, 1].to_s.strip.downcase
        assert_includes built, "--color-node-#{level}:#{value}", "the browser never receives --color-node-#{level}: #{value}"
      end
    end
  end

  test "the three levels are distinguishable in each theme" do
    light = %w[nv1 nv2 nv3].map { |l| LIGHT[/--color-node-#{l}:\s*([^;]+);/, 1].to_s.strip }
    assert_equal 3, light.uniq.size, "every level is #{light.first}: the level tag carries no information"
    dark = %w[nv1 nv2 nv3].map { |l| DARK.to_s[/--color-node-#{l}:\s*([^;]+);/, 1].to_s.strip }
    assert_equal 3, dark.uniq.size
  end

  # WP-37b brief §4.3. The terrain is texture, never a line competing with the
  # route. STEP 41 draws it in --color-border-subtle, opaque, so faint is
  # measured: at most 1.4:1 on the map's background in each theme.
  JOURNEY_LIGHT = CSS[/^\.jm\s*\{(.*?)\}/m, 1].to_s
  JOURNEY_DARK = CSS[/^html\[data-theme="dark"\] \.jm\s*\{(.*?)\}/m, 1].to_s

  test "the terrain stays faint in both themes" do
    assert_equal "var(--color-border-subtle)", JOURNEY_LIGHT[/--jm-contour:\s*([^;]+);/, 1]
    { "light" => LIGHT, "dark" => DARK.to_s }.each do |theme, block|
      line, bg = %w[border-subtle bg].map { |t| block.scan(/--color-#{t}:\s*(#\h{6})/).flatten.last }
      ratio = contrast(line, bg)
      assert_operator ratio, :<=, 1.4, "the terrain reads #{ratio.round(2)}:1 on #{theme}: lines, not texture"
    end
  end

  # A token set to a --color-* token follows the theme through it (STEP 41);
  # every other one needs its own dark value.
  test "every journey token is defined in both themes" do
    light = JOURNEY_LIGHT.scan(/(--jm-[a-z-]+):\s*([^;]+);/).reject { |_, v| v.strip.match?(/\Avar\(--color-[a-z0-9-]+\)\z/) }.map(&:first)
    dark = JOURNEY_DARK.scan(/(--jm-[a-z-]+):/).flatten.uniq
    refute_empty light
    assert_equal light.sort, dark.sort, "a --jm- token exists in one theme only"
  end

  private

  def contrast(a, b)
    lum = ->(hex) { hex.delete("#").scan(/../).map { |c| c.to_i(16) / 255.0 }
      .map { |c| c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055)**2.4 }.zip([0.2126, 0.7152, 0.0722]).sum { |c, w| c * w } }
    hi, lo = [lum.(a), lum.(b)].sort.reverse
    (hi + 0.05) / (lo + 0.05)
  end
end
