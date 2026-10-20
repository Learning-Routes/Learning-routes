require "test_helper"

# STEP 41: the journey map draws in Ciruela, not WP-37b's greens. Its tones are
# the app's tokens, so light and dark both follow application.css; the shapes
# do not change.
class JourneyCiruelaTest < ActiveSupport::TestCase
  CSS = Rails.root.join("app/assets/tailwind/application.css").read.gsub(%r{/\*.*?\*/}m, "")

  def rule(selector)
    body = CSS[/^#{Regexp.escape(selector)}\s*\{([^{}]*)\}/m, 1]
    assert body, "no rule for #{selector}"
    body
  end

  def declares(selector, property, value)
    assert_match(/#{Regexp.escape(property)}:\s*#{Regexp.escape(value)}\s*[;}]/, rule(selector).to_s + ";",
                 "#{selector} should set #{property}: #{value}")
  end

  test "route and done steps are the accent, whatever the level" do
    %w[nv1 nv2 nv3].each { |level| declares(".jm", "--color-node-#{level}", "var(--color-accent)") }
    # The top bar's progress line lives in the layout, outside .jm.
    declares(".jm-counter__fill", "background", "var(--color-accent)")
  end

  test "reinforcement, upcoming and locked outlines and terrain are tokens, in both themes" do
    declares(".jm", "--jm-reinf", "var(--color-reinforce)")
    declares(".jm", "--jm-ring", "var(--color-muted)")
    declares(".jm", "--jm-locked", "var(--color-faint)")
    declares(".jm", "--jm-contour", "var(--color-border-subtle)")
    dark = rule('html[data-theme="dark"] .jm')
    %w[--jm-reinf --jm-ring --jm-locked --jm-contour].each do |token|
      assert_no_match(/#{token}:/, dark, "dark must not override #{token}: the token carries both themes")
    end
  end

  test "the current step's ring is the highlight" do
    ring = rule(".jm-node--current:not(.jm-node--completed) .jm-node__dot")
    assert_includes ring, "0 0 0 6.5px var(--color-highlight)"
    assert_includes rule(".jm-node__orbit"), "var(--color-highlight) 78%"
    assert_includes rule(".jm-legend__mark--current"), "var(--color-highlight)"
  end

  test "chips sit on the soft accent" do
    declares(".jm-chip", "background", "var(--color-accent-soft)")
  end

  test "the popover and the labels are in Archivo" do
    %w[.jm-pop__eyebrow .jm-pop__title .jm-pop__meta .jm-pop__act .jm-node__label].each do |selector|
      declares(selector, "font-family", "var(--font-sans)")
    end
  end
end
