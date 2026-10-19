require "test_helper"

# STEP 41 §1.4: the pairs every page is built from read at 4.5:1 or more, in
# both themes, with the values application.css actually declares.
class TokenContrastTest < ActiveSupport::TestCase
  PAIRS = [%w[txt bg], %w[txt card], %w[sub card], %w[accent-text accent], %w[link card]].freeze

  test "text pairs read at 4.5:1 in light and dark" do
    tokens = self.class.tokens

    %i[light dark].each do |theme|
      PAIRS.each do |fg, bg|
        ratio = contrast(tokens[theme].fetch(fg), tokens[theme].fetch(bg))
        assert_operator ratio, :>=, 4.5, "#{theme}: --color-#{fg} on --color-#{bg} is #{ratio.round(2)}:1"
      end
    end
  end

  # Light is every top-level @theme / :root declaration; dark overrides it in
  # html[data-theme="dark"] blocks.
  def self.tokens
    light = {}
    dark = {}
    scope = nil
    Rails.root.join("app/assets/tailwind/application.css").each_line do |line|
      case line
      when /\A(@theme|:root) \{/ then scope = light
      when /\Ahtml\[data-theme="dark"\] \{/ then scope = dark
      when /\A\}/ then scope = nil
      end
      next unless scope && (match = line.match(/\A\s+--color-([a-z0-9-]+):\s*(#\h{6})\s*;/))

      scope[match[1]] = match[2]
    end
    { light: light, dark: light.merge(dark) }
  end

  private

  def contrast(a, b)
    la, lb = [a, b].map { |hex| luminance(hex) }.sort.reverse
    (la + 0.05) / (lb + 0.05)
  end

  def luminance(hex)
    r, g, b = hex.delete("#").scan(/../).map { |c| c.to_i(16) / 255.0 }
      .map { |c| c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055)**2.4 }
    (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
  end
end
