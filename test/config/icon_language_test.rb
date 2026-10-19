require "test_helper"

# STEP 41 §1.3: one icon language, through svg_icon. A 24px grid, a 1.75-2
# stroke, round caps and joins. The layouts and shared partials draw no icon
# of their own; the logo is a mark, not an icon.
class IconLanguageTest < ActiveSupport::TestCase
  test "every svg_icon is on the 24px grid with a 1.75-2 round stroke" do
    helper = ApplicationController.helpers

    ApplicationHelper::SVG_ICONS.each_key do |name|
      [16, 24].each do |size|
        svg = Nokogiri::HTML5.fragment(helper.svg_icon(name, size: size)).at("svg")

        assert_equal "0 0 24 24", svg["viewbox"] || svg["viewBox"], name
        assert_includes 1.75..2.0, svg["stroke-width"].to_f, "#{name} at #{size}px"
        assert_equal %w[round round], [svg["stroke-linecap"], svg["stroke-linejoin"]], name
        assert_equal size.to_s, svg["width"], name
      end
    end
  end

  test "layouts and shared partials draw their icons with svg_icon" do
    files = Dir[Rails.root.join("app/views/{layouts,shared}/*.erb")]
      .reject { |path| path.include?("mailer") || path.end_with?("_logo.html.erb") }
    offenders = files.select { |path| File.read(path).include?("<svg") }
      .map { |path| Pathname(path).relative_path_from(Rails.root).to_s }

    assert_empty offenders
  end
end
