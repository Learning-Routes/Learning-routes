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
    declares(".jm", "--jm-locked", "color-mix(in srgb, var(--color-muted) 85%, var(--color-card))")
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

  test "in dark, the glass, the sheets and the halo are Ciruela's, not WP-37b's warm browns" do
    dark = 'html[data-theme="dark"] .jm'
    assert_equal "var(--color-bg)", colour_expr("--jm-halo-c", :dark)
    assert_equal "color-mix(in srgb, var(--color-card) 78%, transparent)", colour_expr("--jm-glass", :dark)
    assert_equal "color-mix(in srgb, var(--color-card) 62%, transparent)", colour_expr("--jm-panel", :dark)
    assert_no_match(/rgba\(34, 31, 24|#1F1C16/i, rule(dark), "a warm brown is left in the dark map")
  end

  test "the route's title is Archivo at the display weight, as the reference's root label" do
    declares(".jm-root__title", "font-family", "var(--font-sans)")
    declares(".jm-root__title", "font-weight", "740")
    declares(".jm-root__title", "font-stretch", "112%")
  end

  # Locked reads as "not yet", never as gone: its strokes and lock glyph (the
  # masked dot draws an SVG lock, no text) hold 3:1 on every surface the map
  # puts them on, and stay lighter than an upcoming step's ring.
  test "locked holds 3:1 on card, background and sheet in both themes, lighter than the ring" do
    %i[light dark].each do |theme|
      locked = colour("var(--jm-locked)", theme)
      ring = colour("var(--jm-ring)", theme)
      bg = colour("var(--color-bg)", theme)
      { "card" => colour("var(--color-card)", theme), "bg" => bg,
        "sheet" => over(colour("var(--jm-panel)", theme), bg) }.each do |name, surface|
        ratio = contrast(locked, surface)
        assert_operator ratio, :>=, 3.0, "#{theme}: --jm-locked on the #{name} is #{ratio.round(2)}:1"
      end
      assert_operator contrast(locked, bg), :<, contrast(ring, bg), "#{theme}: locked must read lighter than the ring"
    end
  end

  test "the map's token blocks hold no colour literal but the focus ring" do
    [".jm", 'html[data-theme="dark"] .jm'].each do |selector|
      rule(selector).scan(/(--jm-[a-z-]+):\s*([^;]+);/).each do |token, value|
        next if token == "--jm-focus"

        assert_no_match(/#\h{3,8}\b|rgba?\(/, value, "#{selector} #{token}: #{value.strip} is a literal, not a Ciruela token")
      end
    end
  end

  test "panel and glass are defined once, translucent in both themes" do
    declares(".jm", "--jm-panel", "color-mix(in srgb, var(--color-card) 62%, transparent)")
    declares(".jm", "--jm-glass", "color-mix(in srgb, var(--color-card) 78%, transparent)")
    dark = rule('html[data-theme="dark"] .jm')
    %w[--jm-panel --jm-glass].each { |token| assert_no_match(/#{token}:/, dark, "dark redefines #{token}") }
  end

  test "the popover and the labels are in Archivo" do
    %w[.jm-pop__eyebrow .jm-pop__title .jm-pop__meta .jm-pop__act .jm-node__label].each do |selector|
      declares(selector, "font-family", "var(--font-sans)")
    end
  end

  test "no journey rule names Manrope any more" do
    offenders = CSS.scan(/^([^{}]*\.jm[^{}]*)\{([^{}]*)\}/).select { |_, body| body.include?("Manrope") }.map { |sel, _| sel.strip }
    assert_empty offenders
  end

  private

  # A token's expression in a theme: the dark block wins over .jm.
  def colour_expr(token, theme)
    dark = theme == :dark && rule('html[data-theme="dark"] .jm')[/#{token}:\s*([^;]+);/, 1]
    (dark || rule(".jm")[/#{token}:\s*([^;]+);/, 1]).strip
  end

  # The theme's --color-* hex, as application.css declares it (dark overrides light).
  def token_hex(name, theme)
    light_css, dark_css = CSS.split(/^html\[data-theme="dark"\]\s*\{/, 2)
    dark_css = dark_css.to_s[/\A(.*?)\n\}/m, 1].to_s
    light = light_css.scan(/--color-#{name}:\s*(#\h{6})/).flatten.last
    (theme == :dark && dark_css.scan(/--color-#{name}:\s*(#\h{6})/).flatten.last) || light
  end

  # [r, g, b, alpha] for var(--color-x), var(--jm-x) or color-mix(in srgb, A P%, B|transparent).
  def colour(expr, theme)
    expr = expr.strip
    if (m = expr.match(/\Avar\(--jm-([a-z-]+)\)\z/)) then colour(colour_expr("--jm-#{m[1]}", theme), theme)
    elsif (m = expr.match(/\Avar\(--color-([a-z0-9-]+)\)\z/))
      token_hex(m[1], theme).delete("#").scan(/../).map { |c| c.to_i(16) } + [1.0]
    elsif (m = expr.match(/\Acolor-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+)\)\z/))
      a = colour(m[1], theme)
      p = m[2].to_f / 100
      return a[0, 3] + [p] if m[3].strip == "transparent"

      b = colour(m[3], theme)
      a[0, 3].zip(b[0, 3]).map { |x, y| x * p + y * (1 - p) } + [1.0]
    else
      flunk "cannot evaluate #{expr}"
    end
  end

  def over(top, bottom) = top[0, 3].zip(bottom[0, 3]).map { |t, b| t * top[3] + b * (1 - top[3]) } + [1.0]

  def contrast(a, b)
    lum = ->(c) { c[0, 3].map { |v| v /= 255.0; v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055)**2.4 }
      .zip([0.2126, 0.7152, 0.0722]).sum { |v, w| v * w } }
    hi, lo = [lum.(a), lum.(b)].sort.reverse
    (hi + 0.05) / (lo + 0.05)
  end
end
