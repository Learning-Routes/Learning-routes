require "test_helper"

# STEP 41 §3 (reviewer, 22 Oct): in dark the profile's header card, stat tiles
# and learning-profile card rendered #1F1B1A, the cream theme's warm brown:
# --color-card-glass was still rgba(34, 31, 24, 0.75). The token blocks (@theme,
# :root, the dark theme) hold none of the old palette's literals; they derive
# from Ciruela's tokens. The paused status's amber is its own and stays.
class TokenBlocksCiruelaTest < ActiveSupport::TestCase
  OLD = /rgba\(\s*(?:34,\s*31,\s*24|28,\s*24,\s*18|240,\s*235,\s*226)\s*,|#1A1710\b|#FAF8F3\b/i

  test "the token blocks hold no literal of the old warm palette" do
    css = Rails.root.join("app/assets/tailwind/application.css").read
    blocks = css.scan(/^(?:@theme|:root|html\[data-theme="dark"\])\s*\{.*?^\}/m)
    refute_empty blocks
    offenders = blocks.join("\n").lines.select { |l| l.match?(OLD) }.map(&:strip)
    assert_empty offenders
  end

  test "the card glass is the card, made translucent, in both themes" do
    css = Rails.root.join("app/assets/tailwind/application.css").read
    values = css.scan(/--color-card-glass:\s*([^;]+);/).flatten.map(&:strip)
    assert_equal 2, values.size, "light and dark"
    values.each { |v| assert_match(/\Acolor-mix\(in srgb, var\(--color-card\) \d+%, transparent\)\z/, v) }
  end
end
