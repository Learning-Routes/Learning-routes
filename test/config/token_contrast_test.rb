require "test_helper"

# STEP 41 §1.4: the pairs every page is built from read at 4.5:1 or more, in
# both themes, with the values application.css actually declares.
class TokenContrastTest < ActiveSupport::TestCase
  PAIRS = [%w[txt bg], %w[txt card], %w[sub card], %w[accent-text accent], %w[link card]].freeze
  # The owner's answers on PR #87 (19 Oct): these hold on both surfaces, text
  # at 4.5:1, the step-completed icon (a UI part) at 3:1. --color-highlight is
  # left out on purpose: it always sits next to its words (Estás aquí, the
  # streak count), so it is never the only cue (docs/design/palette.md).
  ON_SURFACES = {
    "badge-assessment-text" => 4.5, "badge-exercise-text" => 4.5, "due-link" => 4.5, "positive" => 4.5,
    "warning" => 4.5, "negative" => 4.5, "flash-alert-text" => 4.5, "section-audio-active" => 4.5,
    "status-completed-text" => 4.5, "status-paused-text" => 4.5, "reinforce" => 4.5, "step-completed-icon" => 3.0
  }.freeze

  test "text pairs read at 4.5:1 in light and dark" do
    tokens = self.class.tokens

    %i[light dark].each do |theme|
      PAIRS.each do |fg, bg|
        ratio = contrast(tokens[theme].fetch(fg), tokens[theme].fetch(bg))
        assert_operator ratio, :>=, 4.5, "#{theme}: --color-#{fg} on --color-#{bg} is #{ratio.round(2)}:1"
      end
    end
  end

  test "status, feedback and badge colours read on card and bg in light and dark" do
    tokens = self.class.tokens

    %i[light dark].each do |theme|
      ON_SURFACES.each do |token, need|
        %w[card bg].each do |surface|
          ratio = contrast(tokens[theme].fetch(token), tokens[theme].fetch(surface))
          assert_operator ratio, :>=, need, "#{theme}: --color-#{token} on --color-#{surface} is #{ratio.round(2)}:1"
        end
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
