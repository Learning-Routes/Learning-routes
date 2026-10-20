require "test_helper"

# WP-37b brief §4.4. The journey layout loads its families from Google Fonts —
# Instrument Serif, Manrope, JetBrains Mono, and since STEP 41 Archivo for the
# popover and the labels — and nothing else. WP-37's `.jm-*`
# rules asked for DM Sans and DM Mono, which that layout never loads, so
# production fell back silently. Every family the map's CSS names must be one
# the layout's link actually fetches.
class JourneyFontsTest < ActiveSupport::TestCase
  CSS = Rails.root.join("app/assets/tailwind/application.css").read
  LAYOUT = Rails.root.join("app/views/layouts/journey.html.erb").read
  GENERIC = %w[serif sans-serif monospace system-ui ui-monospace ui-sans-serif ui-serif inherit].freeze

  # Every rule whose selector names a .jm class, wherever it sits (inside an
  # @media block too): headings and their order do not matter.
  def journey_block
    CSS.gsub(%r{/\*.*?\*/}m, "").scan(/([^{}]+)\{([^{}]*)\}/)
       .select { |selector, _| selector.match?(/\.jm(?:-|\b)/) }
       .map { |_, body| "{#{body}}" }.join("\n")
  end

  def families_named(css)
    lists = css.scan(/font-family:\s*([^;}]+)/).flatten
    # `font:` shorthand: the family list follows the size (and optional /line-height).
    lists += css.scan(/\bfont:\s*[^;}]*?\d+(?:\.\d+)?(?:px|rem|em|%)(?:\s*\/\s*[\d.]+(?:px|rem|em|%)?)?\s+([^;}]+)/).flatten
    lists.flat_map { |l| l.split(",") }.map { |f| f.strip.delete("'\"") }.reject(&:empty?)
         .map { |f| f == "var(--font-sans)" ? sans : f }.uniq
  end

  # The token's first family: what var(--font-sans) asks the browser for.
  def sans = CSS[/--font-sans:\s*["']?([^"',;]+)/, 1]

  def loaded_families
    link = LAYOUT[%r{https://fonts\.googleapis\.com/css2\?[^"]+}]
    assert link, "the journey layout has no Google Fonts link"
    link.scan(/family=([^:&]+)/).flatten.map { |f| f.tr("+", " ") }
  end

  test "every family named in the journey CSS is loaded by the journey layout" do
    named = families_named(journey_block) - GENERIC
    refute_empty named, "the journey block names no font family at all"
    missing = named - loaded_families
    assert_empty missing, "the journey CSS asks for #{missing.join(', ')}, which journey.html.erb never loads"
  end

  test "the layout loads exactly the journey families" do
    assert_equal ["Instrument Serif", "Manrope", "JetBrains Mono", "Archivo"], loaded_families
  end
end
