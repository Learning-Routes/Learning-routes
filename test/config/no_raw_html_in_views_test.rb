require "test_helper"

# STEP 37 §6. Marking a string html_safe in a view or helper turns off escaping
# for whatever that string holds, so one day it holds user text. The only place
# allowed to do it is svg_icon, which reads a frozen hash of constant SVGs.
# (MarkdownRenderer sanitizes and marks its own output; callers need not.)
class NoRawHtmlInViewsTest < ActiveSupport::TestCase
  RAW = /\.html_safe\b|\braw\(|<%==/

  ALLOWED = {
    "app/helpers/application_helper.rb" => "SVG_ICONS.fetch(name.to_sym).html_safe"
  }.freeze

  test "no view or helper marks a string html_safe outside svg_icon" do
    offenders = Rails.root.glob("{app,engines/*/app}/{views,helpers}/**/*.{erb,rb}").flat_map do |path|
      file = path.relative_path_from(Rails.root).to_s
      # Comments may name the pattern they warn against.
      source = path.read.gsub(/<%#.*?%>/m) { |comment| "\n" * comment.count("\n") }

      source.each_line.with_index(1).filter_map do |line, n|
        next if line.lstrip.start_with?("#") || !line.match?(RAW)
        next if ALLOWED[file] && line.include?(ALLOWED[file])

        "#{file}:#{n} #{line.strip}"
      end
    end

    assert_empty offenders, "#{offenders.size} raw HTML output(s) in views/helpers:\n#{offenders.join("\n")}"
  end

  test "svg_icon returns a known icon and refuses an unknown name" do
    helper = Object.new.extend(ApplicationHelper)

    assert helper.svg_icon(:info).html_safe?
    assert_match(/\A<svg /, helper.svg_icon("info"))
    assert_raises(KeyError) { helper.svg_icon(:nope) }
  end
end
