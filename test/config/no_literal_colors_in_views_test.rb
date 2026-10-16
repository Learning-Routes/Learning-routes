require "test_helper"

# STEP 38 §3. Every colour a page shows comes from the token set in
# app/assets/tailwind/application.css (--color-*), which has a dark value for
# each. A literal hex in a view is the same colour in both themes, and that is
# how the dark theme got "colores y paletas que no están bien".
class NoLiteralColorsInViewsTest < ActiveSupport::TestCase
  # #RGB, #RGBA, #RRGGBB and #RRGGBBAA.
  HEX = /#(?:\h{8}|\h{6}|\h{4}|\h{3})\b/

  # Where a literal is the right thing, and why:
  EXEMPT = {
    # Mail clients do not support CSS custom properties.
    %r{(_mailer/|layouts/mailer)} => "mail",
    # The web app manifest is JSON the OS reads; it has no CSS.
    %r{\Aapp/views/pwa/manifest\.json\.erb\z} => "manifest",
    # The browser bar reads <meta name="theme-color">, not CSS: one value per
    # colour scheme (STEP 38 §3, owner's answer 5).
    %r{\Aapp/views/shared/_theme_color\.html\.erb\z} => "browser bar",
    # Google's sign-in mark must keep Google's colours.
    %r{\Aengines/core/app/views/core/shared/_google_logo\.html\.erb\z} => "brand mark"
  }.freeze

  test "no view carries a literal hex colour" do
    offenders = Rails.root.glob("{app,engines/*/app}/views/**/*.erb").flat_map do |path|
      file = path.relative_path_from(Rails.root).to_s
      next [] if EXEMPT.keys.any? { |pattern| file.match?(pattern) }

      path.read.each_line.with_index(1).flat_map do |line, n|
        line.gsub(/&#x?\h+;/, "").scan(HEX).map { |hex| "#{file}:#{n} #{hex}" }
      end
    end

    assert_empty offenders, "#{offenders.size} literal hex colour(s) in views; use a --color-* token:\n#{offenders.first(40).join("\n")}"
  end
end
