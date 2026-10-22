require "test_helper"

# STEP 41 §3.2: the lesson page on the foundations. Its views, its section
# partials and the controllers that paint it carried the old palettes as
# literals (indigo and violet, emerald, amber, the cream theme's warm browns
# and Tailwind's palette classes). Every colour on the page is now a token.
class LessonPaletteTest < ActiveSupport::TestCase
  STEPS = "engines/learning_routes_engine/app/views/learning_routes_engine/steps"
  FILES = [
    "app/views/layouts/learning.html.erb",
    "#{STEPS}/*.erb",
    "#{STEPS}/lesson_sections/*.erb",
    "app/javascript/controllers/{interactive_lesson,lesson_*}_controller.js"
  ].freeze
  LITERAL = /rgba?\(\s*\d|#(?:\h{8}|\h{6})\b|#\h{3}\b(?![\w-])|\b(?:bg|text|ring|accent|border|from|to|fill|stroke)-(?:indigo|violet|purple|blue|green|emerald|amber|orange|red|gray|slate|yellow)-\d{2,3}\b/
  # The old palette's tokens: cream theme's dark surfaces, the violet highlight, indigo progress.
  OLD_TOKENS = /--color-(?:dark(?:-[a-z]+)?|highlight-violet|step-progress-(?:bg|icon)|tint(?:-strong|-hover)?)\b/

  test "the lesson page's files name no literal colour and no old-palette token" do
    offenders = FILES.flat_map { |g| Dir[Rails.root.join(g)] }.sort.flat_map do |path|
      File.readlines(path).each_with_index.filter_map do |line, i|
        next unless line.match?(LITERAL) || line.match?(OLD_TOKENS)

        "#{Pathname(path).relative_path_from(Rails.root)}:#{i + 1}: #{line.strip[0, 120]}"
      end
    end
    assert_empty offenders, "#{offenders.size} literal or old-palette colours:\n#{offenders.first(40).join("\n")}"
  end

  # The lesson's rules in application.css, LESSON NAV to the wizard. Two kinds
  # stay literal on purpose: token definitions, and the code blocks' editor
  # theme (syntax colours on a fixed dark panel, in both themes).
  test "the lesson's CSS names no literal colour and no old-palette token" do
    css = Rails.root.join("app/assets/tailwind/application.css").read
    block = css[/LESSON NAV.*?(?=ROUTE WIZARD)/m].gsub(%r{/\*.*?\*/}m, "")
    offenders = block.scan(/([^{}]+)\{([^{}]*)\}/).flat_map do |selector, body|
      next [] if selector.include?(".code-block")

      body.split(";").map(&:strip).reject { |d| d.start_with?("--") }
          .select { |d| d.match?(LITERAL) || d.match?(OLD_TOKENS) }
          .map { |d| "#{selector.strip}: #{d}" }
    end
    assert_empty offenders, "#{offenders.size} literal or old-palette colours:\n#{offenders.first(40).join("\n")}"
  end
end
